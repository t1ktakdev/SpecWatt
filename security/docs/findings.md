# Findings — SpecWATT v6 security & reliability review (2026-10-27)

Reviewer: independent security/reliability engineering pass (`feature/security-reliability`).
Scope: public `main` @ `8a123c8` (v6). **v7 was not published** at review time
(`git ls-remote` shows `main` only) — every statement here is about the public
tree and must be re-checked when v7 lands.

Method: full read of backend and mobile sources, existing docs and tests,
threat modelling (threat-model.md), then executable verification via the new
`security/` suite (83 tests), plus pip-audit, bandit, npm audit, and a
worktree+history secret scan. No real accounts, no hardware, no non-local
targets.

Already-documented limitations from backend/SECURITY.md are **not** re-reported
as new findings (unbounded event/measurements retention, per-process rate
limits, no TLS, no device identity, registration-conflict enumeration). They
remain valid and tracked upstream.

---

## SEC-001 — Login crashes with 500 on corrupted password verifier — **Medium (reliability/availability) — FIXED in this branch**

- **Where:** `backend/specwatt_api/app.py`, `login` (before fix).
- **What:** `stored.split('$')[4]` raises `IndexError` for a truncated hash and
  `bytes.fromhex` raises `ValueError` for a non-hex salt. A single damaged row
  in the local SQLite file turned every login attempt for that account into
  `500 Internal Server Error` — reproduced before the fix (probe output kept
  in the branch commit history).
- **Impact:** damaged local state (the exact fault-injection class the project
  claims to survive) made authentication unusable for the affected account and
  produced unhandled 500s instead of the API's clean error contract.
- **Fix:** catch `(IndexError, ValueError)` and answer the standard
  `401 invalid_credentials`. A corrupted verifier cannot match any password;
  the response leaks nothing and matches the failed-login contract. No route
  or schema change.
- **Regression test:** `security/test_auth_bola.py::test_corrupted_password_verifier_answers_401_not_500`
  (three corruption modes: truncated, non-hex salt, empty string).
- **Residual:** other corruption modes (truncated DB file) still fail loudly;
  acceptable for a local simulator, restore-from-backup procedure is
  documented upstream.

## SEC-002 — Reconciliation has no time-correlation window — **Medium (semantics / UX trust) — documented, owner decision required**

- **Where:** `backend/specwatt_api/app.py`, `telemetry` reconcile loop.
- **What:** `timeout`/`transport-error` commands are reconciled by *any* later
  authoritative sample, however distant in time, by comparing the sample to
  the target. Example: CH1-on times out; an hour later the user separately
  turns CH1 on and a sample reports 1.8 W; the *old* failed command then
  transitions to `reconciled` with reason `simulator_telemetry_matches_target`
  — a status that a UI can legitimately render as "the command worked" even
  though the correlation is coincidental.
- **Why not fixed here:** the unbounded "a later sample resolves it" contract
  is written down in backend/README.md as intended behaviour, and the
  reconciliation handler is shared surface with the Smart Scheduling agent's
  area. Changing semantics unilaterally would violate the work-isolation rule.
- **Suggested direction (for the command-engine owner):** only reconcile from
  the first authoritative sample after the failure (or bound the sample age
  relative to `command.created_at`); older samples could leave the command in
  `timeout`/`transport-error` with an explicit "unresolved" flag. The client
  contract line "neither reason proves command delivery" already guards the
  API side.
- **Pinned by test:** `security/test_reliability_faults.py::test_reconciliation_never_replays_only_reports`
  documents the current contract (reconcile reports, never actuates). If the
  semantics change, that test must change deliberately.

## SEC-003 — Five high npm advisories in the Expo toolchain — **Medium (build-time) — baselined, upstream fix required**

- **Where:** `mobile/specwatt-app` dependency chain `expo → @expo/cli →
  {node-forge, zod}` (npm audit 2026-10-27; analysis matches
  docs/DEPENDENCY-REVIEW.md).
- **Applicability:** node-forge (GHSA-86w9-cpqp-85rv, RSA signature
  verification, CVSS 7.5) and zod (GHSA-mrhx-c7xc-m3w5, resource exhaustion)
  run on the **developer machine during `expo export`/EAS builds**, not in
  the shipped APK. No production runtime path imports either package. Five
  audit entries ≠ five independent application defects.
- **Not fixed by:** `npm audit fix --force` (would downgrade Expo 58 → 44 — a
  breaking SDK change; explicitly rejected).
