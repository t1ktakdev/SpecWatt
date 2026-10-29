"""Acquisition/correlation boundaries for simulator recovery; no transport."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from support import Lab, bearer
from specwatt_api.clock import VirtualClock
from specwatt_api.app import create_app
from fastapi.testclient import TestClient


class TelemetryCorrelationTests(unittest.TestCase):
    def setUp(self):
        self.lab = Lab()
        self.lab.client.close()
        self.clock = VirtualClock(2_000_000_000)
        self.lab.app = create_app(self.lab.db_path, clock=self.clock)
        self.lab.client = TestClient(self.lab.app)
        self.token = self.lab.register('correlation@example.test')
        self.cid = self.lab.controller(self.token)
        self.base = '/v1/controllers/' + self.cid

    def tearDown(self):
        self.lab.close()

    def timed_out(self, key='timeout-first', on=False):
        command = self.lab.command(self.token, self.cid, on=on, key=key).json()
        self.lab.step(self.token, self.cid, outcome='timeout')
        return command

    def get(self, command):
        return self.lab.client.get(self.base + '/commands/' + command['id'], headers=bearer(self.token)).json()

    def sample(self, command=None, sequence=1, measured_at=None, on=False, metadata=True):
        body = {'channels': {'CH1': 1.8 if on else 0, 'CH2': 0, 'CH3': 2.4}}
        if metadata:
            body.update(sequence=sequence, measured_at=self.clock.now() if measured_at is None else measured_at)
        if command:
            body['command_id'] = command['id']
        return self.lab.client.post(self.base + '/simulator/telemetry', headers=bearer(self.token), json=body)

    def test_channels_only_refresh_never_reconciles_old_timeout(self):
        old = self.timed_out()
        self.assertEqual(self.sample(metadata=False).status_code, 200)
        self.assertEqual(self.get(old)['status'], 'timeout')

    def test_exact_new_acquisition_reconciles_only_correlated_command_and_preserves_hold(self):
        old = self.timed_out()
        deadline = old['created_at'] + 1800
        self.clock.advance(10)
        response = self.sample(old)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.get(old)['reason'], 'simulator_telemetry_matches_target')
        self.assertEqual(response.json()['channels'][0]['manual_until'], deadline)
        replay = self.sample(old)
        self.assertEqual(replay.status_code, 409)
        self.assertEqual(len(self.get(old)['transitions']), 4)

    def test_mismatch_is_reconciled_as_not_reached(self):
        old = self.timed_out()
        self.clock.advance(1)
        self.assertEqual(self.sample(old, on=True).status_code, 200)
        self.assertEqual(self.get(old)['reason'], 'target_not_reached')

    def test_pre_dispatch_stale_future_and_out_of_order_samples_are_atomic(self):
        old = self.timed_out()
        for acquisition in (self.clock.now(), self.clock.now() - 31, self.clock.now() + 1):
            before = self.lab.snapshot(self.token, self.cid)
            self.assertEqual(self.sample(old, measured_at=acquisition).status_code, 409)
            self.assertEqual(self.lab.snapshot(self.token, self.cid), before)
            self.assertEqual(self.get(old)['status'], 'timeout')
        self.clock.advance(2)
        self.assertEqual(self.sample(sequence=2).status_code, 200)
        self.clock.advance(1)
        before = self.lab.snapshot(self.token, self.cid)
        self.assertEqual(self.sample(old, sequence=1).status_code, 409)
        self.assertEqual(self.lab.snapshot(self.token, self.cid), before)

    def test_newer_opposite_or_same_intent_prevents_old_command_reconciliation(self):
        for target in (True, False):
            with self.subTest(target=target):
                old = self.timed_out(key='old-' + str(target))
                self.assertEqual(self.sample(metadata=False).status_code, 200)
                self.clock.advance(1)
                new = self.lab.command(self.token, self.cid, on=target, key='new-' + str(target))
                self.assertEqual(new.status_code, 200)
                self.lab.step(self.token, self.cid)
                self.clock.advance(1)
                before = self.lab.snapshot(self.token, self.cid)
                response = self.sample(old, sequence=10 if target else 20)
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(self.get(old)['status'], 'timeout')
                self.assertEqual(self.lab.snapshot(self.token, self.cid), before)

    def test_cursor_survives_restart_and_timeout_manual_hold_blocks_automation(self):
        old = self.timed_out()
        self.sample(metadata=False)
        self.lab.client.patch(self.base + '/channels/CH1/assignment', headers=bearer(self.token),
                              json={'name': 'lamp', 'room': '', 'image': 'lamp', 'allow_auto': True})
        blocked = self.lab.command(self.token, self.cid, origin='autopilot', key='hold-blocked')
        self.assertEqual(blocked.json()['detail']['code'], 'manual_priority_active')
        self.clock.advance(1)
        self.assertEqual(self.sample(old).status_code, 200)
        self.lab.client.close()
        self.lab.client = TestClient(create_app(self.lab.db_path, clock=self.clock))
        self.clock.advance(1)
        self.assertEqual(self.sample(sequence=1).status_code, 409)

    def test_correlation_metadata_is_complete_and_scoped(self):
        old = self.timed_out()
        self.assertEqual(self.sample(old, metadata=False).status_code, 422)
        self.clock.advance(1)
        self.assertEqual(self.sample({'id': 'nonexistent-command'}).status_code, 404)

    def test_late_fresh_sample_cannot_reconcile_or_renew_expired_manual_intent(self):
        old = self.timed_out()
        self.clock.advance(1801)
        response = self.sample(old)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.get(old)['status'], 'timeout')
        self.assertEqual(self.sample(metadata=False).status_code, 200)
        self.assertLess(self.lab.snapshot(self.token, self.cid)['channels'][0]['manual_until'], self.clock.now())

    def test_new_sequence_with_older_acquisition_is_rejected(self):
        self.clock.advance(1)
        self.assertEqual(self.sample(sequence=1).status_code, 200)
        self.clock.advance(1)
        self.assertEqual(self.sample(sequence=2, measured_at=self.clock.now() - 1).status_code, 409)

    def test_foreign_controller_command_cannot_correlate_and_metadata_alone_does_not_reconcile(self):
        old = self.timed_out()
        other_cid = self.lab.controller(self.token)
        foreign = self.lab.command(self.token, other_cid, key='foreign-timeout').json()
        self.lab.step(self.token, other_cid, outcome='timeout')
        self.clock.advance(1)
        self.assertEqual(self.sample(foreign).status_code, 404)
        self.assertEqual(self.sample().status_code, 200)
        self.assertEqual(self.get(old)['status'], 'timeout')
