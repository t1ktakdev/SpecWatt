"""Exercise a real loopback Uvicorn server with an ephemeral database/account."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main():
    root = Path(__file__).resolve().parents[1]
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='specwatt-smoke-') as temp:
        env = {**os.environ, 'SPECWATT_DB': str(Path(temp) / 'smoke.sqlite3'),
               'SPECWATT_SCHEDULER_ENABLED': '0'}
        server = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'specwatt_api.app:create_app', '--factory',
             '--host', '127.0.0.1', '--port', str(port), '--log-level', 'error'],
            cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        base = f'http://127.0.0.1:{port}'
        token = None

        def call(method, path, payload=None):
            headers = {'Content-Type': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            req = Request(base + path, method=method, headers=headers,
                          data=json.dumps(payload).encode() if payload is not None else None)
            with urlopen(req, timeout=5) as response:
                return json.loads(response.read())

        try:
            for _ in range(100):
                try:
                    assert call('GET', '/health')['status'] == 'ok'
                    break
                except URLError:
                    if server.poll() is not None:
                        raise RuntimeError('Smoke server failed to start') from None
                    time.sleep(0.1)
            else:
                raise RuntimeError('Smoke server readiness timeout')
            session = call('POST', '/v1/auth/register', {
                'email': secrets.token_hex(8) + '@example.test', 'password': secrets.token_urlsafe(24)})
            token = session['access_token']
            cid = call('POST', '/v1/controllers/simulator', {'name': 'Smoke simulator'})['id']
            path = '/v1/controllers/' + cid
            assert call('GET', path + '/snapshot')['total_watts'] == 4.2
            # Exercise the merged scheduler contract over HTTP, including
            # consent, protected-channel rejection and cancellation.
            call('PATCH', path + '/channels/CH1/assignment', {
                'name': 'Smoke lamp', 'room': 'Test', 'image': 'lamp', 'allow_auto': True})
            plan = {'channel_id': 'CH1', 'action': 'on', 'start_at': time.time() + 60,
                    'duration_seconds': 60}
            evaluation = call('POST', path + '/scheduler/evaluate', plan)
            assert evaluation['feasible'] is True
            schedule = call('POST', path + '/schedules', plan)['schedule']
            assert any(s['id'] == schedule['id'] for s in call('GET', path + '/schedules'))
            assert call('POST', path + '/schedules/' + schedule['id'] + '/cancel')['status'] == 'cancelled'
            assert call('POST', path + '/scheduler/tick', {})['processed'] == []
            try:
                call('POST', path + '/schedules', {**plan, 'channel_id': 'CH3'})
            except HTTPError as error:
                assert error.code == 409
            else:
                raise AssertionError('Protected CH3 schedule accepted')
            command = call('POST', path + '/commands', {
                'channel_id': 'CH1', 'on': False, 'origin': 'manual', 'idempotency_key': 'smoke-command'})
            assert command['status'] == 'requested'
            assert call('GET', path + '/snapshot')['total_watts'] == 4.2
            assert call('POST', path + '/simulator/step', {})['snapshot']['total_watts'] == 2.4
            result = call('GET', path + '/commands/' + command['id'])
            assert [x['status'] for x in result['transitions']] == ['requested', 'sent', 'acknowledged']
            print('PASS: loopback HTTP authentication, scheduler evaluation/create/list/cancel/tick, CH3 rejection, command request without state change, explicit simulator acknowledgement; no physical transport.')
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
            if server.stderr:
                server.stderr.close()


if __name__ == '__main__':
    main()
