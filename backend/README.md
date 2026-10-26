# SpecWATT Brain — local development API

Implemented on 2026-10-26. This is a working FastAPI/SQLite service with local accounts and explicitly simulated controllers. It is not an ESP32 gateway and is not a publicly deployed service. The mobile offline demo remains independent of this API.

## Run on Windows

From `C:\Users\user\Documents\ChatGPT\SpecWATT\backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m unittest discover -s tests -v
.\.venv\Scripts\python scripts/smoke.py
.\.venv\Scripts\python -m uvicorn specwatt_api.app:create_app --factory --host 127.0.0.1 --port 8000
```

Default database: `backend/data/specwatt.sqlite3` (ignored by Git). Set `SPECWATT_DB` to use another absolute file path. Schema version 1 is initialized using `PRAGMA user_version`; newer unsupported versions fail startup. Never delete a database to resolve a migration error. Back it up first.

For an Android emulator on this same computer, use `http://10.0.2.2:8000` where Android emulator networking permits it; confirm Android cleartext development policy before connecting. For an attached physical device, `adb reverse tcp:8000 tcp:8000` can expose the host's loopback service as device `127.0.0.1:8000`. No LAN discovery or network exposure is enabled. External access requires a separately reviewed HTTPS deployment.

For a browser development client only, opt in to exact CORS origins before starting the server: `$env:SPECWATT_CORS_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'`. The default is no CORS origins. Wildcards, origin paths and credentials are rejected; allowed methods are GET/POST/PATCH and allowed request headers are Authorization/Content-Type. This does not remove Bearer authentication or change the network bind address.

## Contract

All bodies and responses are JSON. Authenticated requests use `Authorization: Bearer <access_token>`. Timestamps are Unix seconds in UTC. Every controller, snapshot, command, event and history response labels its source `simulator`. Unknown request fields are rejected. Passwords require 12–128 characters; email syntax is checked but ownership is not verified.

| Method and route | Input / result |
| --- | --- |
| `GET /health` | `{status:'ok', service:'specwatt-brain', hardware_transport:false}` |
| `POST /v1/auth/register` | `{email,password}` → 201 `{access_token,token_type:'bearer',expires_at,user_id}` |
| `POST /v1/auth/login` | `{email,password}` → same session shape |
| `POST /v1/auth/logout` | Revokes current session → 204 |
| `GET /v1/controllers` | Owner's `[{id,name,source}]` |
| `POST /v1/controllers/simulator` | `{name}` → 201 `{id,name,source:'simulator'}` |
| `GET /v1/controllers/{id}/snapshot` | Current snapshot described below |
| `PATCH /v1/controllers/{id}/settings` | `{peak_watts:2.4..8.4,manual_priority_minutes:1..120}` → snapshot |
| `PATCH /v1/controllers/{id}/channels/{channel}/assignment` | `{name,room,image,allow_auto}` → snapshot |
| `POST /v1/controllers/{id}/commands` | `{channel_id,on:boolean,origin:'manual'|'autopilot'|'schedule',idempotency_key}` → command |
| `GET /v1/controllers/{id}/commands/{command_id}` | Command and full transition list |
| `GET /v1/controllers/{id}/commands?limit=100` | Most recent commands; maximum 200 |
| `POST /v1/controllers/{id}/simulator/step` | `{outcome:'acknowledged'|'timeout'|'transport-error'}` (default acknowledged) → `{processed,source,snapshot}` |
| `POST /v1/controllers/{id}/simulator/telemetry` | `{channels:{CH1:0|1.8,CH2:0|4.2,CH3:2.4}}` → refreshed snapshot |
| `GET /v1/controllers/{id}/events?after=0&limit=100` | Events in ascending sequence order; retain last sequence as cursor |
| `GET /v1/controllers/{id}/measurements?after=0&limit=100` | Measurement history with the same cursor convention |

Supported images: `lamp`, `led-strip`, `fan`, `charger`, `socket`, `appliance`. Assigning an image does not change the physical capabilities or nominal power of a simulated channel.

Snapshot shape:

