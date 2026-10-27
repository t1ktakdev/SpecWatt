"""Property-based invariants over randomised valid usage sequences.

The properties encode security/docs/invariants.md. Any random but *valid*
sequence of user operations must keep them:

  P1  CH3 stays protected at 2.4 W no matter what the user does.
  P2  Command-driven state changes never exceed the configured peak; any
      state stays within the hard physical bound of 8.4 W and every channel
      sits at 0 W or its nominal value.
  P3  When a sample is stale, the API reports unknown power instead of
      inventing numbers (watts/total are null, last-known is retained).
  P4  After a completed step call no command is left in 'sent'.
  P5  Every command starts life as 'requested'; statuses stay in the known set.
  P6  No command for CH3 is ever anything but rejected.

Note on P2: peak_watts is a command admission limit, not a law of physics —
an authoritative telemetry sample may legitimately report a total above the
configured peak (a misconfiguration does not falsify measurements). Therefore
the peak assertion applies only after command-driven changes; the physical
bound applies always.

Uses hypothesis when available (installed via security/requirements-tools.txt);
each example gets a fresh Lab so the per-instance rate-limit budget is never
exhausted.
"""
import random
import unittest

from support import Lab, bearer, NOMINAL

try:
    from hypothesis import given, settings, strategies as st
    HYPOTHESIS = True
except ImportError:  # pragma: no cover - CI installs hypothesis
    HYPOTHESIS = False

TERMINAL = {
    "requested", "sent", "acknowledged", "rejected", "timeout",
    "transport-error", "reconciled", "cancelled",
}
STEP_OUTCOMES = ["acknowledged", "timeout", "transport-error"]
PEAKS = [2.4, 5.0, 6.6, 7.0, 8.4]
SAMPLES = [
    {"CH1": 0.0, "CH2": 0.0, "CH3": 2.4},
    {"CH1": 1.8, "CH2": 0.0, "CH3": 2.4},
    {"CH1": 0.0, "CH2": 4.2, "CH3": 2.4},
    {"CH1": 1.8, "CH2": 4.2, "CH3": 2.4},
]
PHYSICAL_MAX = sum(NOMINAL.values())


def build_lab():
    lab = Lab()
    token = lab.register("property@example.test")
    cid = lab.controller(token)
    return lab, token, cid


def check_invariants(lab, token, cid, peak_after_command_change=None):
    snapshot = lab.snapshot(token, cid)
    channels = {row["id"]: row for row in snapshot["channels"]}
    ch3 = channels["CH3"]
    assert ch3["protected"] is True, "P1: CH3 lost protection"
    assert ch3["last_known_watts"] == 2.4, "P1: CH3 power changed"
    if snapshot["freshness"] == "fresh":
        total = snapshot["total_watts"]
        assert total is not None, "P2: fresh sample without total"
        assert total <= PHYSICAL_MAX + 1e-6, f"P2: total {total} above 8.4 W"
        for channel_id, row in channels.items():
            assert row["watts"] in (0.0, NOMINAL[channel_id]), (
                f"P2: {channel_id} at {row['watts']}"
            )
        assert abs(total - sum(row["watts"] for row in channels.values())) < 0.05
        if peak_after_command_change is not None:
            assert total <= peak_after_command_change + 1e-6, (
                f"P2: command changed state to {total} W above peak "
                f"{peak_after_command_change}"
            )
    else:
        assert snapshot["total_watts"] is None, "P3: stale sample shows a total"
        for row in channels.values():
            assert row["watts"] is None, "P3: stale sample shows channel watts"
    commands = lab.client.get(
        f"/v1/controllers/{cid}/commands?limit=200", headers=bearer(token)
    ).json()
    for command in commands:
        assert command["status"] in TERMINAL, f"P5: unknown status {command['status']}"
        # Fresh commands start as 'requested'; immediately-rejected ones carry
        # a single 'rejected' transition recorded at admission time.
        assert command["transitions"][0]["status"] in ("requested", "rejected"), (
            "P5: command did not start as requested"
        )
        assert command["status"] != "sent", "P4: command lingered in 'sent'"
        if command["channel_id"] == "CH3":
            assert command["status"] == "rejected", "P6: CH3 command was not rejected"


