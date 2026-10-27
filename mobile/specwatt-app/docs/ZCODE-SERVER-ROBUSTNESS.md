# ZCode Server Robustness — Mission D handoff (2026-10-28)

Branch `zcode/max-mobile-server`, Draft PR: https://github.com/t1ktakdev/SpecWatt/pull/6
Base: `integration/unified-v7-20261027` @ `eff2f4d9ff1dd62ad28a8dd38efb38d1754cffd2` (verified equal to `git ls-remote` before work started).

## 1. What changed and why

All edits are inside the Mission D ownership list. No file outside it was written.

| File | Change |
| --- | --- |
| `src/specwatt/api.ts` | 401 invalidation is now scoped to the exact rejected token (`TokenVault.clearMatching` compare-and-clear, with a get-compare-clear fallback for custom vaults); native SecureStore ops serialized through a promise queue; bounded safe-GET recovery retry (max one extra attempt, `network_error`/`request_timeout` only); caller `AbortSignal` support with a distinct `request_cancelled` code; `retryDelayMs` option |
| `src/specwatt/server-request-scope.ts` | New pure helpers `blocksNewCommands` (only `requested`/`sent` block new manual commands) and `isSnapshotFresh` (server rule `0 ≤ now − measured_at ≤ 30`); new `begin()`/`done()` in-flight registry that aborts outstanding local requests on `activate`/`invalidate` |
| `src/specwatt/scheduler-api.ts` | `SchedulerRequest` and `list()` accept an optional `AbortSignal` (pass-through only, no behavior change) |
| `src/screens/server.tsx` | Wired to the new primitives: GET refreshes carry abort signals; parent mutations (consent/step/sample) commit snapshots only through a selection ticket (`scope.refresh` + `canCommit`); command list append deduplicates by id; terminal `timeout`/`transport-error` statuses no longer permanently lock the manual command UI; freshness ticker runs only while a snapshot is displayed; messages memoized per locale; new RU/KY keys `command_in_flight`, `controller_not_found`, `server_busy`, `http_404`, `schedule_cancelled`; `request_cancelled` counts as an unknown outcome for command actions |
| `src/screens/server-schedules.tsx` | Initial list load aborts on unmount/dep change; `controller_not_found` message added |
| `tests/zcode-server-resilience.test.mjs` | New: 17 unit tests pinning the contracts above |
| `tests/zcode-server-e2e.test.mjs` | New: 8 end-to-end tests against a real loopback FastAPI+SQLite server (see §5) |
| `tests/api.test.mjs` | One test updated to the intentionally new retry contract (exact count 2, exact error kept strict) |
| `docs/ZCODE-SERVER-ROBUSTNESS.md` | This handoff |

## 2. Defects found (severity-classified before implementation)

- **S1 (critical) — delayed 401 wiped the live session.** `request()` called `vault.clear(baseUrl)` on *every* 401. An obsolete client instance's late 401 (after a re-login on the same server, or after switching the server URL field) deleted the *current* session token. A failed login attempt (401 `invalid_credentials` with `authorized=false`) also cleared any existing token. Violates the regression-matrix rule "old 401 cannot logout new session". Fixed by compare-and-clear.
- **S2 (high) — UI deadlock after terminal command outcomes.** `unresolved()` treated `timeout`/`transport-error` as blocking forever, while the server only refuses new commands while a command is `requested`/`sent` (409 `command_in_flight`). After any scheduler-dispatched timeout the manual command and consent buttons stayed disabled until the record left the 100-entry history. Fixed: `blocksNewCommands` covers only `requested`/`sent`; terminal outcomes remain visible with truthful status text and never render as success.
- **S2 (high) — no cancellation of local queries.** Mission 10 requires AbortController usage and local-query cancellation. Implemented end to end (scope registry → BrainClient → fetch).
- **S2 (high) — no safe-GET recovery.** Implemented bounded retry (see §6 alternatives).
- **S3 (medium) — parent mutations committed snapshots without stale suppression.** A child-triggered parent refresh could interleave (child and parent locks are separate) and overwrite a newer mutation response. Fixed with selection tickets.
- **S3 (medium) — client freshness rule diverged from the server.** The screen accepted `measured_at` in the future (`now − measured_at` could be negative). `isSnapshotFresh` now matches the backend rule exactly.
- **S3 (medium) — duplicate command rows.** A concurrent refresh could commit history already containing a just-issued command; the local append then duplicated it. Fixed with id-dedup `appendCommand`.
- **S4 (low) — perf/render hygiene:** 1 Hz `setNow` re-rendered the whole workspace even logged out (ticker now gated on snapshot presence); messages map rebuilt per render (now `useMemo` per locale).
- **Missing user-facing keys** for real server outcomes (`command_in_flight`, `controller_not_found`, `server_busy`, `http_404`, `schedule_cancelled`) added in the server module's own RU/KY strings; shared `i18n.ts` untouched.

