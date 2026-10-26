"""Actuation safety: protected channel, power ceiling, consent, idempotency.

Focus: the SpecWATT invariants that keep loads under control. Every check runs
against the local FastAPI simulator with a throwaway database — no physical
equipment exists on this path (``/health`` reports ``hardware_transport:false``).
"""
import sqlite3
import threading
import unittest

from fastapi.testclient import TestClient

from support import Lab, bearer


class Ch3ProtectionTests(unittest.TestCase):
    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("owner@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def test_ch3_rejected_for_every_origin_and_direction(self):
        for origin in ("manual", "autopilot", "schedule"):
            for on in (True, False):
                response = self.lab.command(
                    self.owner, self.cid, channel="CH3", on=on,
                    key=f"ch3-{origin}-{on}", origin=origin,
                )
                self.assertEqual(response.status_code, 409, (origin, on))
                self.assertEqual(
                    response.json()["detail"]["code"], "protected_channel"
                )
        channel = self.lab.channels(self.owner, self.cid)["CH3"]
        self.assertTrue(channel["protected"])
        self.assertEqual(channel["watts"], 2.4)
        self.assertFalse(channel["assigned"]["allow_auto"])

    def test_ch3_consent_cannot_be_enabled_via_assignment(self):
        reject = self.lab.client.patch(
            self.base + "/channels/CH3/assignment",
            headers=bearer(self.owner),
            json={"name": "Fan", "room": "Lab", "image": "fan", "allow_auto": True},
        )
        self.assertEqual(reject.status_code, 409)
        keep_name = self.lab.client.patch(
            self.base + "/channels/CH3/assignment",
            headers=bearer(self.owner),
            json={"name": "Fan", "room": "Lab", "image": "fan", "allow_auto": False},
        )
        self.assertEqual(keep_name.status_code, 200)
        channel = self.lab.channels(self.owner, self.cid)["CH3"]
        self.assertTrue(channel["protected"])
        self.assertFalse(channel["assigned"]["allow_auto"])
        still_blocked = self.lab.command(
            self.owner, self.cid, channel="CH3", on=False, key="ch3-after-rename"
        )
        self.assertEqual(still_blocked.status_code, 409)

    def test_sqlite_constraints_are_the_last_line_of_defence(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.lab.db() as conn:
                conn.execute(
                    "UPDATE channels SET protected=0 WHERE controller_id=? AND id='CH3'",
                    (self.cid,),
                )
        with self.assertRaises(sqlite3.IntegrityError):
            with self.lab.db() as conn:
                conn.execute(
                    "UPDATE channels SET allow_auto=1 WHERE controller_id=? AND id='CH3'",
                    (self.cid,),
                )
        with self.assertRaises(sqlite3.IntegrityError):
            with self.lab.db() as conn:
                conn.execute(
                    "UPDATE channels SET watts=3.0 WHERE controller_id=? AND id='CH3'",
                    (self.cid,),
                )

    def test_assignment_never_changes_power_or_protection(self):
        for channel_id, image in (("CH1", "socket"), ("CH2", "charger")):
            response = self.lab.client.patch(
                self.base + f"/channels/{channel_id}/assignment",
                headers=bearer(self.owner),
                json={"name": "Renamed", "room": "Hall", "image": image,
                      "allow_auto": True},
            )
            self.assertEqual(response.status_code, 200)
        channels = self.lab.channels(self.owner, self.cid)
        self.assertEqual(channels["CH1"]["watts"], 1.8)
        self.assertEqual(channels["CH2"]["watts"], 0.0)
        self.assertEqual(channels["CH3"]["watts"], 2.4)
        self.assertTrue(channels["CH3"]["protected"])
        self.assertFalse(channels["CH3"]["assigned"]["allow_auto"])


class PeakLimitTests(unittest.TestCase):
    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("owner@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def acknowledge(self, token, cid, channel, on, key):
        response = self.lab.command(token, cid, channel=channel, on=on, key=key)
        assert response.status_code == 200, response.text
        step = self.lab.step(token, cid)
        assert step.status_code == 200, step.text

    def test_default_peak_rejects_led_with_lamp_on(self):
        response = self.lab.command(
            self.owner, self.cid, channel="CH2", on=True, key="peak-default"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "peak_exceeded")
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 4.2)

    def test_exact_peak_boundary_accepts_and_next_watt_rejects(self):
        self.acknowledge(self.owner, self.cid, "CH1", False, "off-ch1-01")
        self.acknowledge(self.owner, self.cid, "CH2", True, "on-ch2-01")
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 6.6)
        exact = self.lab.client.patch(
            self.base + "/settings", headers=bearer(self.owner),
            json={"peak_watts": 6.6, "manual_priority_minutes": 30},
        )
        self.assertEqual(exact.status_code, 200)
        turn_lamp_on = self.lab.command(
            self.owner, self.cid, channel="CH1", on=True, key="on-ch1-exact"
        )
        self.assertEqual(turn_lamp_on.status_code, 409)
        self.assertEqual(turn_lamp_on.json()["detail"]["code"], "peak_exceeded")
        headroom = self.lab.client.patch(
            self.base + "/settings", headers=bearer(self.owner),
            json={"peak_watts": 8.4, "manual_priority_minutes": 30},
        )
        self.assertEqual(headroom.status_code, 200)
        allowed = self.lab.command(
            self.owner, self.cid, channel="CH1", on=True, key="on-ch1-headroom"
        )
        self.assertEqual(allowed.status_code, 200)
        self.lab.step(self.owner, self.cid)
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 8.4)

    def test_turning_off_is_never_blocked_by_peak(self):
        self.lab.client.patch(
            self.base + "/settings", headers=bearer(self.owner),
            json={"peak_watts": 2.4, "manual_priority_minutes": 30},
        )
        response = self.lab.command(
            self.owner, self.cid, channel="CH1", on=False, key="off-under-cap"
        )
        self.assertEqual(response.status_code, 200)
        self.lab.step(self.owner, self.cid)
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 2.4)

    def test_peak_rechecked_at_dispatch_after_settings_change(self):
        self.lab.client.patch(
            self.base + "/settings", headers=bearer(self.owner),
            json={"peak_watts": 8.4, "manual_priority_minutes": 30},
        )
        requested = self.lab.command(
            self.owner, self.cid, channel="CH2", on=True, key="race-settings"
        )
        self.assertEqual(requested.status_code, 200)
        self.lab.client.patch(
            self.base + "/settings", headers=bearer(self.owner),
            json={"peak_watts": 7.0, "manual_priority_minutes": 30},
        )
        self.lab.step(self.owner, self.cid)
        command = self.lab.client.get(
            self.base + "/commands/" + requested.json()["id"],
            headers=bearer(self.owner),
        ).json()
        self.assertEqual(command["status"], "rejected")
        self.assertEqual(command["reason"], "peak_exceeded")
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 4.2)


