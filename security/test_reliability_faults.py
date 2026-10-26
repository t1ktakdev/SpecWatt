"""Fault injection and recovery: lost acknowledgements, restarts, bad telemetry.

Scenarios from the SpecWATT reliability brief, plus additional cases derived
from code review. All fault injection is local and reversible: temporary
databases, in-process apps, monkeypatched transitions. No hardware exists on
this path.
"""
import unittest
import uuid

from support import Lab, bearer, NOMINAL
import specwatt_api.app as app_module


class ScenarioATests(unittest.TestCase):
    """A: the link drops before an acknowledgement arrives."""

    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("owner@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def assert_uncertain(self, snapshot):
        self.assertEqual(snapshot["freshness"], "stale")
        self.assertIsNone(snapshot["total_watts"])
        for channel in snapshot["channels"]:
            self.assertIsNone(channel["watts"])
            self.assertIsNotNone(channel["last_known_watts"])

    def test_timeout_reports_unknown_state_and_blocks_actuation(self):
        requested = self.lab.command(self.owner, self.cid, channel="CH1",
                                     on=False, key="lost-ack-01")
        self.assertEqual(requested.json()["status"], "requested")
        step = self.lab.step(self.owner, self.cid, outcome="timeout")
        self.assertEqual(step.status_code, 200)
        self.assert_uncertain(step.json()["snapshot"])
        command = self.lab.client.get(
            self.base + "/commands/" + requested.json()["id"],
            headers=bearer(self.owner),
        ).json()
        self.assertEqual(command["status"], "timeout")
        # No blind resend: a repeat of the same key returns the stored record.
        self.assertEqual(
            self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                             key="lost-ack-01").json()["status"],
            "timeout",
        )
        # New commands are refused while state is uncertain.
        blocked = self.lab.command(self.owner, self.cid, channel="CH1",
                                   on=True, key="during-uncertainty")
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["detail"]["code"], "stale_measurements")
        # A later step must not resurrect the timed-out command.
        self.assertEqual(self.lab.step(self.owner, self.cid).json()["processed"], 0)
        stale = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(stale["channels"][0]["last_known_watts"], 1.8)
        self.assertIsNone(stale["channels"][0]["watts"])

    def test_transport_error_same_uncertainty_guarantees(self):
        # CH2 off stays below the peak; the actuation path is what matters.
        requested = self.lab.command(self.owner, self.cid, channel="CH2",
                                     on=False, key="lost-ack-02")
        self.assertEqual(requested.status_code, 200)
        step = self.lab.step(self.owner, self.cid, outcome="transport-error")
        self.assertEqual(step.status_code, 200)
        self.assert_uncertain(step.json()["snapshot"])
        command = self.lab.client.get(
            self.base + "/commands/" + requested.json()["id"],
            headers=bearer(self.owner),
        ).json()
        self.assertEqual(command["status"], "transport-error")
        stale = step.json()["snapshot"]
        self.assertEqual(stale["channels"][1]["last_known_watts"], 0.0)
        self.assertIsNone(stale["channels"][1]["watts"])

    def test_reconciliation_never_replays_only_reports(self):
        requested = self.lab.command(self.owner, self.cid, channel="CH1",
                                     on=False, key="reconcile-01")
        self.lab.step(self.owner, self.cid, outcome="timeout")
        mismatch = self.lab.client.post(
            self.base + "/simulator/telemetry", headers=bearer(self.owner),
            json={"channels": {"CH1": 1.8, "CH2": 0, "CH3": 2.4}},
        )
        self.assertEqual(mismatch.status_code, 200)
        command = self.lab.client.get(
            self.base + "/commands/" + requested.json()["id"],
            headers=bearer(self.owner),
        ).json()
        self.assertEqual(command["status"], "reconciled")
        self.assertEqual(command["reason"], "target_not_reached")
        # The load did not change just because telemetry arrived.
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 4.2)