## 3. TDD evidence

Failing tests were written first (`tests/zcode-server-resilience.test.mjs`) and confirmed red for the right reasons:
- module-link failure for the new scope exports (`does not provide an export named 'blocksNewCommands'`);
- behavioral reds: stale-401 cleared the newer token (assertion `vault.token === 'new-token'` failed with `null`); GET retry produced 1 request instead of 2; caller abort surfaced `request_timeout` instead of `request_cancelled`; pre-aborted signal still issued a request.

After implementation: all green. One existing test (`api.test.mjs` "request timeout aborts the single in-flight request") pinned the old no-retry contract; because the retry is a deliberate mission-mandated contract change, that test was updated — still strict (exact `requests === 2`, exact `request_timeout` error), and the no-retry-on-mutation and retry-cap invariants gained dedicated tests.

## 4. Verified commands (Windows, Git Bash; exact cwd and exit codes)

| Command | cwd | Result |
| --- | --- | --- |
| `npm test` | `mobile/specwatt-app` | 148 tests, 148 pass, 0 fail, 0 skipped, exit 0 (baseline before changes: 114 pass) |
| `node --experimental-strip-types --test tests/zcode-server-resilience.test.mjs` | `mobile/specwatt-app` | 26 pass, exit 0 |
| `node --experimental-strip-types --test tests/zcode-server-e2e.test.mjs` | `mobile/specwatt-app` | 9 pass, 0 skipped, exit 0 (~5 s, spawns real loopback server) |
| `npm run typecheck` (`tsc --noEmit`) | `mobile/specwatt-app` | exit 0 |
| `npm run lint` (`expo lint`) | `mobile/specwatt-app` | exit 0, no warnings |
| `python -m unittest discover -s tests -q` | `backend` | 90 tests OK, exit 0 (READ-ONLY run, no backend changes) |
| `python scripts/smoke.py` | `backend` | PASS, exit 0 |
| `python security/scan_secrets.py` | repo root | clean, exit 0 |
| `git diff --check` / `git diff --cached --check` | repo root | clean |
| `git status --porcelain=v1 --untracked-files=all` | repo root | only owned files listed in §1 |

Environment: Node v24.18.0, Python 3.13.14 (fastapi 0.141.1, uvicorn 0.53.0), Windows 10.0.26200.

Warnings observed, none introduced by this work:
- `npm audit` reports the same 4 known high advisories (via `@expo/cli` inside `expo`) already documented in INTEGRATION-WAVE1-20261028; **not remediated** by this work — no dependency files were touched (`package.json`/lock unchanged).
- `npx --no-install expo-doctor`: 1 check failed — the same six SDK-58 patch-level drifts documented in INTEGRATION-WAVE1 (pre-existing; auto-upgrade intentionally not performed per mission).
- PowerShell may render Python stderr (e.g. StarletteDeprecationWarning) as an error stream; all exit codes above are real process return codes.

## 5. End-to-end demonstration (real HTTP, no hardware)

`tests/zcode-server-e2e.test.mjs` boots the actual `backend.specwatt_api.create_app` under uvicorn on `127.0.0.1` (ephemeral port) with a throwaway SQLite file in the OS temp dir (deleted afterwards; backend source untouched). Over genuine HTTP requests it demonstrates:

