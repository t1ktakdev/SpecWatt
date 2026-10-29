# SpecWATT threat model (v6 public tree)

Scope: the code published on `main` as of 2026-10-27 (commit `8a123c8`).
**v7 is NOT published** — `git ls-remote` shows only `main`. If v7 exists on a
developer machine, everything below must be re-verified against it; see
[v7-retest-checklist.md](v7-retest-checklist.md).

This is a working engineering document, not a certification. Standards used as
requirement sources: OWASP MASVS / MASTG, OWASP API Security Top 10 (2023),
OWASP ASVS v4 (chapters 2, 3, 4, 13), FastAPI/Expo security guidance. Passing
the automated checks in `security/` does not by itself demonstrate compliance
with any standard.

## 1. System and trust boundaries

```
[Android app (Expo/RN)]  --Bearer token over HTTP(S)-->  [FastAPI simulator]
        |                                                       |
        | SecureStore (native) / memory (web)            [SQLite file]
        |                                                       |
[Offline demo store]   --no API access--                 [simulated channels]
                                                                |
                                                [future: real ESP32 — NOT BUILT]
```

- **B1 — Android ⇄ API.** Bearer token, no cookies, CORS off by default.
  In dev builds HTTP is allowed only to loopback / `10.0.2.2` hosts; release
  builds enforce HTTPS client-side, and Android blocks cleartext by default.
- **B2 — API ⇄ SQLite.** One file, per-request connections, transactions via
  `BEGIN IMMEDIATE`. The DB is local and trusted-ish, but treated as attack
  surface for state corruption (fault injection tests exist).
- **B3 — API ⇄ simulator "hardware".** `/simulator/step` and
  `/simulator/telemetry` are **owner-controlled simulation inputs**, not a
  device protocol. There is no device identity, no pairing, no firmware. Any
  design that lets these endpoints act for real hardware is out of scope until
  a device identity exists.
- **B4 — offline demo ⇄ server.** Hard separation: the demo store never calls
  the API and the API client never touches the demo store (asserted by
  `security/test_repo_hygiene.py`).

## 2. Assets

1. Ability to actuate CH1/CH2 (and the *inability* to actuate CH3).
2. Session tokens (account takeover risk).
3. Password verifiers in SQLite.
4. Telemetry/measurement history integrity (drives automation decisions).
5. The user's consent flags (`allow_auto`) and manual-priority holds.

## 3. Adversaries

| # | Adversary | Capabilities |
|---|---|---|
| A1 | Ordinary user | Own account, own app instance |
| A2 | Second account | Own valid credentials and token |
| A3 | Same-LAN attacker | Can reach the API port if it is ever bound off-loopback; no credentials |
| A4 | Token thief | Has copied a bearer token (device access, backup, logs) |
| A5 | Fake/unknown controller | Future: device impersonating a paired controller |
| A6 | Corrupted state | Bad DB rows, clock skew, truncated files |
| A7 | Scripted flood | Rapid automated requests, replays, concurrent racing |

## 4. Risk register (consequence / existing / missing / verification)

Legend: ✔ implemented and tested; ◐ implemented, gap documented; ✗ not
applicable to v6 simulator but required later.

### R1 — Cross-user access to controllers/commands/history (A2) — API1:BOLA
- **Consequence:** user B reads or switches user A's loads.
- **Existing:** every controller route resolves `owned(db, cid, uid)` →
  uniform `404 controller_not_found`; unauthenticated requests get 401 with
  `WWW-Authenticate`; controller/command IDs are UUIDs.
- **Missing:** nothing known for v6. Resource quotas per user (controller
  creation is unlimited) remain a DoS concern, not BOLA.
- **Verification:** `security/test_auth_bola.py` — full endpoint×method matrix
  answers identical 404, no state change, no existence leak; command IDs of A
  unusable inside B's controller.

### R2 — Session theft and reuse (A4)
- **Consequence:** attacker switches loads or reads history as the victim.
- **Existing:** 256-bit random tokens; SHA-256 digests at rest; 24 h expiry;
  logout revokes; expired sessions purged on next issue; mobile stores the
  token in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), web keeps it in
  memory only; client clears vault on any 401.
- **Missing:** no per-device session list, no refresh/rotation, no anomaly
  detection. ◐ Acceptable for local simulator; revisit before any deployment.
