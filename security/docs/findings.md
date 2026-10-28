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

## SEC-002 — Delayed telemetry falsely reconciles old commands — **Medium — FIXED during integration**

- **Root cause reproduced:** channels-only input was stamped with receipt time and reconciled every old timeout/error. A later opposite command followed by a replay of an older snapshot also replaced the current state with a falsely fresh reading. Scheduler recovery interpreted a matching reconciliation reason as confirmation of its start phase.
- **Fix:** channels-only simulator injection still refreshes current state, but never changes a historical command result. Recovery requires exact `command_id`, finite acquisition `measured_at`, and positive monotonic `sequence`. The sample must be at most 30 seconds old, acquired strictly after dispatch and within 30 seconds of that dispatch, at or after the current controller measurement, and newer than the persistent telemetry cursor. A newer accepted intent on the channel supersedes the old command. Invalid correlation, replay, and order checks reject atomically before changing state.
- **Manual priority:** an ambiguous manual dispatch preserves its original hold deadline; recovery never starts a fresh hold from sample arrival.
- **Regression evidence:** `security/test_telemetry_correlation.py` exercises plain injection, exact correlation, mismatching target, delayed/future/pre-dispatch/replayed/out-of-order samples, later opposite and same-target intents, foreign controller commands, persistence across restart, and manual hold. The original reliability regression deliberately uses the new explicit correlation contract.
- **Residual limit:** this endpoint is an authenticated simulator input, not physical telemetry authentication. An owner can inject simulator state and supply metadata; the fields do not prove delivery or causation. Reconciliation confirms observed target state only, never a device acknowledgement. Commands outside the recovery window remain timeout/error; a fresh state injection permits a separate, explicit new intent.

## SEC-003 — Reviewed high npm advisories in the Expo toolchain — **Medium (build-time) — baselined, upstream fix required**

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

## Integration gate review (2026-10-27)

- **KEEP:** original authorship and the isolated authentication/BOLA, CH3, peak, permission, idempotency, concurrency, fault injection and property tests. Original 83 checks passed before integration fixes.
- **IMPROVE:** mobile source assertions are useful structural tripwires, not behavioral evidence of secure storage, transport or logout. Run the mobile runtime tests as well; do not treat a matching comment/string as verification.
- **REPLACE:** the unbounded reconciliation loop with acquisition/correlation checks above; npm package-name-only baseline comparisons with advisory URL identities and every severity escalation; CI's unconditional npm audit failure with report validation plus baseline comparison. A network/error report fails closed.
- **IMPROVE:** history secret scanning now passes dash-prefixed private-key patterns using `-e`, rejects git errors instead of treating them as clean, redacts all matched characters, and uses exact fixture values rather than substring exemptions. Synthetic fixtures missing from the original allowlist were recorded explicitly. Pattern scanning still cannot identify all secret formats or binary/oversized files.
- **DROP:** claims that all existing source assertions prove runtime security, or that simulator tests establish hardware delivery guarantees. No physical transport exists or was exercised.
- **Dependency snapshot:** a fresh npm audit with system certificate trust returned four high package entries (`@expo/cli`, `expo`, `node-forge`, `zod`), all within the reviewed baseline. `@expo/code-signing-certificates` no longer appears. Existing accepted identities were migrated to advisory URLs without accepting new issues.


## SEC-008: Expo config tooling deepmerge prototype poisoning. LOW, build-time, conditionally accepted 2026-10-28

- Advisory GHSA-gcqx-w48m-w2h4 / CVE-2026-93753, https://github.com/advisories/GHSA-gcqx-w48m-w2h4 (GitHub reviewed 2026-10-27). Affected npm deepmerge >=4.2.0 <=4.3.1; mergeObject prototype poisoning with untrusted object keys. Current GitHub reviewed severity LOW / CVSS v4 2.7. No upstream patched version published at review.
- Exact dependency path validated: expo@58.0.19 -> @expo/config@58.0.8 -> deepmerge@4.3.1. npm audit now reports 9 package entries: 4 previously acknowledged HIGH; 5 new LOW package entries associated with this ONE deepmerge advisory, including deepmerge, @expo/config, @expo/local-build-cache-provider, @expo/metro-config, @expo/prebuild-config. Propagation to existing @expo/cli and expo entries does not imply extra independent vulns.
- Applicability: Expo dev/build config tooling only, not a mobile UI runtime or FastAPI server import. Attacker-controlled config fields or plugins could expose the build process. This local prototype uses committed trusted config and official plugins, so currently conditional rather than a directly remote-exposed control path; NOT a claim of universal safety.
- Remediation: npm audit suggests a breaking Expo 51 downgrade for this transitive dependency. This conflicts with SDK 58 and would risk native breakage. No patched deepmerge found in the advisory; do not force downgrade or blindly override locks.
- Decision: temporarily include exact advisory identities/severities in reviewed baseline so CI continues to fail closed on any additional or escalated finding. This is risk acceptance NOT a fix; the four older HIGH findings remain unresolved.
- Conditions: restrict builds to trusted configs and plugins; no unreviewed remote build or untrusted config input. Recheck advisory/upstream remediation before public release or by 2026-11-15 (whichever comes first), and upon severity change. Re-run the full Expo/native gate on a safe upgrade later. Hardware is not certified.
