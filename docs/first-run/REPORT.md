# First run / auth entry — implementation and verification

Branch: `feature/first-run-auth-ux-20261029`.
Worktree: `C:/Users/user/.codex/worktrees/specwatt-first-run-20261029/SpecWATT`.
Base (verified with authenticated fetch and ls-remote): `e842287a4aa9c381e086ceb244bd6a6c4a6279a1`, `origin/integration/unified-v7-20261027`.
Implementation: `7b0bd211b296a0f3316086cbd62d6f2a12291a2b`.
Security follow-up: exact audited literal exceptions for RN autofill values and the synthetic auth test session; see branch commit list.
Author: Codex, using commit-local identity; existing global Git configuration and authors were preserved. No push, PR creation or merge.

## Delivered behavior

Native splash and brand fade remain separate from the interactive introduction. A four-second deadline releases both a stalled font loader and an unresolved accessibility query. Reduce Motion skips the fade and existing navigation animations.

Three product cards explain power, peaks and permissions. Back/Continue/Skip are real actions. Skip opens language selection; it does not choose a mode. RU/KY can change on any step. The validated optional `firstRunStep` lives in the existing model and serialized store, alongside the locale; old states migrate without changing channel permissions.

DEMO starts offline with explicit model-data labels. The controller choice opens an unavailable-discovery explanation, with separate virtual setup and server-simulator actions. It never reports pairing success or sets onboarding complete merely on controller selection.

Auth opens the existing `/server` workspace, as explicitly allowed by section 3 of the brief. There is one BrainClient/vault/session lifecycle, rather than another onboarding credential form. Existing 12–128-character validation and error mapping remain authoritative; the form now supports email/password autofill and show/hide, clears passwords on completion or auth-mode changes, and cancels its auth flight on unmount. A late/cancelled response cannot persist a token. Password recovery and Google are unavailable informational text, with no fake submission buttons.

Backend, firmware, USB/COM, CH3 protections, shared theme, DeviceVisual/SVG assets and the six main screens were not modified. Server logout does not mutate the DEMO store.

## Verification (actual local executions, 2026-10-29)

| Command / check | Exit | Result |
| --- | ---: | --- |
| `npm test` | 0 | 226 tests passed; 0 failed, 0 skipped |
| `npm run typecheck` | 0 | TypeScript passed |
| `npm run lint` | 0 | ESLint passed |
| `npx --yes expo-doctor` | 1 | 19/20; baseline patch-version mismatches in 13 packages |
| `npm run export:web` | 0 | Production WEB export, final implementation |
| `npm run export:android` | 0 | Android JS/Hermes bundle export; not an APK or native acceptance |
| `python -m unittest discover -s tests -q` (backend) | 0 | 90 passed |
| `python scripts/smoke.py` (backend) | 0 | Real loopback HTTP + disposable SQLite, auth/scheduler/CH3/commands |
| `python -m unittest discover -s security -q` (root) | 0 | 102 passed |
| `python -m bandit -r backend/specwatt_api -ll -q` | 0 | No findings at requested severity; existing B608 nosec warning |
| `python security/scan_secrets.py` | 0 | Clean tracked worktree |
| `python security/scan_secrets.py --history` | 0 | Clean full history |
| `npm audit --json` | 1 | 9 known advisories: 5 low, 4 high, 0 critical |
| `python security/check_npm_audit.py outputs/first-run/checks/npm-audit.json` | 0 | No new advisories; baseline pass is not a clean dependency audit |
| `node --experimental-strip-types scripts/first-run-capture.mjs before` | 0 | 18 WEB captures: RU/KY × 320/393/440 × welcome/language/mode |
| `node --experimental-strip-types scripts/first-run-capture.mjs after` | 0 | 18 WEB captures at the same 852px viewport height |
| `node --experimental-strip-types scripts/first-run-smoke.mjs` | 0 | 18 WEB parcours: RU/KY × widths × 1/1.3/1.5 text enlargement; 90 screenshots |
| `node --experimental-strip-types scripts/ui-smoke.mjs` | 0 | RU/KY demo regression, single toggle, filters, detail/back, catalog/save, CH3, reload; empty mode |
| `node --experimental-strip-types scripts/ui-text-smoke.mjs` | 0 | 320px / 150% browser text checks |
| `node --experimental-strip-types scripts/ui-server-smoke.mjs` | 0 | Real registration, simulator, explicit ACK, logout, invalid credentials, login again, show/hide, DEMO unchanged |
| `git diff --check` | 0 | Clean |

Raw mobile and export logs, audit JSON and browser manifests are under `outputs/first-run/`. Existing browser regression outputs are under `mobile/specwatt-app/outputs/ui-qa/`. No test result comes from remote CI.

The final worktree secret scan initially returned three generic-assignment false positives: two standard React Native autofill enum values in JSX ternaries, plus the synthetic auth-response fixture. Existing exact-value allowlisting was extended for those three literals only, with reasons and a RED→GREEN test proving suffixed unreviewed values are still detected. No filename or history bypass was added. The reviewer independently passed all 9 security-tool tests. The full security suite then passed 102 tests. These literal exceptions have the same global exact-value scope as the existing scanner design.

## RED → GREEN evidence

