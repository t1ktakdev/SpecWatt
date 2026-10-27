"""Regressions for scheduler contention, cancellation and worker integration."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from specwatt_api.app import create_app
import test_scheduler_api as fixtures


class SchedulerIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.fx = fixtures.SchedulerApiTests()
        self.fx.setUp()

    def tearDown(self):
        self.fx.tearDown()

    def test_busy_start_phase_defers_without_poisoning_key(self):
        x = self.fx
        schedule = x.schedule(duration=60).json()['schedule']
        x.advance(60)
        response = x.client.post(x.base + '/commands', headers=x.headers, json={
            'channel_id': 'CH1', 'on': False, 'origin': 'autopilot', 'idempotency_key': 'busy-command'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(x.tick()['processed'][0]['result'], 'deferred_command_in_flight')
        self.assertEqual(x.commands(), [])
        x.step()
        self.assertEqual(x.tick()['processed'][0]['result'], 'dispatched_start')
        x.step()
        self.assertEqual(x.get_schedule(schedule['id'])['command']['status'], 'acknowledged')

    def test_legacy_rejected_phase_key_requires_a_new_explicit_schedule(self):
        x = self.fx
        schedule = x.schedule(duration=60).json()['schedule']
        x.advance(60)
        x.client.post(x.base + '/commands', headers=x.headers, json={
            'channel_id': 'CH1', 'on': False, 'origin': 'autopilot', 'idempotency_key': 'legacy-busy'})
        rejected = x.client.post(x.base + '/commands', headers=x.headers, json={
            'channel_id': 'CH1', 'on': True, 'origin': 'schedule',
            'idempotency_key': 'schedule-' + schedule['id'] + '-start'})
        self.assertEqual(rejected.status_code, 409)
        x.step()
        result = x.tick()['processed'][0]
        self.assertEqual(result['result'], 'rejected')
        self.assertEqual(result['reason'], 'previous_phase_rejected_command_in_flight')
        self.assertEqual(len(x.commands()), 1)
        self.assertEqual(x.commands()[0]['status'], 'rejected')

    def test_cancel_retracts_requested_start_before_step(self):
        x = self.fx
        schedule = x.schedule(duration=60).json()['schedule']
        x.advance(60)
        x.tick()
        response = x.client.post(x.base + '/schedules/' + schedule['id'] + '/cancel', headers=x.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(x.step()['processed'], 0)
        self.assertEqual(x.commands()[0]['status'], 'cancelled')
        self.assertEqual(x.get_schedule(schedule['id'])['schedule']['status'], 'cancelled')

    def test_cancel_confirmed_start_does_not_claim_or_issue_off(self):
        x = self.fx
        schedule = x.schedule(duration=60).json()['schedule']
        x.advance(60)
        x.tick()
        x.step()
        x.client.post(x.base + '/schedules/' + schedule['id'] + '/cancel', headers=x.headers)
        x.advance(60)
        self.assertEqual(x.tick()['processed'], [])
        self.assertEqual(x.commands()[0]['status'], 'acknowledged')
        self.assertEqual(len(x.commands()), 1)
        self.assertEqual(x.client.get(x.base + '/snapshot', headers=x.headers).json()
                         ['channels'][0]['last_known_watts'], 1.8)

    def test_busy_end_phase_remains_retryable(self):
        x = self.fx
        x.schedule(duration=60)
        x.advance(60)
        x.tick()
        x.step()
        x.advance(60)
        x.client.post(x.base + '/commands', headers=x.headers, json={
            'channel_id': 'CH1', 'on': True, 'origin': 'autopilot', 'idempotency_key': 'busy-at-end'})
        self.assertEqual(x.tick()['processed'][0]['result'], 'deferred_command_in_flight')
        self.assertEqual(len(x.commands()), 1)
        x.step()
        self.assertEqual(x.tick()['processed'][0]['result'], 'dispatched_end')
        x.step()
        self.assertEqual(x.tick()['processed'][0]['result'], 'completed')

    def test_failed_transaction_rolls_back_command_and_phase_together(self):
        from specwatt_api.app import connect
        from specwatt_api.scheduler.runner import run_due_schedules
        x = self.fx
        schedule = x.schedule(duration=60).json()['schedule']
        x.advance(60)
        with self.assertRaisesRegex(RuntimeError, 'interrupted'):
            with connect(x.db) as db:
                db.execute('BEGIN IMMEDIATE')
                controller = db.execute('SELECT * FROM controllers WHERE id=?', (x.controller,)).fetchone()
                with patch('specwatt_api.scheduler.runner.store.set_status', side_effect=RuntimeError('interrupted')):
                    run_due_schedules(db, controller, x.clock.now())
        self.assertEqual(x.commands(), [])
        self.assertEqual(x.get_schedule(schedule['id'])['schedule']['status'], 'pending')
        self.assertEqual(x.tick()['processed'][0]['result'], 'dispatched_start')
        self.assertEqual(len(x.commands()), 1)

    def test_expired_half_open_window_does_not_turn_load_on(self):
        x = self.fx
        x.schedule(duration=60)
        x.advance(120)
        self.assertEqual(x.tick()['processed'][0]['reason'], 'window_missed')
        self.assertEqual(x.commands(), [])

    def test_restart_and_concurrent_ticks_insert_one_phase(self):
        x = self.fx
        x.schedule(duration=60)
        x.advance(60)
        with TestClient(create_app(x.db, clock=x.clock)) as restarted:
            with ThreadPoolExecutor(max_workers=4) as pool:
                responses = list(pool.map(lambda _: restarted.post(
                    x.base + '/scheduler/tick', headers=x.headers), range(4)))
        self.assertEqual([r.status_code for r in responses], [200] * 4)
        self.assertEqual(len(x.commands()), 1)
        self.assertEqual(sum(p['result'] == 'dispatched_start' for r in responses
                             for p in r.json()['processed']), 1)

    def test_worker_only_requests_and_never_refreshes_telemetry(self):
        from specwatt_api.scheduler.worker import run_worker_pass
        x = self.fx
        x.schedule(duration=60)
        x.advance(60)
        run_worker_pass(str(x.db), x.clock)
        self.assertEqual(x.commands()[0]['status'], 'requested')
        snapshot = x.client.get(x.base + '/snapshot', headers=x.headers).json()
        self.assertEqual(snapshot['channels'][0]['last_known_watts'], 0)
        measured_at = snapshot['measured_at']
        x.clock.advance(31)
        run_worker_pass(str(x.db), x.clock)
        snapshot = x.client.get(x.base + '/snapshot', headers=x.headers).json()
        self.assertEqual(snapshot['measured_at'], measured_at)
        self.assertEqual(snapshot['freshness'], 'stale')

    def test_worker_stale_start_is_rejected_without_relay_effect(self):
        from specwatt_api.scheduler.worker import run_worker_pass
        x = self.fx
        schedule = x.schedule(duration=60).json()['schedule']
        x.clock.advance(60)
        run_worker_pass(str(x.db), x.clock)
        self.assertEqual(x.get_schedule(schedule['id'])['schedule']['rejection_reason'], 'stale_measurements')
        self.assertEqual(x.commands()[0]['status'], 'rejected')

    def test_repeated_uncertain_ticks_do_not_duplicate_audit_transition(self):
        x = self.fx
        x.schedule(duration=60)
        x.advance(60)
        x.tick()
        x.step(outcome='timeout')
        for _ in range(3):
            self.assertEqual(x.tick()['processed'][0]['result'], 'uncertain')
        self.assertEqual(len([e for e in x.events() if e['kind'] == 'schedule.uncertain']), 1)

    def test_update_field_identifiers_are_allowlisted_and_values_bound(self):
        from specwatt_api.app import connect
        from specwatt_api.scheduler.store import update_schedule_fields
        x = self.fx
        schedule = x.schedule(duration=60).json()['schedule']
        with connect(x.db) as db:
            db.execute('BEGIN IMMEDIATE')
            for fields in ({"status='completed' WHERE 1=1 --": 'x'}, {'controller_id': 'other'}, {}):
                with self.assertRaisesRegex(ValueError, 'Unsupported schedule update fields'):
                    update_schedule_fields(db, x.controller, schedule['id'], fields, x.clock.now())
            literal = "x', status='completed' --"
            update_schedule_fields(db, x.controller, schedule['id'], {'note': literal}, x.clock.now())
        row = x.get_schedule(schedule['id'])['schedule']
        self.assertEqual(row['note'], literal)
        self.assertEqual(row['status'], 'pending')
        self.assertEqual(row['controller_id'], x.controller)

    def test_worker_lifespan_is_opt_in_and_joins_on_shutdown(self):
        from specwatt_api.scheduler.worker import scheduler_lifespan
        called = threading.Event()
        x = self.fx
        async def scenario(enabled):
            app = create_app(x.db, clock=x.clock)
            async with scheduler_lifespan(str(x.db), x.clock, enabled=enabled, poll_seconds=60)(app):
                if enabled:
                    self.assertTrue(await asyncio.to_thread(called.wait, 2))
                    self.assertTrue(app.state.scheduler_worker.is_alive())
            if enabled:
                self.assertFalse(app.state.scheduler_worker.is_alive())
        with patch('specwatt_api.scheduler.worker.run_worker_pass', side_effect=lambda *_: called.set()):
            asyncio.run(scenario(False))
            self.assertFalse(called.is_set())
            asyncio.run(scenario(True))
