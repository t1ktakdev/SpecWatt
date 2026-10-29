# SpecWATT Stage 1 — local USB Bridge to Brain

Stage 1 is an UNPAIRED, non-actuating, read-only diagnostic USB bridge for
the already flashed ESP32 Stage 0. No sensor is connected or measured.

## Hardware and safety
- Classic ESP32-D0WD-V3, Arduino identifies ESP32-D0WDQ5; 4 MiB flash.
- CH340 UART VID=1A86, PID=7523, auto-detect COM port; COM8 during tests.
- 115200 baud; JSON lines. Host command allowlist: PING, INFO, STATUS ONLY.
- Valid STATUS: schema 1, source diagnostic, measured false,
  sensor_connected false, hardware_actuation false,
  demo_enabled false, protected_channel CH3.
- Host bridge never sends DEMO_START/STEP, GPIO, relay, channel control,
  simulator step or firmware upload. No 220 V or physical load.
- Existing backup D:\SpecWATT-ESP32-Stage0\backups must remain untouched.
- Never disclose backup contents, account tokens, or credentials.

## Run the bridge

From isolated worktree D:\SpecWATT-stage1-worktree, run:

    D:\SpecWATT-ESP32-Stage0\venv\Scripts\python.exe -B -m tools.esp32_bridge.bridge --status-file D:\SpecWATT-ESP32-Stage1\bridge-status.json --interval 2

Python requires pyserial 3.5 (already available in Stage 0 venv).
Close any Serial Monitor first: only one process can own COM8.
Press Ctrl+C to close the bridge. Host bridge updates a local JSON file
atomically; it does not listen on a network port.

A missing USB, malformed JSON, timeout, wrong firmware or reboot makes
status offline; a bounded reconnect backoff is used; on reconnect PING,
INFO and STATUS must all pass again. Missing/stale (>12s) file is considered
disconnected by Brain. Do not confuse a simulated disconnect with unplug.

## Brain integration

In another terminal, from the Stage 1 worktree backend folder:

    $env:SPECWATT_DB='D:\SpecWATT-ESP32-Stage1\test-only.sqlite3'
    $env:SPECWATT_USB_BRIDGE_STATUS='D:\SpecWATT-ESP32-Stage1\bridge-status.json'
    $env:SPECWATT_SCHEDULER_ENABLED='0'
    python -m uvicorn specwatt_api.app:create_app --factory --host 127.0.0.1 --port 8000

Always use a temporary SQLite database when testing; not an existing
account or production database. Port 8000 is loopback ONLY.

- GET /health continues to return hardware_transport:false.
- GET /v1/controllers/{id}/diagnostics/usb-bridge needs bearer auth,
  a loopback client (127.0.0.1 or ::1), and owner access to an EXISTING simulator controller. Returns host bridge
  diagnostic state, but paired:false, hardware_transport:false,
  source:diagnostic, measured:false always.
- Existing simulator API remains source:simulator, including commands
  and demo telemetry. Nothing is forwarded to physical GPIO.
- CH3 cannot be switched through the bridge, and CH3 simulator commands
  are rejected by existing Brain safety checks.

## Repeat the tests

From the Stage 1 worktree root, set the Python import path:

    $env:PYTHONPATH='D:\SpecWATT-stage1-worktree;D:\SpecWATT-stage1-worktree\backend'

Then run these commands independently:

    python -m unittest discover -s tools\esp32_bridge\tests -v
    python -m unittest discover -s backend\tests -p test_usb_bridge_api.py -v
    python -B tools\esp32_bridge\run_live_acceptance.py
    python -m unittest discover -s backend\tests -v
    python -m unittest discover -s security -v
    python -m bandit -r backend\specwatt_api tools\esp32_bridge -ll -q
    python security\scan_secrets.py
    python security\scan_secrets.py --history

The live acceptance test starts the physical COM8 bridge and a loopback
FastAPI server with a throwaway DB, creates test-only owners, checks 401,
404, 200, CH3 409, idempotency, and simulator-only command status.
It stops the bridge and verifies disconnected after release.

## Limitations and Stage 2 outline

This is NOT a paired hardware transport, real current sensor integration,
physical command ACK, secure hardware pairing or measured power.
No actual cable hot-unplug test has been performed; fake serial tests
exercise loss and recovery; a supervised hardware unplug remains separate.

Future Stage 2 needs versioned protocol schema, authenticated controller
identity and pairing, channel capability matrix, command_id, monotonic
sequence, measured_at, source and valid sensor metadata, freshness
fresh/stale/unknown, durable idempotency and CH3 fail-safe review.
Never turn simulation values into real measurements.