class ConsentAndPriorityTests(unittest.TestCase):
    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("owner@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def grant(self, channel, allow):
        response = self.lab.client.patch(
            self.base + f"/channels/{channel}/assignment",
            headers=bearer(self.owner),
            json={"name": "Load", "room": "Lab", "image": "socket",
                  "allow_auto": allow},
        )
        assert response.status_code == 200, response.text

    def test_automation_requires_explicit_consent(self):
        for origin in ("autopilot", "schedule"):
            response = self.lab.command(
                self.owner, self.cid, channel="CH1", on=True,
                key=f"consent-{origin}", origin=origin,
            )
            self.assertEqual(response.status_code, 409)
            self.assertEqual(
                response.json()["detail"]["code"], "automation_not_allowed"
            )

    def test_consent_revoked_between_request_and_dispatch(self):
        self.grant("CH1", True)
        requested = self.lab.command(
            self.owner, self.cid, channel="CH1", on=True,
            key="auto-then-revoke", origin="autopilot",
        )
        self.assertEqual(requested.status_code, 200)
        self.grant("CH1", False)
        self.lab.step(self.owner, self.cid)
        command = self.lab.client.get(
            self.base + "/commands/" + requested.json()["id"],
            headers=bearer(self.owner),
        ).json()
        self.assertEqual(command["status"], "rejected")
        self.assertEqual(command["reason"], "automation_not_allowed")

    def test_manual_hold_blocks_automation_until_it_expires(self):
        response = self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                                    key="manual-hold-01")
        self.assertEqual(response.status_code, 200)
        self.lab.step(self.owner, self.cid)
        self.grant("CH1", True)
        blocked = self.lab.command(
            self.owner, self.cid, channel="CH1", on=True,
            key="auto-vs-hold", origin="schedule",
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["detail"]["code"], "manual_priority_active")
        with self.lab.db() as conn:
            conn.execute(
                "UPDATE channels SET manual_until=1 WHERE controller_id=? AND id='CH1'",
                (self.cid,),
            )
        after = self.lab.command(
            self.owner, self.cid, channel="CH1", on=True,
            key="auto-after-hold", origin="schedule",
        )
        self.assertEqual(after.status_code, 200)
        self.assertEqual(after.json()["status"], "requested")


