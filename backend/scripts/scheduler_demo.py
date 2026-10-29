"""Virtual-time demonstration of the load scheduler.

Runs the classic scenario entirely on a VirtualClock: today at 13:59 an owner
schedules the lamp to run 14:00-14:30, the clock jumps to 14:00, the
scheduler tick dispatches, the simulator acknowledges, the clock jumps to
14:30 and the closing off-phase runs. No real waiting happens.

Usage:
    python scripts/scheduler_demo.py
"""
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from specwatt_api.app import create_app  # noqa: E402
from specwatt_api.clock import VirtualClock  # noqa: E402


def utc_time(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime('%H:%M:%S')


def main() -> None:
    base_epoch = datetime(2026, 10, 27, 14, 0, tzinfo=timezone.utc).timestamp()
    clock = VirtualClock(base_epoch - 60)  # 13:59:00
    with tempfile.TemporaryDirectory(prefix='specwatt-demo-') as temp:
        app = create_app(Path(temp) / 'demo.sqlite3', clock=clock)
        client = TestClient(app)

        def log(message: str) -> None:
            print(f'[{utc_time(clock.now())}] {message}')

        def advance(seconds: float) -> None:
            """Jump the clock and refresh telemetry, as real devices keep
            reporting: without a fresh sample the server treats measurements
            as stale after the 30 s freshness window."""
            clock.advance(seconds)
            snapshot = client.get(base + '/snapshot', headers=headers).json()
            channels = {c['id']: c['last_known_watts'] for c in snapshot['channels']}
            client.post(base + '/simulator/telemetry', headers=headers, json={'channels': channels})

        headers = {'Authorization': 'Bearer ' + client.post(
            '/v1/auth/register', json={'email': 'owner@example.test', 'password': 'test-password-123'}
        ).json()['access_token']}
        cid = client.post('/v1/controllers/simulator', headers=headers,
                          json={'name': 'Учебный стенд'}).json()['id']
        base = f'/v1/controllers/{cid}'
        # The lamp starts lit in the simulator; give it automation consent.
        client.patch(base + '/channels/CH1/assignment', headers=headers,
                     json={'name': 'Светильник', 'room': 'Лаборатория', 'image': 'lamp',
                           'allow_auto': True})
        client.post(base + '/commands', headers=headers,
                    json={'channel_id': 'CH1', 'on': False, 'origin': 'autopilot',
                          'idempotency_key': 'demo-lamp-off'})
        client.post(base + '/simulator/step', headers=headers, json={})

        log('13:59, планировщик: «светильник работает с 14:00 до 14:30»')
        created = client.post(base + '/schedules', headers=headers,
                              json={'channel_id': 'CH1', 'action': 'on', 'start_at': base_epoch,
                                    'duration_seconds': 1800, 'note': 'демо'})
        schedule = created.json()
        projection = schedule['evaluation']['projection']
        log(f"создано: статус={schedule['schedule']['status']}, "
            f"прогноз пика={projection['projected_peak_watts']} Вт, "
            f"энергия устройства={projection['device_energy_wh']} Вт·ч")

        advance(60)  # -> 14:00 (clock jump + telemetry refresh)
        log('переводим часы на 14:00 (мгновенно) и запускаем tick')
        result = client.post(base + '/scheduler/tick', headers=headers, json={}).json()
        log(f"tick: {[p['result'] for p in result['processed']]}")
        client.post(base + '/simulator/step', headers=headers, json={})
        log(f"симулятор подтвердил: total={result['snapshot']['total_watts']} Вт -> "
            f"{client.get(base + '/snapshot', headers=headers).json()['total_watts']} Вт")

        advance(1800)  # -> 14:30 (clock jump + telemetry refresh)
        log('переводим часы на 14:30 (мгновенно) и запускаем tick: закрывающая фаза off')
        result = client.post(base + '/scheduler/tick', headers=headers, json={}).json()
        log(f"tick: {[p['result'] for p in result['processed']]}")
        client.post(base + '/simulator/step', headers=headers, json={})
        result = client.post(base + '/scheduler/tick', headers=headers, json={}).json()
        log(f"tick: {[p['result'] for p in result['processed']]}")
        log(f"итог: статус={result['snapshot']['channels'][0]['status'] if 'status' in result['snapshot']['channels'][0] else 'completed'}, "
            f"total={client.get(base + '/snapshot', headers=headers).json()['total_watts']} Вт")

        log('журнал событий:')
        for event in client.get(base + '/events', headers=headers).json():
            if event['kind'].startswith('schedule') or event['kind'].startswith('command'):
                log(f"  seq={event['sequence']:>3} {event['kind']:<22} ch={event['channel_id']} reason={event['reason']}")
        client.close()
    print('DEMO OK: весь сценарий выполнен без единой секунды реального ожидания')


if __name__ == '__main__':
    os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
    main()