- **Verification:** `test_auth_bola.py` (revocation, expiry, digest-at-rest,
  multi-session isolation), `test_reliability_faults.py::ScenarioETests`,
  mobile static checks in `test_repo_hygiene.py`.

### R3 — Protected channel CH3 actuation (A1, A2, A6, A7)
- **Consequence:** the one load that must never be switched gets switched.
- **Existing:** four independent layers — (1) request-time rejection
  `protected_channel` for every origin; (2) dispatch-time re-check in
  `/simulator/step`; (3) assignment endpoint refuses `allow_auto` on CH3;
  (4) SQLite `CHECK(id!='CH3' OR (protected=1 AND allow_auto=0 AND watts=2.4))`
  blocks even direct DB tampering. Client also refuses CH3 before any network
  request.
- **Missing:** ✗ hardware-level fail-safe (future firmware requirement).
- **Verification:** `test_command_safety.py::Ch3ProtectionTests` (all origins ×
  both directions, assignment bypass, DB constraint), P1/P6 in
  `test_invariants.py`, mobile static checks.

### R4 — Power ceiling violation, incl. concurrent racing (A7)
- **Consequence:** commanded loads exceed the configured peak.
- **Existing:** admission-time check and dispatch-time re-check of
  `peak_watts`; single in-flight command per controller; `BEGIN IMMEDIATE`
  serialises writers so two racing requests cannot both pass the check.
- **Missing:** nothing known for v6. Note the deliberate semantics:
  `peak_watts` is a command-admission limit — an authoritative telemetry
  sample may report a total above peak (misconfiguration does not falsify
  measurements). Automated commands are additionally gated by `allow_auto`
  consent and manual-priority holds, re-checked at dispatch.
- **Verification:** `PeakLimitTests` (exact 6.6/8.4 boundaries, off-commands
  never peak-blocked, settings race), `ConcurrencyTests` (6-way racing),
  P2 in `test_invariants.py`.

### R5 — Replay / duplicate actuation (A7)
- **Consequence:** one tap turns into two actuations; old keys execute new
  intents.
- **Existing:** per-controller `UNIQUE(controller_id, idempotency_key)`;
  same-key-same-intent returns the stored record without re-execution;
  same-key-different-intent → `idempotency_conflict`; ambiguous outcomes are
  never auto-retried by the server; the client sends one request and never
  retries transport errors.
- **Missing:** ✗ device-side nonce/sequence (future hardware protocol).
- **Verification:** `IdempotencyTests` (replay-after-ack does not re-execute,
  key-scope per controller, format boundaries), restart cases in
  `ScenarioCTests`, concurrent same-key test.

### R6 — Lost acknowledgement reported as success (A6, A7) — Reliability A
- **Consequence:** UI shows success while the load state is unknown; later
  automation decisions are made on fiction.
- **Existing:** three-phase lifecycle `requested → sent → acknowledged`;
  `timeout`/`transport-error` set `uncertain`; stale snapshots return
  `watts:null`, `total_watts:null` but keep `last_known_watts`; commands are
  refused while uncertain; reconciliation only *reports* (`reconciled` with
  `target_not_reached` / `simulator_telemetry_matches_target`), it never
  actuates; manual hold anchored to original request time.
- **Missing:** ◐ reconciliation has no time-correlation window — see finding
  **SEC-002**.
- **Verification:** `ScenarioATests`, `ScenarioDTests`, P3/P4 in
  `test_invariants.py`, crash-atomicity tests (`CrashAtomicityTests`).

### R7 — Stale or fabricated telemetry (A1, A6) — Reliability D
- **Consequence:** automation acts on outdated or impossible readings.
- **Existing:** freshness window (30 s, future-dated samples → stale);
  telemetry requires a *complete* nominal-or-zero snapshot for all channels;
  malformed telemetry is rejected without state change; telemetry never
  auto-actuates (only reconciles status).
- **Missing:** ✗ measurement identity/authentication — for the real ESP32,
  telemetry MUST come from an authenticated device, not the owner's token
  (finding **SEC-010**).
- **Verification:** `ScenarioDTests`, fuzz corpus in `test_fuzz_input.py`.

### R8 — Server restart / crash mid-dispatch (A6) — Reliability C
- **Consequence:** dangerous re-execution after restart, or a half-applied
  command.
