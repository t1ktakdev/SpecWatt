import sqlite3
from contextlib import closing
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from fastapi.testclient import TestClient

from specwatt_api.app import create_app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'test.sqlite3'
        self.client = TestClient(create_app(self.db))
        self.headers = self.register('owner@example.test')
        response = self.client.post('/v1/controllers/simulator', headers=self.headers, json={'name': 'Учебный стенд'})
        self.assertEqual(response.status_code, 201, response.text)
        self.controller = response.json()['id']
        self.base = f'/v1/controllers/{self.controller}'

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def register(self, email):
        response = self.client.post('/v1/auth/register', json={'email': email, 'password': 'test-password-123'})
        self.assertEqual(response.status_code, 201, response.text)
        return {'Authorization': f"Bearer {response.json()['access_token']}"}

    def command(self, channel='CH1', on=False, key='command-0001', origin='manual'):
        return self.client.post(self.base + '/commands', headers=self.headers,
                                json={'channel_id': channel, 'on': on, 'idempotency_key': key, 'origin': origin})

    def snapshot(self):
        return self.client.get(self.base + '/snapshot', headers=self.headers).json()

    def test_authentication_and_owner_scope(self):
        self.assertEqual(self.client.get('/v1/controllers').status_code, 401)
        other = self.register('other@example.test')
        self.assertEqual(self.client.get(self.base + '/snapshot', headers=other).status_code, 404)
        self.assertEqual(self.client.post(self.base + '/commands', headers=other, json={
            'channel_id': 'CH1', 'on': False, 'idempotency_key': 'other-command', 'origin': 'manual'}).status_code, 404)
        self.assertEqual(self.client.get('/v1/controllers', headers=other).json(), [])

    def test_command_requires_simulated_ack_and_is_idempotent(self):
        before = self.snapshot()
        self.assertEqual(before['total_watts'], 4.2)
        requested = self.command().json()
        self.assertEqual(requested['status'], 'requested')
        self.assertEqual(self.snapshot()['total_watts'], 4.2)
        self.assertEqual(self.command().json()['id'], requested['id'])
        step = self.client.post(self.base + '/simulator/step', headers=self.headers, json={'outcome': 'acknowledged'})
        self.assertEqual(step.status_code, 200, step.text)
        self.assertEqual(self.snapshot()['total_watts'], 2.4)
        command = self.client.get(self.base + '/commands/' + requested['id'], headers=self.headers).json()
        self.assertEqual(command['status'], 'acknowledged')
        self.assertEqual([x['status'] for x in command['transitions']], ['requested', 'sent', 'acknowledged'])
        self.assertEqual(self.command().json()['status'], 'acknowledged')
        conflict = self.command(on=True)
        self.assertEqual(conflict.status_code, 409)

    def test_protection_cannot_be_overridden_and_rejection_is_audited(self):
        for origin in ['manual', 'autopilot', 'schedule']:
            response = self.command(channel='CH3', key='protected-' + origin, origin=origin)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()['detail']['code'], 'protected_channel')
        self.assertEqual(self.snapshot()['channels'][2]['watts'], 2.4)
        response = self.client.patch(self.base + '/channels/CH3/assignment', headers=self.headers,
                                    json={'name': 'Fan', 'room': 'Stand', 'image': 'fan', 'allow_auto': True})
        self.assertEqual(response.status_code, 409)
        events = self.client.get(self.base + '/events', headers=self.headers).json()
        self.assertEqual(sum(e['kind'] == 'command.rejected' for e in events), 3)

    def test_stale_measurements_auto_permissions_and_peak_are_enforced(self):
        auto = self.command(origin='autopilot')
        self.assertEqual(auto.status_code, 409)
        self.assertEqual(auto.json()['detail']['code'], 'automation_not_allowed')
        peak = self.command(channel='CH2', on=True, key='peak-command')
        self.assertEqual(peak.json()['detail']['code'], 'peak_exceeded')
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                db.execute('UPDATE controllers SET measured_at=0')
        response = self.command(key='stale-command')
        self.assertEqual(response.json()['detail']['code'], 'stale_measurements')
        self.assertIsNone(self.snapshot()['total_watts'])

    def test_timeout_does_not_change_measurement_or_resend(self):
        requested = self.command().json()
        self.client.post(self.base + '/simulator/step', headers=self.headers, json={'outcome': 'timeout'})
        command = self.client.get(self.base + '/commands/' + requested['id'], headers=self.headers).json()
        self.assertEqual(command['status'], 'timeout')
        self.assertEqual(self.command().json()['status'], 'timeout')
        self.assertIsNone(self.snapshot()['total_watts'])
        self.assertEqual(self.client.post(self.base + '/simulator/step', headers=self.headers,
                                         json={'outcome': 'acknowledged'}).json()['processed'], 0)

    def test_validated_simulator_telemetry_reconciles_timeout(self):
        requested = self.command().json()
        self.client.post(self.base + '/simulator/step', headers=self.headers, json={'outcome': 'timeout'})
        response = self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                                    json={'channels': {'CH1': 0, 'CH2': 0, 'CH3': 2.4}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.snapshot()['total_watts'], 2.4)
        command = self.client.get(self.base + '/commands/' + requested['id'], headers=self.headers).json()
        self.assertEqual(command['status'], 'reconciled')
        self.assertGreater(self.snapshot()['channels'][0]['manual_until'], command['created_at'])
        invalid = self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                                  json={'channels': {'CH1': 0, 'CH2': 0, 'CH3': 0}})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(self.snapshot()['channels'][2]['watts'], 2.4)

    def assert_mismatched_telemetry_resolves_uncertainty(self, outcome):
        requested = self.command().json()
        self.client.post(self.base + '/simulator/step', headers=self.headers, json={'outcome': outcome})
        self.assertIsNone(self.snapshot()['total_watts'])
        blocked = self.command(key='before-reconciliation')
        self.assertEqual(blocked.json()['detail']['code'], 'stale_measurements')
        response = self.client.post(self.base + '/simulator/telemetry', headers=self.headers,
                                    json={'channels': {'CH1': 1.8, 'CH2': 0, 'CH3': 2.4}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['total_watts'], 4.2)
        self.assertEqual(response.json()['channels'][0]['watts'], 1.8)
        command = self.client.get(self.base + '/commands/' + requested['id'], headers=self.headers).json()
        self.assertEqual(command['status'], 'reconciled')
        self.assertEqual(command['reason'], 'target_not_reached')
        self.assertEqual([entry['status'] for entry in command['transitions']],
                         ['requested', 'sent', outcome, 'reconciled'])
        self.assertGreater(response.json()['channels'][0]['manual_until'], command['created_at'])
        self.assertEqual(self.command().json()['status'], 'reconciled')
        self.assertEqual(self.client.post(self.base + '/simulator/step', headers=self.headers,
                                         json={}).json()['processed'], 0)
        retried = self.command(key='explicit-new-intent')
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.json()['status'], 'requested')
        self.assertEqual(self.snapshot()['total_watts'], 4.2)

    def test_timeout_mismatch_reconciles_as_target_not_reached(self):
        self.assert_mismatched_telemetry_resolves_uncertainty('timeout')

    def test_transport_error_mismatch_reconciles_as_target_not_reached(self):
        self.assert_mismatched_telemetry_resolves_uncertainty('transport-error')

    def test_validation_and_logout(self):
        self.assertEqual(self.command(on='false').status_code, 422)
        invalid = self.client.post('/v1/auth/register', json={'email': 'not-email', 'password': 'secretXY'})
        self.assertEqual(invalid.status_code, 422)
        self.assertNotIn('secretXY', invalid.text)
        response = self.client.post('/v1/auth/login', json={'email': 'owner@example.test', 'password': 'wrong-password-123'})
        self.assertEqual(response.status_code, 401)
        valid = self.client.post('/v1/auth/login', json={'email': 'OWNER@example.test', 'password': 'test-password-123'})
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(self.client.get('/v1/controllers', headers={
            'Authorization': 'Bearer ' + valid.json()['access_token']}).status_code, 200)
        self.assertEqual(self.client.post('/v1/auth/logout', headers=self.headers).status_code, 204)
        self.assertEqual(self.client.get('/v1/controllers', headers=self.headers).status_code, 401)
        with closing(sqlite3.connect(self.db)) as db:
            password_hash = db.execute('SELECT password_hash FROM users LIMIT 1').fetchone()[0]
            self.assertNotIn('test-password', password_hash)

    def test_data_survives_server_restart(self):
        restarted = TestClient(create_app(self.db))
        response = restarted.get(self.base + '/snapshot', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['total_watts'], 4.2)
        restarted.close()

    def test_auth_rate_limit(self):
        for _ in range(9):
            self.client.post('/v1/auth/login', json={'email': 'missing@example.test', 'password': 'wrong-password-123'})
        response = self.client.post('/v1/auth/login', json={'email': 'missing@example.test', 'password': 'wrong-password-123'})
        self.assertEqual(response.status_code, 429)

    def test_automation_permission_rechecked_at_dispatch(self):
        assignment = {'name': 'Lamp', 'room': 'Lab', 'image': 'lamp', 'allow_auto': True}
        self.client.patch(self.base + '/channels/CH1/assignment', headers=self.headers, json=assignment)
        requested = self.command(origin='autopilot').json()
        assignment['allow_auto'] = False
        self.client.patch(self.base + '/channels/CH1/assignment', headers=self.headers, json=assignment)
        self.client.post(self.base + '/simulator/step', headers=self.headers, json={})
        command = self.client.get(self.base + '/commands/' + requested['id'], headers=self.headers).json()
        self.assertEqual(command['status'], 'rejected')
        self.assertEqual(command['reason'], 'automation_not_allowed')
        self.assertEqual(self.snapshot()['total_watts'], 4.2)

    def test_manual_priority_prevents_subsequent_automatic_command(self):
        self.command()
        self.client.post(self.base + '/simulator/step', headers=self.headers, json={})
        self.client.patch(self.base + '/channels/CH1/assignment', headers=self.headers,
                          json={'name': 'Lamp', 'room': 'Lab', 'image': 'lamp', 'allow_auto': True})
        automatic = self.command(on=True, origin='schedule', key='schedule-start')
        self.assertEqual(automatic.json()['detail']['code'], 'manual_priority_active')

    def test_pending_command_blocks_second_distinct_command(self):
        self.assertEqual(self.command().status_code, 200)
        second = self.command(channel='CH2', on=False, key='second-command')
        self.assertEqual(second.json()['detail']['code'], 'command_in_flight')

    def test_peak_limit_rechecked_after_settings_change(self):
        self.client.patch(self.base + '/settings', headers=self.headers,
                          json={'peak_watts': 8.4, 'manual_priority_minutes': 30})
        requested = self.command(channel='CH2', on=True).json()
        self.client.patch(self.base + '/settings', headers=self.headers,
                          json={'peak_watts': 7.0, 'manual_priority_minutes': 30})
        self.client.post(self.base + '/simulator/step', headers=self.headers, json={})
        result = self.client.get(self.base + '/commands/' + requested['id'], headers=self.headers).json()
        self.assertEqual(result['status'], 'rejected')
        self.assertEqual(result['reason'], 'peak_exceeded')

    def test_sqlite_itself_enforces_ch3_and_hashes_sessions(self):
        token = self.headers['Authorization'].split()[1]
        with closing(sqlite3.connect(self.db)) as db:
            stored = db.execute('SELECT token_hash FROM sessions').fetchone()[0]
            self.assertNotEqual(stored, token)
            self.assertEqual(len(stored), 64)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE channels SET protected=0 WHERE id='CH3'")

    def test_expired_session_rejected(self):
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                db.execute('UPDATE sessions SET expires_at=0')
        self.assertEqual(self.client.get('/v1/controllers', headers=self.headers).status_code, 401)

    def test_large_request_and_unknown_fields_are_rejected(self):
        huge = self.client.post('/v1/auth/login', content=b'x' * 17000,
                                headers={'Content-Type': 'application/json'})
        self.assertEqual(huge.status_code, 413)
        self.assertEqual(self.client.post(self.base + '/commands', headers=self.headers,
                                          json={'channel_id': 'CH3', 'on': False, 'protected': False,
                                                'idempotency_key': 'override-test'}).status_code, 422)
        self.assertEqual(self.client.get('/docs').status_code, 404)
        self.assertEqual(self.client.get('/openapi.json').status_code, 404)

    def test_optional_cors_requires_exact_explicit_origins(self):
        with patch.dict('os.environ', {'SPECWATT_CORS_ORIGINS': 'http://localhost:8081'}):
            browser = TestClient(create_app(self.db))
        preflight = {'Origin': 'http://localhost:8081', 'Access-Control-Request-Method': 'GET',
                     'Access-Control-Request-Headers': 'authorization'}
        response = browser.options('/v1/controllers', headers=preflight)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:8081')
        self.assertNotIn('access-control-allow-credentials', response.headers)
        response = browser.options('/v1/controllers', headers={**preflight, 'Origin': 'https://other.example'})
        self.assertNotIn('access-control-allow-origin', response.headers)
        browser.close()
        with patch.dict('os.environ', {'SPECWATT_CORS_ORIGINS': '*'}):
            with self.assertRaises(ValueError):
                create_app(self.db)


if __name__ == '__main__':
    unittest.main()