```json
{
  "controller_id": "uuid",
  "name": "Учебный стенд",
  "source": "simulator",
  "measured_at": 1792960000.0,
  "freshness": "fresh",
  "peak_watts": 7.0,
  "manual_priority_minutes": 30,
  "total_watts": 4.2,
  "channels": [{
    "id": "CH1", "protected": false, "watts": 1.8,
    "last_known_watts": 1.8, "freshness": "fresh", "manual_until": 0,
    "assigned": {"name": "Светильник", "room": "Учебный стенд", "image": "lamp", "allow_auto": false}
  }]
}
```

The actual response includes all three channels. CH2 initially consumes 0 W; CH3 consumes 2.4 W. Samples older than 30 seconds or measurements made uncertain by command timeout produce `freshness:'stale'`, `watts:null` and `total_watts:null`. Only `last_known_watts` retains the historical reading. The service does not invent fresh samples on reads. Refresh through the clearly named simulator telemetry endpoint.

## Command lifecycle

1. Submit a command with a new client-generated idempotency key (8–128 ASCII letters/digits/underscore/dash). The API stores `requested` without changing measured power.
2. Explicitly call simulator `/step`. It rechecks protection, permissions, manual priority, telemetry freshness and peak before dispatch, then records `sent` and the selected simulator outcome.
3. Only a simulated acknowledgement updates the simulated measured state. `timeout` and `transport-error` leave state uncertain and never trigger retries.
4. A later complete authoritative simulated telemetry sample resolves timed-out/transport-error commands to terminal `reconciled`. If the sample matches the target, reason is `simulator_telemetry_matches_target`; otherwise reason is `target_not_reached`. The measured state always follows the complete sample. Neither reason proves command delivery; the client must display a target mismatch as a failed requested outcome rather than successful actuation. Manual priority remains anchored to the original request time. Once reconciled, a user may explicitly issue a new command with a new key; neither the server nor client should automatically retry.

Only one command may be in flight per controller. A repeated key with the same intent returns the existing record without replaying it. A reused key with different intent gives 409 `idempotency_conflict`. Rejections are committed to the audit log before returning 409 with `{detail:{code,command}}`; subsequent same-key queries return that stored rejected command. After an uncertain result, the client must read/reconcile state rather than blindly submit a different key.

Default peak is 7 W. Turning LED on while lamp is on predicts 8.4 W and is rejected. Turn CH1 off, step to acknowledgement, then turn CH2 on and acknowledge: total becomes 6.6 W. CH3 cannot be switched under any origin. Automatic/scheduled commands require `allow_auto` and respect the per-channel manual hold. These origin labels apply the same stricter checks to this authenticated owner's simulator; no background scheduler is implied.

## Verification and limits

Tests exercise real ASGI requests and temporary SQLite databases, including ownership, persistence, CH3 database constraints, dispatch-time permission/peak changes, stale data, manual hold, idempotency, timeouts/reconciliation, request size, validation redaction, session expiry/revocation and rate limits.

`scripts/smoke.py` additionally starts a real Uvicorn process on loopback using a temporary SQLite database, checks registration and command acknowledgement over HTTP, then terminates its own server and removes the temporary data. It never uses a real account or device. See [TEST_REPORT.md](TEST_REPORT.md) for the recorded verification scope.

The installed Starlette test client currently emits a deprecation warning for its `httpx` compatibility layer; tests still run. `requirements-dev.txt` pins the tested HTTPX version. No physical controller was tested.

Remaining work: real controller pairing/authentication and firmware protocol, automated simulator clock/stream, durable scheduling and optimizer integration, email verification and password recovery, account deletion/export workflow, PostgreSQL migration, distributed rate limiting, production deployment, backup policy/restore drills, dependency audit and operational monitoring. See [SECURITY.md](SECURITY.md). No API endpoint reports these as implemented.

Official references consulted: [FastAPI security dependencies](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/), [Pydantic strict validation](https://pydantic.dev/docs/validation/latest/concepts/strict_mode/), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). The auth implementation deliberately uses opaque revocable server sessions instead of JWT.
