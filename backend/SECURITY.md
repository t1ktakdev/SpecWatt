# Local service security boundary

This service is a local development foundation. Bind it to `127.0.0.1`. Do not expose it publicly as a completed production security implementation.

## Implemented safeguards

- Registration creates a real local SQLite user; login verifies a salted memory-hard scrypt hash (`N=32768`, `r=8`, `p=3`, 32-byte result). The format records its work factors. Passwords are never returned, stored in plaintext, or included in validation errors. Minimum length 12, maximum 128 characters.
- Sessions are random 256-bit opaque tokens with a 24-hour expiry; SQLite stores their SHA-256 digests. Logout revokes the current token. Native clients must use protected token storage and clear passwords from component state after use.
- Every controller route checks the authenticated owner before accessing state; unowned resource IDs return 404. Queries use bound parameters.
- CH3 is protected in request processing, dispatch and SQLite constraints. Neither image assignment nor an origin label removes protection. Protection must be independently implemented in future firmware.
- Command requests are transactional, idempotent and audited. Requesting is distinct from simulator acknowledgement. Permission and peak changes between request and dispatch are checked again. Ambiguous transport outcomes do not replay commands.
- A complete authoritative simulator sample resolves timeout/transport-error to `reconciled` whether the target matches or not. `target_not_reached` explicitly identifies mismatch, and does not imply delivery. Measured power follows the sample; manual priority remains anchored to the original request. This keeps API and client locks consistent without automatic retries.
- Simulator commands require fresh complete samples; automatic/scheduled commands additionally require per-channel consent and no active manual hold. Only one command per controller can remain in flight.
- Strict JSON schemas reject unknown fields, coercion of strings to booleans, unsupported channel IDs, nonfinite/unsupported simulator power and attempts to change CH3 power. Request bodies are limited to 16 KiB before JSON parsing.
- Per-process IP limits: 10 auth requests/minute and 120 other requests/minute. Rate limit bookkeeping is bounded. Proxy headers are not trusted by this application; do not put a public proxy in front of the development process.
- CORS is disabled by default. Optional `SPECWATT_CORS_ORIGINS` accepts only exact HTTP(S) origins, with no wildcards or credentials; methods and headers are restricted. Native clients do not use browser CORS. `/docs`, `/redoc` and `/openapi.json` are disabled. API responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- No real controller transport, GPIO, scanning, cloud infrastructure, email sender, embedded secrets or deployment keys are included. The simulator cannot send a physical command.

## Threats and remaining controls

| Threat | Current mitigation | Still required for public/hardware integration |
| --- | --- | --- |
| Other account accesses controller | Owner check on all controller routes | Pairing proof, user/controller membership policy, authorization review |
| Replay or duplicate actuation | Transactional idempotency, in-flight guard | Device-side nonce/sequence and durable acknowledgement protocol |
| Lost acknowledgement | Uncertain state, no automatic retry, explicit reconciliation | Real telemetry identity, ordering, freshness and transport tests |
| Unsafe protected load switching | CH3 immutable in model/dispatch/DB | Confirmed hardware fail-safe circuit and firmware tests |
| Brute force/account enumeration | Slow hash, per-IP limits, generic failed-login response | Central rate limits, abuse monitoring, compromised password checks, account recovery policy; registration conflict can reveal existing registration |
| Stolen session | Random token, digest at rest, expiry/logout | HTTPS, secure mobile storage, refresh/revocation policy, device/session management |
| SQLite file theft | Salted password hashes and token digests | OS permissions, encryption/storage policy, backup protection |
| Resource exhaustion | Body cap, bounded pages/rate table | Controller/user quotas, retention, server concurrency caps, shared rate limiter |
| Broken/malicious firmware | No hardware transport yet | Device authentication, protocol validation, watchdog/fail-safe trials |

Rate limits reset when the process restarts and are not shared across workers. `origin` expresses the owner's intended simulator policy; it is not an authenticated hardware or scheduler identity. No production scheduler role exists. SQLite is not encrypted. Event and measurement retention is currently unbounded; do not run indefinite telemetry ingestion without adding retention and quotas.

## Database backup and migration

The database uses schema version 1 with foreign keys and constraints. Stop the local server before copying its file for a development backup. Alternatively, use Python's SQLite online backup API into a new file. Protect backups as account data. Before any future schema migration, back up the database, implement a versioned transaction, and test restore against a temporary copy. A restore drill and long-term retention policy have not been performed.

To clear development data, stop the service and explicitly select the intended database file; clearing it removes all local accounts, sessions, controllers and history. This is not a remote account-deletion API.

No hardware safety certification, penetration test, public deployment approval or legal compliance claim is made.