- **Action taken:** advisories pinned in `security/baselines/npm-audit-baseline.json`;
  `security/check_npm_audit.py` fails CI only on **new** or escalated
  advisories. Track Expo releases for a compatible `@expo/cli` update, then
  regenerate the baseline.

## SEC-004 — GitHub repository hardening controls are off — **Medium (process) — owner action required**

Verified via API-less observation of the public repo; these cannot be enabled
from a branch. Recommendations, in order:

1. **Secret scanning + push protection** (Settings → Code security) — cheap,
   prevents the most common public-repo accident.
2. **Dependabot alerts** for npm + pip, plus the `.github/dependabot.yml`
   included in this branch (weekly, npm in `mobile/specwatt-app`, pip in
   `backend`).
3. **Private vulnerability reporting** (Settings → Code security) before any
   public disclosure channel is needed.
4. **Branch protection on `main`** (require PR + the new `Security gates`
   workflow) once multiple agents push in parallel.
5. CODEOWNERS once workstream boundaries settle.

A root-level `SECURITY.md` (reporting policy) is included in this branch.

## SEC-005 — Replaying a rejected command returns HTTP 200 — **Low (API consistency) — documented**

- **Where:** `request_command` idempotent-replay path.
- **What:** the original rejected submission returned `409 {code, command}`;
  replaying the same key+intent returns `200` with the stored command whose
  `status` is `rejected`. Idempotency is preserved (no re-evaluation, no new
  audit events) but the status code differs between first submission and
  replay.
- **Decision:** keep — replay-matches-stored-record is the documented
  idempotency contract; changing it would break clients. Pinned by
  `test_command_safety.py::test_replay_of_rejected_command_returns_stored_outcome`
  so any change is deliberate.

## SEC-006 — No per-user resource quotas — **Low — documented upstream, re-verified**

A user can create unbounded controllers and drive unbounded commands/events
(DoS-by-disk). Local-simulator acceptable; must be solved before multi-user
deployment (already listed upstream). Verified as still true; not re-fixed.

## SEC-007 — v6 public tree limitations for mobile security assessment — **Info — recorded**

MASVS items requiring a built artifact (manifest analysis, backup rules,
debuggable flag, screenshot protection, TLS pinning decisions) cannot be
verified: no APK is produced in v6, `android/` is CNG-generated and
gitignored. The static source checks in `test_repo_hygiene.py` cover what is
verifiable from source today; `docs/ANDROID-BUILD.md` verification remains
open. Re-run the mobile checks once v7 produces buildable artifacts
(v7-retest-checklist.md).

---

## What was checked and found sound (no action)

- **BOLA:** uniform 404 on every controller route for foreign users; 401 vs
  404 distinction correct; UUID identifiers; no existence leaks.
- **Password storage:** scrypt OWASP profile, per-user salt, work factors in
  the stored format, dummy-hash timing defence, redacted validation errors.
- **CH3 protection:** four independent layers incl. SQLite CHECK.
- **Command lifecycle:** request/dispatch double-checks, single in-flight
  command, atomic dispatch (crash rolls back), no server-side auto-retry.
- **Stale/uncertain semantics:** future-dated samples stale, `null` watts with
  retained `last_known`, complete-snapshot requirement on telemetry.
- **Transport hygiene:** parameterised SQL throughout, no CORS by default,
  strict origin validation when enabled, docs/OpenAPI disabled, body cap,
  no-store/nosniff.
- **Mobile client:** SecureStore vault, memory-only web vault, 401→vault
  clear, logout revokes-then-clears, HTTPS-only outside dev loopback, strict
  response validation incl. CH3-weakening rejection, response size cap,
  timeout+abort, no console logging, no WebView/eval sinks, demo/server
  separation.
- **Repo hygiene:** no secrets in worktree or history (masked scanner), no
  env/key/db files tracked, exact Python pins, private npm package.
- **Python dependencies:** pip-audit clean on backend requirements; bandit
  clean except one Low B105 false positive (`'bearer'` is a token-type label,
  not a credential).

## Severity model used

Critical — can actuate CH3, access another user's controller, or execute
commands without authorisation. High — token/credential compromise paths,
power-ceiling bypass, false-success actuation. Medium — availability and
state-integrity defects, build-chain risk, process gaps. Low — consistency,
hardening and documentation items. Info — limitations worth recording.