| Reproduction before implementation | Initial outcome | Final outcome |
| --- | --- | --- |
| Save/reload an unfinished step; move steps without touching permissions | 2/3 model tests failed | 3/3 pass; provider remount also tested |
| Three-card/Back/Skip/mode/auth parcours in both languages | 6/6 interaction tests failed | 6/6 pass |
| Font loader / accessibility query never resolves | 2/3 splash tests failed | 3/3 pass |
| Cancel auth while a transport ignores abort | Token was accepted; expected rejection missing | Request cancelled; no token written |
| Server show/hide and autofill | 2/2 tests failed | 2/2 pass |

Existing locale tests were updated to the approved journey: new title, skip-to-language, real `/server` handoff instead of the removed fake form. Other existing assertions remain active. Full suite before screen changes: 211 passed (208 existing plus 3 new model tests already green); final suite: 226 passed.

Independent read-only review of the implementation commit found no Critical/Important issues and independently ran 17 focused tests successfully. Minor gaps remain in mocked hook cleanup/stack fidelity; actual Expo Router browser back/reload was separately exercised. Native lifecycle/focus remains unverified.

One browser test assertion was corrected: an HTML input whose type defaults to text may have no `type` attribute, so the check now reads the actual DOM `input.type` property. Its failed execution was not hidden or retried as a flaky application failure. The real-server negative case intentionally produces an HTTP 401 console message. Logout yielded HTTP 204 plus browser `ERR_ABORTED` request-failed diagnostics; UI/session/next-login assertions passed. No page JavaScript errors occurred.

## Screenshots and provenance

Canonical [before/after evidence](screenshots/) contains matching RU/KY 393×852 WEB screenshots. Complete 320/393/440 sets are in `outputs/first-run/before/` and `after/`, with hashes and source revision in manifests. Before captures use the untouched integration onboarding/splash source; the unrelated model/store resume extension was already present but unused by that old screen. After captures use the production WEB export of the implementation commit. The enlarged-text parcours is WEB Edge Chromium, not native fontScale or TalkBack proof.

An additional production capture using Python http.server on port 8101 failed with a 60-second wait for the first action; diagnostics observed a reset JS asset connection and a blank page. A second Python-server run and a fresh Node loopback server both completed all 18 captures with unchanged application code. The initial transport interruption is recorded rather than treated as a clean first-pass run; its exact environmental cause is not established. Final after evidence comes from the Node-served production export.

## Limitations and remaining work

- Native Android acceptance: **BLOCKED**. ADB returned an empty device list; the SDK has no `emulator/emulator.exe`. No Android screenshot, TalkBack, real keyboard/safe-area/background lifecycle or native fontScale claim is made. Android export alone does not prove these.
- Expo Doctor: installed lockfile remains unchanged. Recommended patch versions differ for Expo/UI/constants/dev-client/file-system/font/image/image-manipulator/linking/router/splash-screen/system-ui/web-browser. Dependency updates and the four known high advisories remain separate work.
- Native password-manager behavior and physical-device startup must be verified on a real build. No Kyrgyz-language specialist review was performed.
- Persistence uses the existing asynchronous serialized store. A killed process or failed storage write can lose the most recent pending step; storage errors are visible and never imply a successful save.
- Server space remains separate from DEMO. Web tokens remain memory-only and disappear on full page reload. The existing native workspace restores only a token matching its configured default origin; durable custom-server address selection is unchanged.
- No physical measurements/discovery, ESP32 transport, password reset, email verification or Google OAuth were added. No backend migrations or mutations were changed.
- Remote Desktop Commander returned tool-unavailable, not an online/offline status; it was not usable. Work used the available local checkout and a successful authorized GitHub fetch. No offline-machine claim was inferred from the old archive.
- Initial npm certificate validation failed. Installation completed using `NODE_USE_SYSTEM_CA=1` without disabling TLS verification. npm also reported the existing unapproved optional `unrs-resolver` postinstall; it was not manually approved.

## Reproduce browser checks

From `mobile/specwatt-app`, install the locked dependencies (`npm ci`). Set `PLAYWRIGHT_MODULE` to an existing external Playwright module path, and `QA_BASE_URL` to the local Expo development server. Run `first-run-smoke.mjs`, `ui-smoke.mjs`, `ui-text-smoke.mjs`, `ui-server-smoke.mjs` with Node's `--experimental-strip-types`. The real-server script creates its own loopback FastAPI process and temporary SQLite DB and removes them on exit. No real account is used. WEB before capture requires the base revision's screen; after capture uses this revision.

For an exported WEB preview, run `node scripts/serve-export.mjs dist-web-v6 8103`; this QA server binds only to loopback and provides the required SPA fallback. It is not a deployment.

## Changed files

Product: `src/app/index.tsx`, `_layout.tsx`, `src/screens/server.tsx`, `src/specwatt/model.ts`, `store.tsx`, `i18n.ts`, `api.ts` under `mobile/specwatt-app`.

Tests: five `tests/first-run-*.test.mjs` files plus the existing locale screen/provider tests. QA: first-run capture/parcours/export-server scripts and adaptations to four existing UI scripts. Security: `security/scan_secrets.py` and its regression tests. Documentation: this report, PR draft, implementation plan and twelve canonical WEB images with manifests. Full paths are available with `git diff --name-only e842287..HEAD`.