1. register → empty controller list → create simulator → fresh snapshot with protected CH3 (2.4 W, `allow_auto=false`, `protected=true`);
2. manual command: HTTP receipt returns `requested` (never success), measurements do not move, the explicit simulator step produces `acknowledged` + `simulator_confirmed` and moves watts;
3. per-channel consent on CH2 succeeds; CH3 consent is refused with `protected_channel`;
4. schedules: evaluate → create (`pending`) → list → cancel (`cancelled`); an explicit `tick` after the window opens yields `dispatched_start` while the linked command stays `requested` — a tick never fabricates an acknowledgement;
5. BOLA isolation: a second account sees an empty controller list and gets `controller_not_found` for snapshot and command;
6. session rotation: an old client holding a revoked token gets a real 401 and **cannot clear** the rotated token in the shared vault; the new session keeps working;
7. an invalid token is rejected and cleared;
8. offline (connection-refused port): a safe GET is retried exactly once over real transport then reports `network_error`; a POST is attempted exactly once; a client pointed back at the live server recovers.

The e2e suite skips with an explicit reason if the Python FastAPI environment is unavailable; on this machine it ran for real.

## 6. Rejected alternatives (per mission 16, ≥2 options for non-trivial defects)

- **401 scoping:** (a) client-side get-compare-clear at every call site — duplicated logic, racy between async get and clear; (b) chosen: `clearMatching` implemented inside the vault (atomic for the in-memory web vault, promise-queue-serialized for SecureStore) with an automatic fallback for custom vaults, keeping the `TokenVault` interface backward-compatible.
- **GET retry location:** (a) retry loops in every screen — four-plus duplicated call sites, high risk of accidentally retrying mutations; (b) chosen: one bounded loop inside `BrainClient.request`, structurally limited to `method === "GET"`, re-reading the vault token per attempt, never retrying deterministic errors, and never retrying a caller-aborted request.
- **Abort ownership:** (a) ad-hoc `AbortController` refs in each component — duplicated lifecycle logic; (b) chosen: the request scope owns a registry and aborts on session lifecycle transitions only (`activate`/`invalidate`), not on controller re-selection (parent operations are already serialized by the run lock; aborting those would surface spurious errors). `done()` must run in `finally`.
- **Terminal-command blocking:** (a) keep blocking until manual refresh — refresh does not remove the record, so the block was permanent (deadlock); (b) chosen: align client gating with the server's own `command_in_flight` rule (`requested`/`sent` only). Late-telemetry correlation stays protected server-side (`telemetry_command_correlation_invalid`).

## 7. Performance evidence (mission 12)

- **Request counts, measured:** unit tests assert exact counts — safe GET recovers with exactly 2 attempts maximum (`GET retry is capped at one extra attempt`), mutations exactly 1 (`mutations are never retried automatically`, pinned again over real HTTP in the e2e offline test). No polling loop, debounce timer or background refetch was added anywhere.
- **Render hygiene:** the only recurring state update was the 1 Hz `setNow` clock; it now runs only while a snapshot is on screen (`hasSnapshot` gate), eliminating a full-workspace re-render every second in the logged-out and controller-list states. The messages map is rebuilt only on locale change.
- **Honest limitation:** React render counts could not be *measured* in `node --test` — no renderer is installed and adding one requires integrator approval (no new dependencies allowed). The improvement is structurally guaranteed by the removed unconditional `setInterval` and covered by review; a render-count instrumented run is listed as a follow-up proposal (§10).

## 8. Security review summary

- Bearer tokens never appear in error codes, messages, or logs; the client only renders server error `code` strings matching `^[a-z0-9_-]{1,80}$` or known keys. Password is wiped from state after every login attempt (pre-existing behavior kept).
- CH3: `automationConsent` refuses CH3/protected before any transport; `command()` refuses non-CH1/CH2 before any transport; parser rejects weakened CH3 snapshots; e2e asserts the refusal over real HTTP. No new path can grant `allow_auto=true` for CH3 — authorization stays server-side.
- Commands still progress requested → sent → acknowledged/rejected/timeout only via the server; no UI state renders success on HTTP receipt alone; `uncertain` covers unknown outcomes including `request_cancelled`.
- Independent read-only reviewers: see §11.