class ScenarioCTests(unittest.TestCase):
    """C: the server restarts after a command was stored."""

    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("restart@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def test_requested_command_survives_restart_and_executes_once(self):
        requested = self.lab.command(self.owner, self.cid, channel="CH1",
                                     on=False, key="restart-key-01")
        self.assertEqual(requested.json()["status"], "requested")
        self.lab.reopen()
        self.assertEqual(self.lab.client.get("/health").status_code, 200)
        # A restart alone must not actuate anything.
        snapshot = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(snapshot["channels"][0]["watts"], 1.8)
        self.assertEqual(snapshot["total_watts"], 4.2)
        # The stored command can still be dispatched exactly once.
        step = self.lab.step(self.owner, self.cid)
        self.assertEqual(step.json()["processed"], 1)
        command = self.lab.client.get(
            self.base + "/commands/" + requested.json()["id"],
            headers=bearer(self.owner),
        ).json()
        self.assertEqual(command["status"], "acknowledged")
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 2.4)
        again = self.lab.step(self.owner, self.cid)
        self.assertEqual(again.json()["processed"], 0)

    def test_idempotency_bookkeeping_survives_restart(self):
        key = "restart-idem-001"
        first = self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                                 key=key)
        self.lab.reopen()
        replay = self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                                  key=key)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["id"], first.json()["id"])
        conflict = self.lab.command(self.owner, self.cid, channel="CH1", on=True,
                                    key=key)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["detail"]["code"], "idempotency_conflict")

    def test_in_flight_guard_survives_restart(self):
        self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                         key="restart-guard")
        self.lab.reopen()
        second = self.lab.command(self.owner, self.cid, channel="CH2", on=False,
                                  key="restart-guard-2")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["detail"]["code"], "command_in_flight")

    def test_rate_limit_budget_resets_on_restart(self):
        """Pins the documented limitation: limiter state is per-process."""
        payload = {"email": "restart@example.test", "password": "no-such-pass-1"}
        for _ in range(10):
            self.lab.client.post("/v1/auth/login", json=payload)
        self.assertEqual(self.lab.client.post("/v1/auth/login", json=payload).status_code,
                         429)
        self.lab.reopen()
        self.assertEqual(self.lab.client.post("/v1/auth/login", json=payload).status_code,
                         401)


class CrashAtomicityTests(unittest.TestCase):
    """A crash between 'sent' and the acknowledgement must not half-apply."""

    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("crash@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def test_injected_crash_during_dispatch_rolls_back_cleanly(self):
        original = app_module.transition

        def crashing_transition(db, command, status, reason=None):
            if status == "acknowledged":
                raise RuntimeError("injected dispatch crash")
            return original(db, command, status, reason)

        requested = self.lab.command(self.owner, self.cid, channel="CH1",
                                     on=False, key="crash-key-01")
        self.assertEqual(requested.status_code, 200)
        app_module.transition = crashing_transition
        try:
            response = self.lab.step(self.owner, self.cid)
        finally:
            app_module.transition = original
        self.assertEqual(response.status_code, 500)
        # Rollback: the command is still 'requested', the load is unchanged and
        # no half-committed 'sent' row exists.
        rows = self.lab.query(
            "SELECT status FROM commands WHERE controller_id=?", (self.cid,)
        )
        self.assertEqual([row[0] for row in rows], ["requested"])
        snapshot = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(snapshot["channels"][0]["watts"], 1.8)
        self.assertEqual(snapshot["total_watts"], 4.2)
        # The very same command then completes normally.
        step = self.lab.step(self.owner, self.cid)
        self.assertEqual(step.status_code, 200)
        command = self.lab.client.get(
            self.base + "/commands/" + requested.json()["id"],
            headers=bearer(self.owner),
        ).json()
        self.assertEqual(command["status"], "acknowledged")
        self.assertEqual(
            [entry["status"] for entry in command["transitions"]],
            ["requested", "sent", "acknowledged"],
        )

    def test_no_command_lingers_in_sent_after_completed_step(self):
        for index, outcome in enumerate(("acknowledged", "timeout",
                                         "transport-error")):
            self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                             key=f"limbo-{index}")
            self.lab.step(self.owner, self.cid, outcome=outcome)
            rows = self.lab.query(
                "SELECT status FROM commands WHERE controller_id=? AND status='sent'",
                (self.cid,),
            )
            self.assertEqual(rows, [])