- **Existing:** single transaction per step request (`BEGIN IMMEDIATE` +
  commit at request end) — a crash rolls back to `requested`; nothing
  auto-dispatches on boot; idempotency bookkeeping and the in-flight guard
  survive restarts.
- **Missing:** nothing known for v6; the simulator never executes on its own.
- **Verification:** `ScenarioCTests`, `CrashAtomicityTests` (injected crash
  during dispatch rolls back cleanly, no `sent` limbo).

### R9 — Brute force / enumeration of accounts (A3, A7)
- **Consequence:** credential guessing, account existence oracle.
- **Existing:** scrypt (N=32768, r=8, p=3) with per-user salt; constant-time
  comparison; dummy-hash path for unknown users (no timing oracle); identical
  error code for unknown user and wrong password; 10 auth requests/min/IP;
  registration conflict uses a non-confirming code and body.
- **Missing:** ◐ register 409 still reveals registration existence to a
  targeted attacker (documented upstream in backend/SECURITY.md); per-IP
  limits reset on restart and do not work behind proxies (both documented,
  pinned by tests).
- **Verification:** `test_auth_bola.py` (generic errors, rate limits with
  `Retry-After`, body cap), `ScenarioCTests::test_rate_limit_budget_resets_on_restart`.

### R10 — Corrupted local state (A6)
- **Consequence:** 500s on the login path, unavailable auth, undefined
  behaviour.
- **Existing:** DB CHECK constraints; schema versioning rejects newer files;
  corrupted password verifier now answers a clean 401 (**SEC-001**, fixed in
  this branch).
- **Missing:** wider corruption drills (e.g. truncated DB file) are manual.
- **Verification:** `test_auth_bola.py::test_corrupted_password_verifier_answers_401_not_500`.

### R11 — Malicious/broken client payloads (A7)
- **Consequence:** 5xx storms, parser confusion, resource exhaustion.
- **Existing:** strict Pydantic schemas (`extra='forbid'`, strict types),
  16 KiB body cap before parsing, bounded pagination, bounded rate table,
  validation errors redacted (no input echo), docs/OpenAPI disabled,
  `no-store` + `nosniff` on all responses.
- **Verification:** `test_fuzz_input.py` (≈220 malformed requests across 8
  endpoints — no 5xx, service healthy after each).

### R12 — Mobile client compromise surface (A1, A4)
- **Consequence:** token/password leakage from the device, demo/server state
  mixing.
- **Existing:** SecureStore native / memory web; password never persisted and
  cleared from component state; no secrets in the bundle; demo store holds no
  credentials; strict response validation (`parseSnapshot` refuses weakened
  CH3 data); response size cap; request timeout; dev HTTP restricted to
  loopback/emulator host.
- **Missing:** ◐ not yet verifiable: Android build/manifest analysis (no APK
  produced in v6), obfuscation, screenshot protection, root detection — all
  MASVS items that need a built artifact.
- **Verification:** static checks in `test_repo_hygiene.py::MobileStaticSecurityTests`;
  client behaviour tests in `mobile/specwatt-app/tests/api.test.mjs`.

### R13 — Public repository leaks (A3, A4)
- **Existing:** no secrets in 1-commit history (scanner over worktree +
  history, masked output); `.gitignore` covers env/keys/DBs; no `.env`
  tracked; backend pins exact dependency versions; no known-vulnerable Python
  deps (pip-audit clean).
- **Missing:** ◐ 5 high npm advisories in the Expo CLI toolchain (build-time
  only, no runtime path) — baselined, see **SEC-004**; GitHub-side controls
  (secret scanning, push protection, Dependabot alerts, branch protection,
  private vulnerability reporting) require owner action — see findings doc.
- **Verification:** `security/scan_secrets.py`, `test_repo_hygiene.py::RepoHygieneTests`,
  `security/check_npm_audit.py`.

## 5. What this model explicitly does NOT cover

- A real ESP32/protocol layer, firmware, pairing or radio transport — none
  exists in v6 (`/health` reports `hardware_transport:false`). When it
  appears: device identity, command nonces, ack protocol, safe-state on loss,
  firmware signing, and a separate hardware safety plan are prerequisites.
- Multi-user deployment hardening (shared rate limiting, quotas, backups,
  PostgreSQL migration, TLS termination) — listed as remaining work in
  backend/README.md.
- Any claim of MASVS/ASVS certification — this document only maps risks to
  executable checks.