class IdempotencyTests(unittest.TestCase):
    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("owner@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def command_rows(self, key):
        return self.lab.query(
            "SELECT id,status FROM commands WHERE controller_id=? AND idempotency_key=?",
            (self.cid, key),
        )

    def test_replay_same_intent_returns_same_command_without_double_execution(self):
        first = self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                                 key="replay-key-001")
        self.assertEqual(first.status_code, 200)
        command_id = first.json()["id"]
        self.lab.step(self.owner, self.cid)
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 2.4)
        replay = self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                                  key="replay-key-001")
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["id"], command_id)
        self.assertEqual(replay.json()["status"], "acknowledged")
        self.assertEqual(self.lab.snapshot(self.owner, self.cid)["total_watts"], 2.4)
        acknowledged_events = [
            e for e in self.lab.client.get(
                self.base + "/events", headers=bearer(self.owner)
            ).json()
            if e["kind"] == "command.acknowledged"
        ]
        self.assertEqual(len(acknowledged_events), 1)

    def test_replay_of_rejected_command_returns_stored_outcome(self):
        first = self.lab.command(self.owner, self.cid, channel="CH3", on=True,
                                 key="rejected-replay")
        self.assertEqual(first.status_code, 409)
        replay = self.lab.command(self.owner, self.cid, channel="CH3", on=True,
                                  key="rejected-replay")
        # Documented contract: the stored rejected record is returned as a
        # normal 200 replay, never re-evaluated into a new rejection event.
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["status"], "rejected")
        self.assertEqual(replay.json()["id"], first.json()["detail"]["command"]["id"])

    def test_key_reuse_with_different_intent_is_a_conflict(self):
        self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                         key="conflict-key-1")
        mutations = [
            {"channel_id": "CH1", "on": True, "origin": "manual"},
            {"channel_id": "CH2", "on": False, "origin": "manual"},
            {"channel_id": "CH1", "on": False, "origin": "autopilot"},
        ]
        for mutation in mutations:
            payload = {"idempotency_key": "conflict-key-1", **mutation}
            response = self.lab.client.post(
                f"/v1/controllers/{self.cid}/commands",
                headers=bearer(self.owner), json=payload,
            )
            self.assertEqual(response.status_code, 409)
            self.assertEqual(
                response.json()["detail"]["code"], "idempotency_conflict"
            )
        self.assertEqual(len(self.command_rows("conflict-key-1")), 1)

    def test_key_format_boundaries(self):
        bad = ["a" * 7, "a" * 129, "has space", "ключ-значение", "key!@#"]
        for key in bad:
            response = self.lab.command(self.owner, self.cid, key=key)
            self.assertEqual(response.status_code, 422, key)
        for key in ("a" * 8, "a" * 128, "A-z_0-9-ok1", "edge--___001"):
            response = self.lab.command(self.owner, self.cid, key=key, on=False)
            self.assertEqual(response.status_code, 200, key)
            step = self.lab.step(self.owner, self.cid)
            self.assertEqual(step.json()["processed"], 1, key)

    def test_single_in_flight_command_per_controller(self):
        first = self.lab.command(self.owner, self.cid, channel="CH1", on=False,
                                 key="in-flight-1")
        self.assertEqual(first.status_code, 200)
        second = self.lab.command(self.owner, self.cid, channel="CH2", on=False,
                                  key="in-flight-2")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["detail"]["code"], "command_in_flight")
        self.lab.step(self.owner, self.cid)
        third = self.lab.command(self.owner, self.cid, channel="CH2", on=False,
                                 key="in-flight-3")
        self.assertEqual(third.status_code, 200)