class ScenarioDTests(unittest.TestCase):
    """D: stale, future-dated or malformed telemetry must not be trusted."""

    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("telemetry@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def test_future_dated_sample_is_stale(self):
        with self.lab.db() as conn:
            conn.execute(
                "UPDATE controllers SET measured_at=measured_at+3600 WHERE id=?",
                (self.cid,),
            )
        snapshot = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(snapshot["freshness"], "stale")
        self.assertIsNone(snapshot["total_watts"])
        blocked = self.lab.command(self.owner, self.cid, channel="CH1",
                                   on=False, key="future-sample")
        self.assertEqual(blocked.json()["detail"]["code"], "stale_measurements")

    def test_stale_sample_keeps_last_known_values_not_zeroes(self):
        initial = {"CH1": 1.8, "CH2": 0.0, "CH3": 2.4}
        with self.lab.db() as conn:
            conn.execute("UPDATE controllers SET measured_at=0 WHERE id=?",
                         (self.cid,))
        snapshot = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(snapshot["freshness"], "stale")
        self.assertIsNone(snapshot["total_watts"])
        for channel in snapshot["channels"]:
            self.assertIsNone(channel["watts"])
            self.assertEqual(channel["last_known_watts"], initial[channel["id"]])

    def test_malformed_telemetry_is_rejected_without_state_change(self):
        before = self.lab.snapshot(self.owner, self.cid)
        bodies = [
            {"channels": {"CH1": 0, "CH2": 0}},                      # incomplete
            {"channels": {"CH1": 0, "CH2": 0, "CH3": 2.4, "CH4": 0}},  # unknown
            {"channels": {"CH1": 0, "CH2": 0, "CH3": 0}},            # CH3 forced off
            {"channels": {"CH1": -1.8, "CH2": 0, "CH3": 2.4}},       # negative
            {"channels": {"CH1": "0", "CH2": 0, "CH3": 2.4}},        # string watts
            {"channels": {"CH1": None, "CH2": 0, "CH3": 2.4}},       # null watts
            {"channels": {"CH1": 0.9, "CH2": 0, "CH3": 2.4}},        # off-nominal
            {"channels": {"CH1": 0, "CH2": 0, "CH3": 2.4}, "extra": 1},
        ]
        for body in bodies:
            response = self.lab.client.post(
                self.base + "/simulator/telemetry", headers=bearer(self.owner),
                json=body,
            )
            self.assertEqual(response.status_code, 422, body)
        raw = b'{"channels": {"CH1": NaN, "CH2": 0, "CH3": 2.4}}'
        response = self.lab.client.post(
            self.base + "/simulator/telemetry",
            headers={**bearer(self.owner), "Content-Type": "application/json"},
            content=raw,
        )
        self.assertEqual(response.status_code, 422)
        after = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(after, before)


class ScenarioETests(unittest.TestCase):
    """E: the session ends; nothing of it stays usable."""

    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("session@example.test")
        self.cid = self.lab.controller(self.owner)

    def tearDown(self):
        self.lab.close()

    def test_revoked_token_is_useless_everywhere(self):
        stolen = self.owner
        self.assertEqual(
            self.lab.snapshot(stolen, self.cid)["controller_id"], self.cid
        )
        self.assertEqual(
            self.lab.client.post("/v1/auth/logout", headers=bearer(stolen)).status_code,
            204,
        )
        for method, path, body in (
            ("GET", f"/v1/controllers/{self.cid}/snapshot", None),
            ("POST", f"/v1/controllers/{self.cid}/commands",
             {"channel_id": "CH1", "on": False, "origin": "manual",
              "idempotency_key": "after-logout-1"}),
            ("POST", f"/v1/controllers/{self.cid}/simulator/step", {}),
        ):
            response = self.lab.client.request(
                method, path, headers=bearer(stolen), json=body
            )
            self.assertEqual(response.status_code, 401, path)

    def test_random_tokens_never_authenticate(self):
        for _ in range(5):
            fake = bearer(uuid.uuid4().hex + uuid.uuid4().hex)
            response = self.lab.client.get("/v1/controllers", headers=fake)
            self.assertEqual(response.status_code, 401)

    def test_login_after_logout_starts_clean_session(self):
        self.lab.client.post("/v1/auth/logout", headers=bearer(self.owner))
        fresh = self.lab.client.post(
            "/v1/auth/login",
            json={"email": "session@example.test",
                  "password": "correct-horse-battery"},
        )
        self.assertEqual(fresh.status_code, 200)
        new_token = fresh.json()["access_token"]
        self.assertNotEqual(new_token, self.owner)
        self.assertEqual(
            self.lab.client.get("/v1/controllers", headers=bearer(new_token)).json(),
            [{"id": self.cid, "name": "Lab stand", "source": "simulator"}],
        )


if __name__ == "__main__":
    unittest.main()