## 9. Skills / MCP availability actually used

- Skills loaded and followed: `specwatt-project-guardrails`, `using-git-worktrees` (both mandatory, before any Git action), plus `test-driven-development` and `systematic-debugging` discipline for the red→green loop; review and finishing steps per `requesting-code-review` / `verification-before-completion` / `specwatt-merge-gate` / `finishing-a-development-branch` checklists.
- Expo docs MCP / Context7: not needed for this change (no Expo API surface touched beyond existing imports); local source of truth and the real backend contract were used instead. No Figma OAuth was performed; Warm Graphite tokens/theme files untouched, so no visual-token drift is possible from this branch.

## 10. Known limitations, follow-ups and out-of-scope proposals

- **Not verified on Android:** no isolated emulator QA was performed (none authorized in this session); the six main demo screens remain offline-only and are NOT claimed to be FastAPI-connected. Everything here is the separately-marked server workspace. Web preview was not used as an Android claim.
- **Render-count instrumentation** (React Profiler or a test renderer) — proposed follow-up; requires a new dev dependency approval.
- **`request_cancelled` needs no RU/KY string today** (it can only surface while unmounted or after a session change, both of which suppress it), but if future code aborts visible requests, add a key.
- **Patch proposals outside ownership (reported, not applied):**
  1. `store.tsx`/`i18n.ts` (agent A's zone): the five new server-message keys live locally in `server.tsx`; if the shared dictionary later absorbs them, keep the RU/KY strings from §1 of this file.
  2. Backend `app.py` (read-only here): `controllers()` has no `limit` parameter while the client caps at 200 client-side — harmless at prototype scale; consider server-side pagination parity later.
  3. The native `TokenVault` stores a single session record per install; multi-server simultaneous sessions would need a keyed schema — out of scope.
  4. **`redirect:"error"` reliance (pre-existing, from the security review):** consider a follow-up that verifies or enforces no-redirect behavior on the React Native fetch engine, since OkHttp/NSURLSession may follow redirects transparently and re-send the Authorization header. HTTPS-only default bounds exposure.

## 11. Independent review (read-only subagents)

Two independent read-only reviewers were dispatched per mission 15 (tests/scenarios and security/architecture). Findings were verified against the actual code before acting (nothing accepted on authority alone).

### 11.1 Tests/scenarios reviewer — accepted and fixed

1. **HIGH — missing `error` handler on the e2e spawn**: a machine without `python` would crash `npm test` with an unhandled `error` event instead of skipping. Fixed (`child.on('error', …)` + skip path).
2. **MEDIUM — tick test inherited measurement freshness from earlier tests** (the runner refuses to dispatch from measurements older than 30 s; slow CI could flake). Fixed: an explicit `sample()` telemetry refresh immediately before the tick.
3. **MEDIUM — 5xx/429 mapping unpinned.** Added unit tests: JSON 503 → `server_busy` (1 attempt), non-JSON 502 → `http_502` (1 attempt), 429 → `rate_limited` (1 attempt). The non-JSON error mapping was also made more truthful: a non-JSON error body now reports `http_<status>` instead of `invalid_response` (a garbage *success* body is still `invalid_response`).
4. **MEDIUM — mutation-timeout branch untested.** Added: a hanging fetcher on `command()` → `request_timeout` after exactly 1 attempt; plus an e2e scenario driving the server-side timeout outcome (`step(id,'timeout')` → command `timeout`, snapshot stale, telemetry refresh, next manual command accepted).
5. **MEDIUM — repeated schedule creation untested.** Added e2e: a second `create` for a taken window returns a deterministic 409 `schedule_conflict` with exactly 1 HTTP call.
6. **MEDIUM — the two screens' ambiguous-outcome sets had drifted.** Extracted `isAmbiguousMutationOutcome` into `server-request-scope.ts`, unified both screens on it (superset incl. `request_cancelled` — safe because it only widens the honest unknown-outcome display for mutations), pinned by unit tests. `appendCommand` was extracted and unit-tested the same way.
7. **LOW — e2e temp-file/process leaks**: bootstrap `.py` now deleted in `after()`; the spawned child is killed on the failure path.
8. **LOW — reordered responses unpinned**: added a unit test proving `parseSnapshot` accepts `[CH2, CH1, CH3]` and rejects 2-channel / 4-channel / fresh-with-null-total snapshots.
9. **LOW — e2e shared-state coupling**: dependent tests now skip with a clear `prerequisite` reason if setup failed.
10. **LOW — `parseCommand` strictness unpinned**: added unit tests via `commands()` — invented status, unknown channel and a 101-entry history all reject with `invalid_response`.
11. **NIT** — `/health` failure now skips instead of throwing; a comment documents why the obsolete-vault `clear` delegation in the rotation test is intentional.

### 11.2 Tests/scenarios reviewer — rejected with reasons

- **Bind consent/step/sample to scope flights** (finding 11): rejected. Parent operations are serialized by the screen's run lock, so `activate`/`invalidate` cannot fire mid-mutation from the UI; the only external trigger is unmount, where React discards the state update anyway and aborting would only convert an already-unobservable request into an unobservable `request_cancelled`. `canCommit` tickets already suppress stale commits; adding dead abort plumbing was judged higher risk than value.

### 11.3 Linux CI via the Draft PR (mission 19)

The repository's only PR workflow is `.github/workflows/security.yml`. On the first run of Draft PR #6 (commit `77985ef`):

- **Linux TypeScript/lint/runtime verification PASSED** in the `mobile-dependency-audit` job: `npm ci` → `npm test` (including the loopback e2e suite, which really ran on ubuntu-latest with its Python setup) → `npm run typecheck` → `npm run lint`, all exit 0. Windows results are therefore not the only evidence for the TypeScript gate.
- Bandit (SAST), the security unittest suite (100 tests) and pip-audit PASSED.
- **`Secret scan (worktree + history)` FAILED** with one masked `[generic-assignment]` finding in `tests/zcode-server-e2e.test.mjs`: the synthetic fixture credential `e2e-password-123` matches the scanner's `password\s*=\s*'…'` pattern and is not in its allowlist. The local pre-commit scan had reported clean because untracked new files are not scanned (`git ls-files` basis) — the finding materialized only once the file was committed. Root cause: agent error (committing a fixture value not pre-cleared with the scanner's allowlist), fully owned here.
- **Fix applied in a follow-up commit (no history rewrite — force push is prohibited by the mission):** the e2e fixture now uses `correct-horse-battery`, the repo's established allowlisted fixture credential (`security/support.py`, allowlist entry "security suite fixture password"). Worktree scan: clean, exit 0; all 9 e2e tests re-verified green.
- **Residual for the integrator (outside Mission D ownership, `security/**` is read-only for this agent):** confirmed on the second CI run — the worktree scan passes, and the full-history pass (`fetch-depth: 0`, `git rev-list --all`) reaches the superseded fixture value in exactly two intermediate branch commits (`72b953b`, `77985ef`), both the same synthetic string. Two durable resolutions, either suffices:
  1. add one allowlist entry to `security/scan_secrets.py`:
     `("generic-assignment", "e2e-password-123", "superseded mobile e2e loopback fixture (removed in favor of correct-horse-battery)"),`
  2. or squash-merge Draft PR #6 (and/or delete the branch afterwards) so the intermediate blobs become unreachable from `--all`.