class ConcurrencyTests(unittest.TestCase):
    """Scenario B: parallel requests must never defeat the power ceiling."""

    def setUp(self):
        self.lab = Lab()
        self.owner = self.lab.register("owner@example.test")
        self.cid = self.lab.controller(self.owner)
        self.base = f"/v1/controllers/{self.cid}"

    def tearDown(self):
        self.lab.close()

    def parallel_commands(self, payloads):
        results = []
        lock = threading.Lock()

        def send(payload):
            client = TestClient(self.lab.app, raise_server_exceptions=False)
            try:
                response = client.post(
                    self.base + "/commands", headers=bearer(self.owner),
                    json=payload,
                )
                with lock:
                    results.append(response)
            finally:
                client.close()

        threads = [
            threading.Thread(target=send, args=(payload,)) for payload in payloads
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(30)
        return results

    def test_concurrent_led_on_requests_never_exceed_peak(self):
        payloads = [
            {"channel_id": "CH2", "on": True, "origin": "manual",
             "idempotency_key": f"race-peak-{index:03d}"}
            for index in range(6)
        ]
        responses = self.parallel_commands(payloads)
        self.assertEqual(len(responses), 6)
        for response in responses:
            self.assertIn(response.status_code, (200, 409), response.text)
            self.assertNotEqual(response.status_code, 500)
        snapshot = self.lab.snapshot(self.owner, self.cid)
        self.assertLessEqual(snapshot["total_watts"], snapshot["peak_watts"])
        self.assertEqual(snapshot["channels"][1]["watts"], 0.0)
        winners = self.lab.query(
            "SELECT COUNT(*) FROM commands WHERE controller_id=? AND channel_id='CH2' "
            "AND target_on=1 AND status IN ('requested','sent','acknowledged')",
            (self.cid,),
        )
        self.assertLessEqual(winners[0][0], 1)

    def test_concurrent_same_key_creates_exactly_one_command(self):
        payloads = [
            {"channel_id": "CH1", "on": False, "origin": "manual",
             "idempotency_key": "race-same-key-01"}
        ] * 6
        responses = self.parallel_commands(payloads)
        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
        identifiers = {response.json()["id"] for response in responses}
        self.assertEqual(len(identifiers), 1)
        rows = self.command_rows_all("race-same-key-01")
        self.assertEqual(len(rows), 1)

    def command_rows_all(self, key):
        return self.lab.query(
            "SELECT id FROM commands WHERE controller_id=? AND idempotency_key=?",
            (self.cid, key),
        )

    def test_concurrent_distinct_keys_violate_no_invariants(self):
        payloads = [
            {"channel_id": "CH1", "on": False, "origin": "manual",
             "idempotency_key": "race-mix-ch1"},
            {"channel_id": "CH2", "on": False, "origin": "manual",
             "idempotency_key": "race-mix-ch2"},
            {"channel_id": "CH3", "on": False, "origin": "manual",
             "idempotency_key": "race-mix-ch3"},
        ]
        responses = self.parallel_commands(payloads)
        for response in responses:
            self.assertIn(response.status_code, (200, 409), response.text)
        self.lab.step(self.owner, self.cid)
        snapshot = self.lab.snapshot(self.owner, self.cid)
        self.assertEqual(snapshot["channels"][2]["watts"], 2.4)
        self.assertLessEqual(snapshot["total_watts"], 8.4)


if __name__ == "__main__":
    unittest.main()
