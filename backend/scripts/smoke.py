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
from urllib.error import URLError
from urllib.request import Request, urlopen


def main():
    root = Path(__file__).resolve().parents[1]
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='specwatt-smoke-') as temp:
        env = {**os.environ, 'SPECWATT_DB': str(Path(temp) / 'smoke.sqlite3')}
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
            command = call('POST', path + '/commands', {
                'channel_id': 'CH1', 'on': False, 'origin': 'manual', 'idempotency_key': 'smoke-command'})
            assert command['status'] == 'requested'
            assert call('GET', path + '/snapshot')['total_watts'] == 4.2
            assert call('POST', path + '/simulator/step', {})['snapshot']['total_watts'] == 2.4
            result = call('GET', path + '/commands/' + command['id'])
            assert [x['status'] for x in result['transitions']] == ['requested', 'sent', 'acknowledged']
            print('PASS: real loopback HTTP register, owner simulator, 4.2W snapshot, request without state change, simulator acknowledgement, 2.4W snapshot; no physical transport.')
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