def apply_op(lab, token, cid, op, counter):
    """Apply one operation. Returns (dispatched_ack, was_turn_on):
    dispatched_ack=True when this op acknowledged a pending command."""
    kind = op[0]
    if kind == "command":
        _, channel, on, origin = op
        counter[0] += 1
        response = lab.command(token, cid, channel=channel, on=on,
                               key=f"prop-{counter[0]:04d}", origin=origin)
        requested = (response.status_code == 200
                     and response.json()["status"] == "requested")
        return (False, on) if requested else (False, None)
    if kind == "step":
        response = lab.step(token, cid, outcome=op[1])
        dispatched = (response.status_code == 200
                      and op[1] == "acknowledged"
                      and response.json()["processed"] > 0)
        return (dispatched, None)
    if kind == "telemetry":
        lab.client.post(
            f"/v1/controllers/{cid}/simulator/telemetry",
            headers=bearer(token), json={"channels": op[1]},
        )
        return (False, None)
    if kind == "settings":
        lab.client.patch(
            f"/v1/controllers/{cid}/settings", headers=bearer(token),
            json={"peak_watts": op[1], "manual_priority_minutes": 5},
        )
        return (False, None)
    if kind == "assign":
        _, channel, allow = op
        assert channel != "CH3" or allow is False
        lab.client.patch(
            f"/v1/controllers/{cid}/channels/{channel}/assignment",
            headers=bearer(token),
            json={"name": "Load", "room": "Lab", "image": "socket",
                  "allow_auto": allow},
        )
        return (False, None)
    raise AssertionError(f"unknown op {op}")


if HYPOTHESIS:
    ops_strategy = st.lists(
        st.one_of(
            st.tuples(st.just("command"), st.sampled_from(["CH1", "CH2"]),
                      st.booleans(),
                      st.sampled_from(["manual", "autopilot", "schedule"])),
            st.tuples(st.just("step"), st.sampled_from(STEP_OUTCOMES)),
            st.tuples(st.just("telemetry"), st.sampled_from(SAMPLES)),
            st.tuples(st.just("settings"), st.sampled_from(PEAKS)),
            st.tuples(st.just("assign"), st.sampled_from(["CH1", "CH2"]),
                      st.booleans()),
        ),
        max_size=24,
    )

    class PropertyInvariants(unittest.TestCase):
        @settings(max_examples=25, deadline=None, print_blob=True)
        @given(ops=ops_strategy)
        def test_valid_sequences_preserve_invariants(self, ops):
            lab, token, cid = build_lab()
            try:
                counter = [0]
                pending_on = None
                for op in ops:
                    peak_before = lab.snapshot(token, cid)["peak_watts"]
                    dispatched_ack, was_on = apply_op(lab, token, cid, op, counter)
                    check_peak = None
                    if op[0] == "step":
                        # Any step consumes the dispatch opportunity; only a
                        # fresh command request re-arms the ON-command check.
                        if dispatched_ack and pending_on:
                            check_peak = peak_before
                        pending_on = None
                    elif op[0] == "command" and was_on is not None:
                        pending_on = was_on
                    check_invariants(lab, token, cid,
                                     peak_after_command_change=check_peak)
            finally:
                lab.close()
else:
    class PropertyInvariants(unittest.TestCase):
        def test_hypothesis_missing_suite_skipped(self):
            self.skipTest("hypothesis is not installed")


class DeterministicInvariantWalk(unittest.TestCase):
    """A fixed-seed walk; also the fallback when hypothesis is unavailable."""

    def test_seeded_random_walk_preserves_invariants(self):
        rng = random.Random(20261027)
        for chunk in range(3):
            lab, token, cid = build_lab()
            try:
                counter = [chunk * 1000]
                pending_on = None
                for _ in range(20):
                    roll = rng.random()
                    if roll < 0.35:
                        op = ("command", rng.choice(["CH1", "CH2"]),
                              rng.random() < 0.5,
                              rng.choice(["manual", "autopilot", "schedule"]))
                    elif roll < 0.55:
                        op = ("step", rng.choice(STEP_OUTCOMES))
                    elif roll < 0.75:
                        op = ("telemetry", rng.choice(SAMPLES))
                    elif roll < 0.9:
                        op = ("settings", rng.choice(PEAKS))
                    else:
                        op = ("assign", rng.choice(["CH1", "CH2"]),
                              rng.random() < 0.5)
                    peak_before = lab.snapshot(token, cid)["peak_watts"]
                    dispatched_ack, was_on = apply_op(lab, token, cid, op, counter)
                    check_peak = None
                    if op[0] == "step":
                        if dispatched_ack and pending_on:
                            check_peak = peak_before
                        pending_on = None
                    elif op[0] == "command" and was_on is not None:
                        pending_on = was_on
                    check_invariants(lab, token, cid,
                                     peak_after_command_change=check_peak)
            finally:
                lab.close()


if __name__ == "__main__":
    unittest.main()
