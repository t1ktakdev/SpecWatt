"""Fault-injection and recovery regressions for the durable scheduler (ZCode).

Every scenario runs on an ephemeral SQLite database and a VirtualClock: no
test sleeps, all waiting is virtual, every fault is injected explicitly.
The file complements test_scheduler_api.py / test_scheduler_integration.py by
pinning the failure paths the regression matrix requires: worker fault
isolation, restart between requested and ack, ambiguous telemetry, phase-key
squatting, clock rollback, window boundaries and bounded worker lifecycle.
"""
import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from specwatt_api.app import create_app
from specwatt_api.clock import VirtualClock


BASE = datetime(2026, 10, 27, 14, 0, tzinfo=timezone.utc).timestamp()  # 14:00:00 UTC
START = BASE - 60                                                      # 13:59


class SchedulerFaultTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'faults.sqlite3'
        self.clock = VirtualClock(START)
        self.client = TestClient(create_app(self.db, clock=self.clock))
        self.headers = self.register('owner@example.test')
        self.controllers = []
        self.controller = self.new_controller('Стенд А')
        self.base = f'/v1/controllers/{self.controller}'

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    # -- harness -----------------------------------------------------------
    def register(self, email):
        response = self.client.post('/v1/auth/register', json={'email': email, 'password': 'test-password-123'})
        self.assertEqual(response.status_code, 201, response.text)
        return {'Authorization': f"Bearer {response.json()['access_token']}"}

    def new_controller(self, name):
        response = self.client.post('/v1/controllers/simulator', headers=self.headers, json={'name': name})
        self.assertEqual(response.status_code, 201, response.text)
        cid = response.json()['id']
        self.controllers.append(cid)
        self.client.patch(f'/v1/controllers/{cid}/channels/CH1/assignment', headers=self.headers,
                          json={'name': 'Светильник', 'room': 'Лаборатория', 'image': 'lamp',
                                'allow_auto': True})
        # All-off baseline via consented autopilot (no manual hold), then ack it.
        self.client.post(f'/v1/controllers/{cid}/commands', headers=self.headers,
                         json={'channel_id': 'CH1', 'on': False, 'origin': 'autopilot',
                               'idempotency_key': f'setup-{cid[:8]}'})
        self.client.post(f'/v1/controllers/{cid}/simulator/step', headers=self.headers,
                         json={'outcome': 'acknowledged'})
        return cid

    def schedule(self, base=None, controller=None, start_offset=0, duration=1800, action='on'):
        cid = controller or self.controller
        start = (base or BASE) + start_offset
        payload = {'channel_id': 'CH1', 'action': action, 'start_at': start}
        if action == 'on':
            payload['duration_seconds'] = duration
        response = self.client.post(f'/v1/controllers/{cid}/schedules', headers=self.headers, json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()['schedule']

    def tick(self, controller=None):
        response = self.client.post(f'/v1/controllers/{controller or self.controller}/scheduler/tick',
                                    headers=self.headers, json={})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def step(self, controller=None, outcome='acknowledged'):
        response = self.client.post(f'/v1/controllers/{controller or self.controller}/simulator/step',
                                    headers=self.headers, json={'outcome': outcome})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def advance(self, seconds):
        """Move the clock and refresh telemetry the way real devices would:
        every controller under test keeps reporting, so staleness only ever
        enters a scenario through an explicit fault, never by accident."""
        self.clock.advance(seconds)
        self.refresh()

    def refresh(self, cid=None):
        """Channels-only telemetry refresh (no correlation metadata)."""
        for controller in [cid] if cid else self.controllers:
            base = f'/v1/controllers/{controller}'
            snap = self.client.get(base + '/snapshot', headers=self.headers).json()
            channels = {c['id']: c['last_known_watts'] for c in snap['channels']}
            response = self.client.post(base + '/simulator/telemetry', headers=self.headers,
                                        json={'channels': channels})
            self.assertEqual(response.status_code, 200, response.text)

    def schedule_row(self, schedule_id, controller=None):
        response = self.client.get(f'/v1/controllers/{controller or self.controller}/schedules/{schedule_id}',
                                   headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def scheduler_commands(self, controller=None):
        rows = self.client.get(f'/v1/controllers/{controller or self.controller}/commands',
                               headers=self.headers).json()
        return [c for c in rows if c['idempotency_key'].startswith('schedule-')]

    def reauth(self, email='owner@example.test'):
        """A fresh bearer session after a long virtual time jump (24 h expiry)."""
        response = self.client.post('/v1/auth/login', json={'email': email, 'password': 'test-password-123'})
        self.assertEqual(response.status_code, 200, response.text)
        self.headers = {'Authorization': f"Bearer {response.json()['access_token']}"}

    def correlated_telemetry(self, command_id, watts, sequence=1):
        return self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                                json={'channels': {'CH1': watts, 'CH2': 0, 'CH3': 2.4},
                                      'command_id': command_id, 'measured_at': self.clock.now(),
                                      'sequence': sequence})

    def sql(self, statement, params=()):
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                db.execute(statement, params)

    # -- worker fault isolation (fix under test: worker.py) ----------------
    def test_worker_pass_isolates_failing_controller_and_rolls_back(self):
        second = self.new_controller('Стенд Б')
        first_schedule = self.schedule()
        second_schedule = self.schedule(controller=second)
        self.advance(60)
        real_run = __import__('specwatt_api.scheduler.runner', fromlist=['run_due_schedules']).run_due_schedules
        raised = []

        def flaky(db, controller, now):
            if controller['id'] == self.controller:
                raised.append(controller['id'])
                raise sqlite3.OperationalError('injected fault')
            return real_run(db, controller, now)

        with patch('specwatt_api.scheduler.runner.run_due_schedules', side_effect=flaky), \
                patch('specwatt_api.scheduler.worker._LOG') as log:
            # The poisoned controller must not starve the healthy one, and the
            # failing pass must leave zero partial state behind.
            __import__('specwatt_api.scheduler.worker', fromlist=['run_worker_pass']).run_worker_pass(
                str(self.db), self.clock)
        self.assertEqual(raised, [self.controller])
        self.assertEqual(log.exception.call_count, 1, 'the fault must be diagnosed, not swallowed')
        self.assertIn(self.controller, log.exception.call_args.args,
                      'the diagnostic must name the poisoned controller')
        self.assertEqual(len(self.scheduler_commands(second)), 1, 'healthy controller must be served')
        self.assertEqual(self.scheduler_commands(), [], 'failed pass must roll back cleanly')
        self.assertEqual(self.schedule_row(first_schedule['id'])['schedule']['status'], 'pending')
        self.assertEqual(self.schedule_row(second_schedule['id'], second)['schedule']['status'], 'running')
        # The next pass retries the failed controller successfully.
        __import__('specwatt_api.scheduler.worker', fromlist=['run_worker_pass']).run_worker_pass(
            str(self.db), self.clock)
        self.assertEqual(len(self.scheduler_commands()), 1)
        self.assertEqual(self.scheduler_commands()[0]['status'], 'requested')

    # -- cancelled linked command must terminate the schedule --------------
    def test_cancelled_command_terminates_linked_schedule(self):
        created = self.schedule(duration=60)
        self.advance(60)
        self.assertEqual(self.tick()['processed'][0]['result'], 'dispatched_start')
        command_id = self.schedule_row(created['id'])['schedule']['command_id']
        # Simulate any writer that cancels the queued command without touching
        # the schedule row (the documented cancel endpoint also cancels the
        # schedule; the runner must still be total over the command domain).
        self.sql('UPDATE commands SET status=? WHERE id=?', ('cancelled', command_id))
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'command_cancelled')
        row = self.schedule_row(created['id'])['schedule']
        self.assertEqual(row['status'], 'rejected')
        self.assertEqual(row['rejection_reason'], 'command_cancelled')
        self.assertEqual(len(self.scheduler_commands()), 1, 'no new command may be issued')

    # -- restart recovery (state must survive the process) -----------------
    def test_restart_between_requested_and_ack_completes_cycle(self):
        created = self.schedule(duration=1800)
        self.advance(60)
        self.assertEqual(self.tick()['processed'][0]['result'], 'dispatched_start')
        # The server process dies here; SQLite already holds the in-flight state.
        restarted = TestClient(create_app(self.db, clock=self.clock))
        try:
            listing = restarted.get(f'{self.base}/schedules/{created["id"]}', headers=self.headers)
            self.assertEqual(listing.status_code, 200)
            self.assertEqual(listing.json()['schedule']['status'], 'running')
            restarted.post(self.base + '/simulator/step', headers=self.headers, json={})
            self.assertEqual(restarted.post(f'{self.base}/scheduler/tick', headers=self.headers, json={})
                             .json()['processed'][0]['result'], 'start_confirmed')
        finally:
            restarted.close()
        self.advance(1800)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_end'])
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['completed'])
        self.assertEqual(len(self.scheduler_commands()), 2, 'start + end, exactly once each')

    # -- ambiguous telemetry (SEC-002 at scheduler level) ------------------
    def test_channels_only_telemetry_never_resolves_uncertain_schedule(self):
        created = self.schedule(duration=1800)
        self.advance(60)
        self.tick()
        self.step(outcome='timeout')
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['uncertain'])
        command_id = self.schedule_row(created['id'])['command']['id']
        # A fresh channels-only sample refreshes state but is not delivery
        # proof: the schedule must stay uncertain without correlation.
        self.clock.advance(0.001)
        self.refresh()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['uncertain'])
        self.assertEqual(len(self.scheduler_commands()), 1)
        # Authoritative correlated telemetry does resolve it.
        self.clock.advance(0.001)
        self.assertEqual(self.correlated_telemetry(command_id, 1.8).status_code, 200)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['start_confirmed'])

    def test_late_correlation_outside_send_window_leaves_schedule_uncertain(self):
        created = self.schedule(duration=1800)
        self.advance(60)
        self.tick()
        self.step(outcome='timeout')
        # Two minutes of silence: even perfectly correlated metadata arrives
        # outside the send-freshness window and must not resolve the schedule.
        self.clock.advance(120)
        response = self.correlated_telemetry(self.schedule_row(created['id'])['command']['id'], 1.8)
        self.assertEqual(response.status_code, 409)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['uncertain'])

    def test_end_phase_timeout_reconciled_match_completes(self):
        self.schedule(duration=60)
        self.advance(60)
        self.tick()
        self.step()
        self.advance(60)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_end'])
        self.step(outcome='timeout')
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['uncertain'])
        command_id = self.client.get(f'{self.base}/schedules', headers=self.headers).json()[0]['command_id']
        self.clock.advance(0.001)
        self.assertEqual(self.correlated_telemetry(command_id, 0.0).status_code, 200)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['completed'])

    def test_end_phase_timeout_reconciled_mismatch_rejects(self):
        created = self.schedule(duration=60)
        self.advance(60)
        self.tick()
        self.step()
        self.advance(60)
        self.tick()
        self.step(outcome='timeout')
        command_id = self.schedule_row(created['id'])['command']['id']
        self.clock.advance(0.001)
        # The load is still on: the closing off never reached the target.
        self.assertEqual(self.correlated_telemetry(command_id, 1.8).status_code, 200)
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'target_not_reached')

    # -- idempotency key squatting -----------------------------------------
    def test_squatted_phase_key_conflict_is_terminal_not_dangerous(self):
        created = self.schedule(duration=1800)
        # The owner (or any future writer) pre-squats the derived phase key
        # with a different intent (manual origin).
        squat = self.client.post(self.base + '/commands', headers=self.headers,
                                 json={'channel_id': 'CH1', 'on': True, 'origin': 'manual',
                                       'idempotency_key': f'schedule-{created["id"]}-start'})
        self.assertEqual(squat.status_code, 200)
        self.step()  # the squatter resolves, freeing the in-flight slot
        self.advance(60)
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'idempotency_conflict')
        row = self.schedule_row(created['id'])['schedule']
        self.assertEqual(row['status'], 'rejected')
        self.assertEqual(row['rejection_reason'], 'idempotency_conflict')
        self.assertEqual(len(self.scheduler_commands()), 1, 'the squatter itself, nothing new')
        self.assertEqual(self.scheduler_commands()[0]['origin'], 'manual')

    # -- clock integrity ----------------------------------------------------
    def test_clock_rollback_after_dispatch_never_reissues_start(self):
        created = self.schedule(duration=1800)
        self.advance(60)
        self.assertEqual(self.tick()['processed'][0]['result'], 'dispatched_start')
        command = self.schedule_row(created['id'])['command']
        self.clock.set(BASE - 30)  # wall-clock rollback mid-flight
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['waiting_command'])
        row = self.schedule_row(created['id'])
        self.assertEqual(row['schedule']['status'], 'running')
        self.assertEqual(row['command']['transitions'], command['transitions'], 'no new transition')
        self.assertEqual(len(self.scheduler_commands()), 1)
        # Forward again: the cycle completes normally.
        self.clock.set(BASE)
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['start_confirmed'])
        self.advance(1800)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_end'])
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['completed'])
        self.assertEqual(len(self.scheduler_commands()), 2)

    def test_closing_off_dispatches_exactly_at_end_at(self):
        created = self.schedule(duration=60)
        self.advance(60)
        self.tick()
        self.step()
        self.advance(60)  # now == end_at exactly; the half-open window is over
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_end'])
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['completed'])
        self.assertEqual(self.schedule_row(created['id'])['schedule']['status'], 'completed')

    def test_leap_day_window_runs_on_epoch_math(self):
        leap = datetime(2028, 2, 29, 0, 30, tzinfo=timezone.utc).timestamp()
        self.clock.set(leap - 5400)  # 2028-02-28 23:00 UTC, past the 24 h session
        self.reauth()
        self.refresh()
        created = self.schedule(base=leap, duration=3600)  # spans Feb 29 00:30-01:30
        self.advance(5400)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_start'])
        self.step()
        self.advance(3600)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_end'])
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['completed'])
        self.assertEqual(self.schedule_row(created['id'])['schedule']['status'], 'completed')

    # -- damaged durable state ----------------------------------------------
    def test_missing_command_row_rejects_schedule(self):
        created = self.schedule(duration=1800)
        self.advance(60)
        self.tick()
        command_id = self.schedule_row(created['id'])['command']['id']
        self.sql('DELETE FROM commands WHERE id=?', (command_id,))
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'missing_command')
        self.assertEqual(self.schedule_row(created['id'])['schedule']['status'], 'rejected')

    def test_future_dated_measurement_blocks_create_and_dispatch(self):
        created = self.schedule(duration=1800)
        self.sql('UPDATE controllers SET measured_at=? WHERE id=?', (self.clock.now() + 100, self.controller))
        # A sample from the future is not fresh, exactly like an old one.
        response = self.client.post(self.base + '/schedules', headers=self.headers,
                                    json={'channel_id': 'CH2', 'action': 'on', 'start_at': BASE + 60,
                                          'duration_seconds': 60})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['detail']['code'], 'stale_measurements')
        # Clock-only advance: no telemetry refresh, so the tampered future
        # sample is what the dispatch actually sees.
        self.clock.advance(60)
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'stale_measurements')
        self.assertEqual(self.schedule_row(created['id'])['schedule']['status'], 'rejected')

    # -- documented fail-safe limits ----------------------------------------
    def test_stale_closing_off_rejects_and_load_stays_on_for_operator(self):
        created = self.schedule(duration=60)
        self.advance(60)
        self.tick()
        self.step()  # lamp on: 1.8 W
        self.sql('UPDATE controllers SET measured_at=0 WHERE id=?', (self.controller,))
        self.clock.advance(60)  # downtime: no device is reporting anything
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'end_phase_stale_measurements')
        row = self.schedule_row(created['id'])['schedule']
        self.assertEqual(row['status'], 'rejected')
        self.assertEqual(row['rejection_reason'], 'end_phase_stale_measurements')
        # Documented limitation: no guessing about state — the load stays on
        # and the operator must reconcile explicitly.
        snap = self.client.get(self.base + '/snapshot', headers=self.headers).json()
        self.assertEqual(snap['channels'][0]['last_known_watts'], 1.8)
        self.assertIn('schedule.rejected', [e['kind'] for e in self.client.get(
            self.base + '/events', headers=self.headers).json()])

    # -- bounded worker lifecycle -------------------------------------------
    def test_worker_shutdown_joins_active_pass(self):
        import asyncio
        from specwatt_api.scheduler.worker import scheduler_lifespan
        started, release = threading.Event(), threading.Event()

        def slow_pass(path, clock):
            started.set()
            release.wait(5)

        async def scenario():
            app = create_app(self.db, clock=self.clock)
            cm = scheduler_lifespan(str(self.db), self.clock, enabled=True, poll_seconds=60)(app)
            await cm.__aenter__()
            try:
                thread = app.state.scheduler_worker
                self.assertTrue(await asyncio.to_thread(started.wait, 2))
                exit_task = asyncio.create_task(cm.__aexit__(None, None, None))
                release.set()
                await asyncio.wait_for(exit_task, 5)
                self.assertFalse(thread.is_alive(), 'shutdown must join the in-flight pass')
            finally:
                release.set()

        with patch('specwatt_api.scheduler.worker.run_worker_pass', side_effect=slow_pass):
            asyncio.run(scenario())

    def test_staggered_windows_complete_exactly_once(self):
        windows = [self.schedule(start_offset=60 * i, duration=60) for i in range(6)]
        for _ in range(8):
            self.advance(60)
            for _ in range(3):
                self.tick()
                self.step()
        rows = self.client.get(self.base + '/schedules', headers=self.headers).json()
        self.assertEqual([r['status'] for r in rows], ['completed'] * 6)
        commands = self.scheduler_commands()
        self.assertEqual(len(commands), 12)  # one start + one end per window
        keys = {c['idempotency_key'] for c in commands}
        self.assertEqual(len(keys), 12)
        for window in windows:
            self.assertIn(f'schedule-{window["id"]}-start', keys)
            self.assertIn(f'schedule-{window["id"]}-end', keys)


if __name__ == '__main__':
    unittest.main()
