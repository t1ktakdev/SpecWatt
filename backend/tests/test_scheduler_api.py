"""Scheduler integration tests over the real ASGI app with a virtual clock.

Every test starts at 13:59 UTC (one minute before the BASE time) so plans for
14:00 behave like the classic demo: schedule at 13:59, advance the clock to
14:00, tick, and assert on the result and the audit journal. Restart,
link-loss and recovery scenarios reuse the same clock object across app
instances. No test sleeps: all waiting is virtual.
"""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from specwatt_api.app import create_app
from specwatt_api.clock import VirtualClock


BASE = datetime(2026, 10, 27, 14, 0, tzinfo=timezone.utc).timestamp()  # 14:00:00 UTC
START = BASE - 60                                                      # 13:59


class SchedulerApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'test.sqlite3'
        self.clock = VirtualClock(START)
        self.client = TestClient(create_app(self.db, clock=self.clock))
        self.headers = self.register('owner@example.test')
        response = self.client.post('/v1/controllers/simulator', headers=self.headers,
                                    json={'name': 'Учебный стенд'})
        self.controller = response.json()['id']
        self.base = f'/v1/controllers/{self.controller}'
        # The lamp consents to automation for scheduling scenarios.
        self.client.patch(self.base + '/channels/CH1/assignment', headers=self.headers,
                          json={'name': 'Светильник', 'room': 'Лаборатория', 'image': 'lamp',
                                'allow_auto': True})
        # The simulator starts with the lamp lit (CH1 = 1.8 W). Every test
        # below assumes an all-off baseline, so switch it off through
        # consented autopilot, which leaves no manual hold.
        self.client.post(self.base + '/commands', headers=self.headers,
                         json={'channel_id': 'CH1', 'on': False, 'origin': 'autopilot',
                               'idempotency_key': 'setup-lamp-off'})
        self.step()

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    # -- helpers -----------------------------------------------------------
    def register(self, email):
        response = self.client.post('/v1/auth/register', json={'email': email, 'password': 'test-password-123'})
        self.assertEqual(response.status_code, 201, response.text)
        return {'Authorization': f"Bearer {response.json()['access_token']}"}

    def schedule(self, channel='CH1', action='on', start_offset=0, duration=1800, key='plan-0001',
                 headers=None, expect=201):
        payload = {'channel_id': channel, 'action': action, 'start_at': BASE + start_offset}
        if action == 'on':
            payload['duration_seconds'] = duration
        response = self.client.post(self.base + '/schedules', headers=headers or self.headers, json=payload)
        self.assertEqual(response.status_code, expect, response.text)
        return response

    def tick(self):
        response = self.client.post(self.base + '/scheduler/tick', headers=self.headers, json={})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def advance(self, seconds):
        """Move the clock and refresh the simulated telemetry, the way real
        devices keep reporting: without a fresh sample the server correctly
        treats every measurement as stale after the 30 s freshness window."""
        self.clock.advance(seconds)
        snap = self.client.get(self.base + '/snapshot', headers=self.headers).json()
        channels = {c['id']: c['last_known_watts'] for c in snap['channels']}
        response = self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                                    json={'channels': channels})
        self.assertEqual(response.status_code, 200, response.text)

    def step(self, outcome='acknowledged'):
        response = self.client.post(self.base + '/simulator/step', headers=self.headers,
                                    json={'outcome': outcome})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def get_schedule(self, schedule_id):
        response = self.client.get(f'{self.base}/schedules/{schedule_id}', headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def commands(self):
        # Only scheduler-issued commands; the setup lamp-off command is noise.
        rows = self.client.get(self.base + '/commands', headers=self.headers).json()
        return [c for c in rows if c['idempotency_key'].startswith('schedule-')]

    def events(self):
        return self.client.get(self.base + '/events', headers=self.headers).json()

    def stale(self):
        """Force measurements out of the freshness window, as downtime would."""
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                db.execute('UPDATE controllers SET measured_at=0')

    # -- required cases ----------------------------------------------------
    def test_correct_planning_end_to_end_with_journal(self):
        created = self.schedule()  # 14:00-14:30, CH1
        body = created.json()
        self.assertEqual(body['schedule']['status'], 'pending')
        self.assertEqual(body['schedule']['channel_id'], 'CH1')
        evaluation = body['evaluation']
        self.assertTrue(evaluation['feasible'])
        self.assertAlmostEqual(evaluation['projection']['projected_peak_watts'], 4.2)
        self.assertAlmostEqual(evaluation['projection']['device_energy_wh'], 0.9)   # 1.8 W x 0.5 h
        self.assertAlmostEqual(evaluation['projection']['plan_energy_wh'], 2.1)     # 4.2 W x 0.5 h

        self.advance(60)  # 14:00
        result = self.tick()
        self.assertEqual([p['result'] for p in result['processed']], ['dispatched_start'])
        schedule = self.get_schedule(body['schedule']['id'])['schedule']
        self.assertEqual(schedule['status'], 'running')
        self.assertEqual(schedule['phase'], 'start')
        self.step()
        self.assertEqual(self.client.get(self.base + '/snapshot', headers=self.headers)
                         .json()['total_watts'], 4.2)  # CH3 2.4 + CH1 1.8

        self.advance(1800)  # 14:30
        result = self.tick()
        self.assertEqual([p['result'] for p in result['processed']], ['dispatched_end'])
        self.step()
        result = self.tick()
        self.assertEqual([p['result'] for p in result['processed']], ['completed'])
        schedule = self.get_schedule(body['schedule']['id'])['schedule']
        self.assertEqual(schedule['status'], 'completed')
        self.assertEqual(self.client.get(self.base + '/snapshot', headers=self.headers)
                         .json()['total_watts'], 2.4)  # lamp off again
        kinds = [e['kind'] for e in self.events()]
        for kind in ['schedule.created', 'schedule.dispatched', 'schedule.completed']:
            self.assertIn(kind, kinds)

    def test_cancelled_schedule_never_executes(self):
        created = self.schedule().json()['schedule']
        cancelled = self.client.post(f"{self.base}/schedules/{created['id']}/cancel", headers=self.headers)
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()['status'], 'cancelled')
        self.advance(60)
        self.assertEqual(self.tick()['processed'], [])
        self.assertEqual(self.commands(), [])  # nothing was ever issued
        again = self.client.post(f"{self.base}/schedules/{created['id']}/cancel", headers=self.headers)
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()['detail']['code'], 'schedule_not_active')

    def test_cancelling_running_schedule_stops_the_end_phase(self):
        schedule_id = self.schedule().json()['schedule']['id']
        self.advance(60)
        self.tick()
        self.step()
        self.advance(600)  # 14:10, inside the window
        cancelled = self.client.post(f'{self.base}/schedules/{schedule_id}/cancel', headers=self.headers)
        self.assertEqual(cancelled.json()['status'], 'cancelled')
        self.advance(1200)  # 14:30
        self.assertEqual(self.tick()['processed'], [])
        self.assertEqual(len(self.commands()), 1)  # start command only, no closing off
        self.assertEqual(self.get_schedule(schedule_id)['schedule']['status'], 'cancelled')

    def test_overlapping_same_channel_schedules_conflict(self):
        first = self.schedule().json()['schedule']
        conflict = self.schedule(start_offset=900, duration=1800, key='plan-0002', expect=409)
        detail = conflict.json()['detail']
        self.assertEqual(detail['code'], 'schedule_conflict')
        conflict_check = next(c for c in detail['evaluation']['checks'] if c['code'] == 'schedule_conflict')
        self.assertEqual(conflict_check['detail']['schedule_ids'], [first['id']])
        # Shared boundary instants are not overlaps.
        self.schedule(start_offset=1800, duration=1800, key='plan-0003')
        self.assertEqual(len(self.client.get(self.base + '/schedules', headers=self.headers).json()), 2)

    def test_peak_conflict_offers_reschedule_suggestions(self):
        self.client.patch(self.base + '/channels/CH2/assignment', headers=self.headers,
                          json={'name': 'LED-лента', 'room': 'Лаборатория', 'image': 'led-strip',
                                'allow_auto': True})
        self.schedule()  # CH1 14:00-14:30 -> 4.2 W projected
        preview = self.client.post(self.base + '/scheduler/evaluate', headers=self.headers,
                                   json={'channel_id': 'CH2', 'action': 'on', 'start_at': BASE,
                                         'duration_seconds': 1800})
        self.assertEqual(preview.status_code, 200, preview.text)
        evaluation = preview.json()
        self.assertFalse(evaluation['feasible'])
        self.assertEqual(evaluation['verdict'], 'infeasible')
        self.assertEqual([c['code'] for c in evaluation['checks'] if not c['ok']], ['peak_exceeded'])
        self.assertEqual(evaluation['suggestions'],
                         [{'start_at': BASE + 1800, 'end_at': BASE + 3600, 'projected_peak_watts': 6.6}])
        rejected = self.schedule(channel='CH2', key='plan-ch2-early', expect=409)
        self.assertEqual(rejected.json()['detail']['code'], 'peak_exceeded')
        accepted = self.schedule(channel='CH2', start_offset=1800, duration=1800, key='plan-ch2-late')
        self.assertTrue(accepted.json()['evaluation']['feasible'])

    def test_ch3_cannot_be_scheduled_in_any_direction(self):
        for action in ['on', 'off']:
            response = self.schedule(channel='CH3', action=action, key=f'plan-ch3-{action}', expect=409)
            self.assertEqual(response.json()['detail']['code'], 'protected_channel')
        preview = self.client.post(self.base + '/scheduler/evaluate', headers=self.headers,
                                   json={'channel_id': 'CH3', 'action': 'on', 'start_at': BASE,
                                         'duration_seconds': 60})
        self.assertEqual(preview.json()['verdict'], 'infeasible')
        self.assertEqual([], [s for s in self.client.get(self.base + '/schedules', headers=self.headers).json()])
        # The simulated fan keeps running untouched.
        self.assertEqual(self.client.get(self.base + '/snapshot', headers=self.headers)
                         .json()['channels'][2]['watts'], 2.4)

    def test_link_loss_makes_schedule_uncertain_then_recovers(self):
        schedule_id = self.schedule().json()['schedule']['id']
        self.advance(60)
        self.tick()
        self.step(outcome='timeout')  # link lost: command result unknown
        self.assertIsNone(self.client.get(self.base + '/snapshot', headers=self.headers).json()['total_watts'])
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['uncertain'])
        schedule = self.get_schedule(schedule_id)
        self.assertEqual(schedule['schedule']['status'], 'uncertain')
        # Authoritative telemetry resolves the ambiguity: the target was reached.
        self.clock.advance(.001)
        telemetry = self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                                     json={'channels': {'CH1': 1.8, 'CH2': 0, 'CH3': 2.4},
                                           'command_id': schedule['command']['id'],
                                           'measured_at': self.clock.now(), 'sequence': 1})
        self.assertEqual(telemetry.status_code, 200)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['start_confirmed'])
        self.advance(1800)
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_end'])
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['completed'])
        schedule = self.get_schedule(schedule_id)
        self.assertEqual(schedule['schedule']['status'], 'completed')
        self.assertEqual([t['status'] for t in schedule['command']['transitions']],
                         ['requested', 'sent', 'acknowledged'])

    def test_transport_error_target_not_reached_rejects_schedule(self):
        schedule_id = self.schedule().json()['schedule']['id']
        self.advance(60)
        self.tick()
        self.step(outcome='transport-error')
        self.clock.advance(.001)
        telemetry = self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                                     json={'channels': {'CH1': 0, 'CH2': 0, 'CH3': 2.4},
                                           'command_id': self.get_schedule(schedule_id)['command']['id'],
                                           'measured_at': self.clock.now(), 'sequence': 1})
        self.assertEqual(telemetry.status_code, 200)
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'target_not_reached')
        self.advance(1800)
        self.assertEqual(self.tick()['processed'], [])
        self.assertEqual(len(self.commands()), 1)  # never retried automatically
        self.assertEqual(self.get_schedule(schedule_id)['schedule']['status'], 'rejected')

    def test_stale_measurements_reject_planning_and_dispatch(self):
        # Planning time: no fresh sample, no new 'on' or 'off' plan.
        self.stale()
        self.assertEqual(self.schedule(expect=409).json()['detail']['code'], 'stale_measurements')
        self.assertEqual(self.schedule(action='off', key='plan-off', expect=409)
                         .json()['detail']['code'], 'stale_measurements')
        # Dispatch time: a plan accepted while fresh is still re-checked.
        self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                         json={'channels': {'CH1': 0, 'CH2': 0, 'CH3': 2.4}})
        schedule_id = self.schedule().json()['schedule']['id']
        self.stale()
        self.clock.advance(60)
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'stale_measurements')
        self.assertEqual(self.get_schedule(schedule_id)['schedule']['rejection_reason'], 'stale_measurements')

    def test_automation_consent_is_required_before_and_at_dispatch(self):
        rejected = self.schedule(channel='CH2', key='plan-no-consent', expect=409)
        self.assertEqual(rejected.json()['detail']['code'], 'automation_not_allowed')
        self.client.patch(self.base + '/channels/CH2/assignment', headers=self.headers,
                          json={'name': 'LED-лента', 'room': 'Лаборатория', 'image': 'led-strip',
                                'allow_auto': True})
        self.schedule(channel='CH2', key='plan-with-consent')
        # Consent revoked after planning: dispatch must refuse.
        self.client.patch(self.base + '/channels/CH2/assignment', headers=self.headers,
                          json={'name': 'LED-лента', 'room': 'Лаборатория', 'image': 'led-strip',
                                'allow_auto': False})
        self.advance(60)
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'automation_not_allowed')

    def test_manual_priority_beats_the_scheduler(self):
        self.command_and_ack('CH1', on=False, key='manual-off-1')  # hold until 14:29
        self.assertEqual(self.schedule(key='plan-during-hold', expect=409)
                         .json()['detail']['code'], 'manual_priority_active')
        later = self.schedule(start_offset=2100, duration=900, key='plan-after-hold')  # 14:35
        self.assertTrue(later.json()['evaluation']['feasible'])
        # A fresh manual action inside the planning horizon overrides the plan at dispatch.
        self.advance(1800)  # 14:29: the first hold expired
        self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                         json={'channels': {'CH1': 0, 'CH2': 0, 'CH3': 2.4}})
        self.command_and_ack('CH1', on=False, key='manual-off-2')  # new hold until 14:59
        self.advance(360)  # 14:35
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'manual_priority_active')

    def command_and_ack(self, channel, on, key):
        response = self.client.post(self.base + '/commands', headers=self.headers,
                                    json={'channel_id': channel, 'on': on, 'origin': 'manual',
                                          'idempotency_key': key})
        self.assertEqual(response.status_code, 200, response.text)
        self.step()

    def test_server_restart_recovers_pending_schedules(self):
        created = self.schedule().json()['schedule']
        restarted = TestClient(create_app(self.db, clock=self.clock))
        try:
            listing = restarted.get(self.base + '/schedules', headers=self.headers)
            self.assertEqual(listing.status_code, 200, listing.text)
            self.assertEqual([s['id'] for s in listing.json()], [created['id']])
            self.advance(60)
            tick = restarted.post(self.base + '/scheduler/tick', headers=self.headers, json={})
            self.assertEqual([p['result'] for p in tick.json()['processed']], ['dispatched_start'])
            self.assertEqual(restarted.get(f"{self.base}/schedules/{created['id']}", headers=self.headers)
                             .json()['schedule']['status'], 'running')
        finally:
            restarted.close()

    def test_repeated_tick_never_duplicates_commands(self):
        schedule_id = self.schedule().json()['schedule']['id']
        self.advance(60)
        first = self.tick()['processed']
        self.assertEqual([p['result'] for p in first], ['dispatched_start'])
        command_id = first[0]['command_id']
        second = self.tick()['processed']
        self.assertEqual([p['result'] for p in second], ['waiting_command'])
        self.assertEqual(self.get_schedule(schedule_id)['schedule']['command_id'], command_id)
        self.assertEqual(len(self.commands()), 1)
        # Even a manual re-issue of the derived idempotency key returns the same command.
        replay = self.client.post(self.base + '/commands', headers=self.headers,
                                  json={'channel_id': 'CH1', 'on': True, 'origin': 'schedule',
                                        'idempotency_key': f'schedule-{schedule_id}-start'})
        self.assertEqual(replay.json()['id'], command_id)

    def test_unconfirmed_command_is_not_success(self):
        schedule_id = self.schedule().json()['schedule']['id']
        self.advance(60)
        self.tick()
        snapshot = self.client.get(self.base + '/snapshot', headers=self.headers).json()
        self.assertEqual(snapshot['total_watts'], 2.4)  # nothing changed yet
        again = self.tick()['processed']
        self.assertEqual([p['result'] for p in again], ['waiting_command'])
        schedule = self.get_schedule(schedule_id)
        self.assertEqual(schedule['schedule']['status'], 'running')
        self.assertEqual(schedule['schedule']['phase'], 'start')
        self.assertEqual(self.commands()[0]['status'], 'requested')
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['start_confirmed'])

    def test_off_schedule_switches_the_load_off(self):
        self.client.patch(self.base + '/channels/CH2/assignment', headers=self.headers,
                          json={'name': 'LED-лента', 'room': 'Лаборатория', 'image': 'led-strip',
                                'allow_auto': True})
        on = self.client.post(self.base + '/commands', headers=self.headers,
                              json={'channel_id': 'CH2', 'on': True, 'origin': 'autopilot',
                                    'idempotency_key': 'auto-on-1'})
        self.assertEqual(on.status_code, 200, on.text)
        self.step()  # CH2 on at 4.2 W; autopilot leaves no manual hold
        self.schedule(channel='CH2', action='off', start_offset=300, key='plan-off-ch2')
        self.advance(360)  # 14:05
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['dispatched_start'])
        self.step()
        self.assertEqual([p['result'] for p in self.tick()['processed']], ['completed'])
        self.assertEqual(self.client.get(self.base + '/snapshot', headers=self.headers)
                         .json()['total_watts'], 2.4)

    def test_window_missed_after_downtime(self):
        self.schedule()
        self.advance(7200)  # 16:00: the whole window passed, e.g. downtime
        result = self.tick()['processed']
        self.assertEqual(result[0]['result'], 'rejected')
        self.assertEqual(result[0]['reason'], 'window_missed')
        self.assertEqual(self.commands(), [])

    def test_infeasible_constraints_have_no_suggestions(self):
        self.client.patch(self.base + '/channels/CH2/assignment', headers=self.headers,
                          json={'name': 'LED-лента', 'room': 'Лаборатория', 'image': 'led-strip',
                                'allow_auto': True})
        self.client.patch(self.base + '/settings', headers=self.headers,
                          json={'peak_watts': 4.2, 'manual_priority_minutes': 30})
        response = self.schedule(channel='CH2', key='plan-impossible', expect=409)
        detail = response.json()['detail']
        self.assertEqual(detail['code'], 'nominal_exceeds_peak')
        self.assertEqual(detail['evaluation']['suggestions'], [])

    def test_other_accounts_cannot_touch_foreign_schedules(self):
        schedule_id = self.schedule().json()['schedule']['id']
        other = self.register('other@example.test')
        for method, path, payload in [
                ('GET', '/schedules', None),
                ('POST', '/schedules', {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60,
                                        'duration_seconds': 60}),
                ('POST', '/scheduler/tick', {}),
                ('POST', '/scheduler/evaluate', {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60,
                                                 'duration_seconds': 60}),
                ('PATCH', f'/schedules/{schedule_id}', {'priority': 5}),
                ('POST', f'/schedules/{schedule_id}/cancel', {})]:
            response = self.client.request(method, self.base + path, headers=other, json=payload)
            self.assertEqual(response.status_code, 404, f'{method} {path}: {response.text}')
        # The second user's own controller is isolated and fully usable.
        own = self.client.post('/v1/controllers/simulator', headers=other, json={'name': 'Другой стенд'})
        other_base = f"/v1/controllers/{own.json()['id']}"
        self.client.patch(other_base + '/channels/CH1/assignment', headers=other,
                          json={'name': 'Светильник', 'room': 'Лаборатория', 'image': 'lamp',
                                'allow_auto': True})
        created = self.client.post(other_base + '/schedules', headers=other,
                                   json={'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60,
                                         'duration_seconds': 60})
        self.assertEqual(created.status_code, 201, created.text)
        self.assertNotIn(self.controller, [c['id'] for c in
                                           self.client.get('/v1/controllers', headers=other).json()])
        foreign = self.client.get(other_base + '/schedules', headers=self.headers)
        self.assertEqual(foreign.status_code, 404)

    def test_invalid_api_requests_and_dates(self):
        cases = [
            {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE - 120, 'duration_seconds': 60},  # past
            {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 8 * 24 * 3600,
             'duration_seconds': 60},                                                                      # too far
            {'channel_id': 'CH1', 'action': 'on', 'start_at': '2026-10-27T14:00:00Z',
             'duration_seconds': 60},                                                                      # string date
            {'channel_id': 'CH1', 'action': 'on', 'start_at': True, 'duration_seconds': 60},               # bool
            {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60},                                  # no duration
            {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60, 'duration_seconds': 0},           # zero
            {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60, 'duration_seconds': -5},          # negative
            {'channel_id': 'CH1', 'action': 'off', 'start_at': BASE + 60, 'duration_seconds': 60},         # off+duration
            {'channel_id': 'CH9', 'action': 'on', 'start_at': BASE + 60, 'duration_seconds': 60},          # channel
            {'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60, 'duration_seconds': 60,
             'origin': 'manual'},                                                                          # unknown field
        ]
        for payload in cases:
            response = self.client.post(self.base + '/schedules', headers=self.headers, json=payload)
            self.assertEqual(response.status_code, 422, payload)
        nan = self.client.post(self.base + '/schedules',
                               content=b'{"channel_id":"CH1","action":"on","start_at":NaN,"duration_seconds":60}',
                               headers={'Content-Type': 'application/json', **self.headers})
        self.assertEqual(nan.status_code, 422)
        listing = self.client.get(self.base + '/schedules?status=finished', headers=self.headers)
        self.assertEqual(listing.status_code, 422)
        self.assertEqual(self.client.get(self.base + '/schedules?limit=0', headers=self.headers).status_code, 422)
        self.assertEqual(self.client.get(self.base + '/schedules?limit=201', headers=self.headers).status_code, 422)
        self.assertEqual(self.client.get(self.base + '/schedules/does-not-exist', headers=self.headers)
                         .status_code, 404)
        self.assertEqual(self.client.post(self.base + '/schedules', json={
            'channel_id': 'CH1', 'action': 'on', 'start_at': BASE + 60, 'duration_seconds': 60}).status_code, 401)
        self.assertEqual(self.client.post(self.base + '/scheduler/tick', json={}).status_code, 401)
        huge = self.client.post(self.base + '/schedules', content=b'x' * 17000,
                                headers={'Content-Type': 'application/json',
                                         **self.headers})
        self.assertEqual(huge.status_code, 413)
        self.assertEqual(self.client.get('/openapi.json').status_code, 404)  # docs stay disabled

    def test_modify_pending_schedule_and_revalidate(self):
        schedule_id = self.schedule(start_offset=3600, duration=1800, key='plan-move').json()['schedule']['id']
        moved = self.client.patch(f'{self.base}/schedules/{schedule_id}', headers=self.headers,
                                  json={'start_at': BASE + 60, 'duration_seconds': 900, 'priority': 3,
                                        'note': 'пораньше'})
        self.assertEqual(moved.status_code, 200, moved.text)
        schedule = moved.json()['schedule']
        self.assertEqual(schedule['start_at'], BASE + 60)
        self.assertEqual(schedule['end_at'], BASE + 960)
        self.assertEqual(schedule['priority'], 3)
        # A modification onto an occupied window is refused and changes nothing.
        self.schedule(start_offset=1500, duration=600, key='plan-blocker')  # 14:25-14:35
        clash = self.client.patch(f'{self.base}/schedules/{schedule_id}', headers=self.headers,
                                  json={'start_at': BASE + 1260})  # 14:21-14:36 overlaps blocker
        self.assertEqual(clash.status_code, 409)
        self.assertEqual(clash.json()['detail']['code'], 'schedule_conflict')
        self.assertEqual(self.get_schedule(schedule_id)['schedule']['start_at'], BASE + 60)
        # Running schedules are immutable.
        self.advance(120)  # 14:02: both moved plan and blocker are due
        self.tick()
        locked = self.client.patch(f'{self.base}/schedules/{schedule_id}', headers=self.headers,
                                   json={'priority': 9})
        self.assertEqual(locked.status_code, 409)
        self.assertEqual(locked.json()['detail']['code'], 'schedule_not_modifiable')

    def test_v2_schema_rejects_status_tampering(self):
        schedule_id = self.schedule().json()['schedule']['id']
        with closing(sqlite3.connect(self.db)) as db:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('UPDATE schedules SET status=?', ('invented',))
            db.rollback()
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE schedules SET channel_id='CH3'")

    def test_status_filter_and_listing(self):
        first = self.schedule(key='plan-a').json()['schedule']
        self.schedule(channel='CH2', key='plan-b', expect=409)  # nothing stored
        self.advance(60)
        self.tick()
        self.step()
        pending = self.client.get(self.base + '/schedules?status=pending', headers=self.headers).json()
        self.assertEqual(pending, [])
        running = self.client.get(self.base + '/schedules?status=running', headers=self.headers).json()
        self.assertEqual([s['id'] for s in running], [first['id']])
        for entry in running:
            self.assertEqual(entry['source'], 'simulator')
            self.assertIn('duration_seconds', entry)


if __name__ == '__main__':
    unittest.main()