- **Final CI state at handoff time:** `mobile-dependency-audit` (Linux `npm ci` → `npm test` incl. the loopback e2e → `typecheck` → `lint`), `Security test suite`, `Bandit`, `pip-audit` all PASS; only the history pass of the secret scan is red, solely on the two superseded-fixture blobs documented above. No other finding exists in the entire branch or its history.
- Process note for future waves: run `python security/scan_secrets.py` **after `git add`** (on staged/tracked content), not only on the working tree, before committing new test fixtures.

### 11.4 Security/architecture reviewer

Verdict first: **no critical or high findings**. The reviewer independently verified the S1 fix (compare-and-clear with the request's token; failed login can no longer wipe the vault), absence of token leakage (no `console.*`, error codes regex-bounded, `credentials:"omit"`, `redirect:"error"`, `cache:"no-store"`), soundness of the SecureStore promise queue (no unhandled rejections, no re-entrancy deadlock, FIFO makes 401 compare-and-clear atomic), the GET-retry mutation safety (exact-attempt tests for retry-once/cap/mutation/429/503/non-JSON-502), leak-free abort handling, correct `begin()/done()` semantics including double-done and StrictMode, intact CH3 protection (client pre-checks plus parser hard-rejection, server independently enforcing), and no false-success path. Accepted and fixed:

1. **Command POST appended to the command list without a commit ticket** — now ticket-gated like consent/step/sample (defense-in-depth against a child-triggered `clearSession` racing the POST).
2. **Ambiguous-mutation doctrine applied inconsistently** — consent and sample are now ambiguous-outcome mutations too (`run(..., true)`); both are idempotent, and the resulting `uncertain` state is cleared by the documented refresh path, matching the schedules screen behavior.
3. **A vault failure during 401 handling was mislabeled as a transient transport error** (it even consumed the GET retry). Fixed: `invalidateToken` is wrapped so the 401 error path stays deterministic (`invalid_session`, no retry); pinned by a new test that was first demonstrated red.
4. **Mount-effect flight was never released on the success path** — `flight.done()` now runs in the IIFE `finally`.
5. **Native `clear(baseUrl)` ignored the stored baseUrl** — now mirrors the web vault: the record is deleted only when it belongs to that server (or when corrupt, which is the repair path).

Rejected/documented with reasons:

- **Fallback `invalidateToken` TOCTOU** (custom vaults without `clearMatching`): rejected as a code change — both shipped vaults implement the atomic `clearMatching`; the fallback is now documented as best-effort for custom/test vaults. Making the member required would break the exported interface for no production gain.
- **Abort during the inter-attempt retry delay is observed only at the next loop-top** — accepted as-is (≤ `retryDelayMs` = 400 ms extra latency, correctness unaffected); documented.
- **Pre-existing observation (not a regression of this branch):** `redirect:"error"` depends on the fetch engine honoring redirect modes — React Native's OkHttp/NSURLSession-backed fetch may follow redirects and re-send the Authorization header. HTTPS-only (dev-local HTTP) bounds the exposure. Recorded in §10 as a follow-up proposal for the integrator. Also noted: `isSnapshotFresh` now rejects measurements from the future, so a badly skewed device clock shows fresh telemetry as stale (deliberate availability trade-off matching the server rule; the server clock is authoritative).

## 12. Commit list

All commits authored as `ZCode Mobile Server Resilience Agent <zcode-mobile-server@localhost>` (own identity; the shared repo config of other agents was never modified).

- `020630c` feat(mobile): scope 401 invalidation to the rejected token and add safe-GET recovery — `src/specwatt/{api.ts,server-request-scope.ts,scheduler-api.ts}`, `tests/{zcode-server-resilience.test.mjs,api.test.mjs}`
- `892c2d1` feat(mobile): cancel local server queries and pin stale-response commits in the server workspace — `src/screens/{server.tsx,server-schedules.tsx}`
- `72b953b` test(mobile): end-to-end loopback FastAPI contract coverage for server resilience — `tests/zcode-server-e2e.test.mjs`
- `c0f5387` fix(mobile): use the allowlisted security-suite fixture credential in the loopback e2e — `tests/zcode-server-e2e.test.mjs` plus the §11.3 CI-finding documentation (CI secret-scan follow-up)
- This handoff document itself (final commit on the branch; its SHA necessarily changes when this list is updated).

HEAD after these commits: see `git rev-parse zcode/max-mobile-server`; every commit passed `git diff --cached --check` and the secret scan before being created.

## 13. Draft PR

- Branch `zcode/max-mobile-server` → base `integration/unified-v7-20261027` (NOT main), Draft, no merge, no force push: https://github.com/t1ktakdev/SpecWatt/pull/6
