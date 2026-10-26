# Backend verification — 2026-10-26

Working directory: `C:\Users\user\Documents\ChatGPT\SpecWATT\backend`.

Environment actually used: Windows, CPython 3.13, FastAPI 0.141.1, Pydantic 2.13.4, Starlette 1.6.0, Uvicorn 0.53.0, HTTPX 0.28.1. Runtime/dev requirements pin those package versions. A clean independent virtual-environment installation has not been verified.

| Command | Observed result |
| --- | --- |
| `python -m unittest discover -s tests -v` | 19 tests; includes exact-origin CORS and mismatch reconciliation regressions |
| `python scripts/smoke.py` | Passed real loopback HTTP registration, controller creation, 4.2 W snapshot, command request without state change, explicit simulator acknowledgement and 2.4 W snapshot |
| `python -m compileall -q specwatt_api tests scripts` | Exit code 0 |

The test suite initially failed because implementation was absent; subsequent implementation failures exposed and fixed an SQL placeholder mismatch and explicit test database connection closure on Windows. Added regressions cover permission and peak changes between command request and simulator dispatch.

Verified behaviors:

- Required authentication, owner scoping, unknown-owner resource hiding.
- Real salted password verification with normalized email, opaque token digest storage, logout and expiry.
- SQLite persistence across independently created app instances.
- Command lifecycle, audit history, idempotency/reused-key conflict, one in-flight request.
- CH3 rejects manual/autopilot/schedule commands; assignment cannot enable automation; SQLite rejects removing protection.
- Automatic permission, manual priority and power cap checks; dispatch revalidates changed permissions/settings.
- Stale samples suppress current total; timeout preserves uncertainty and does not replay; complete matching simulated telemetry reconciles.
- Unknown JSON fields, string booleans, oversized bodies and invalid telemetry are rejected.
- Password values are omitted from validation errors; diagnostic routes disabled; auth rate limit enforced.
- Optional exact-origin CORS preflight allows a configured browser origin, rejects other origins and rejects wildcard configuration.
- Review regression reproduced for both timeout and transport-error: a complete sample disagreeing with the target previously cleared snapshot uncertainty while leaving the command unresolved. Both now reconcile terminally with `target_not_reached`, retain actual measured power and original manual hold, never replay the old key, and allow only a new explicit user request.

Known test warning: Starlette emits a deprecation warning about its HTTPX compatibility adapter. No assertion failures remain. This is not a security/dependency audit.

Not verified: physical Android → backend integration, Android cleartext development networking, actual ESP32 identity/transport/telemetry, hardware fail-safe behavior, high concurrency/load, email/account recovery, production TLS, backup restoration, public deployment, legal compliance, or a background scheduler. The server intentionally labels all controller values and command acknowledgements as simulated.
