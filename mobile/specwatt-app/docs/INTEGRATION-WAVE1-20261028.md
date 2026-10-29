# SpecWATT — independent wave 1 integration review (C + A), 2026-10-28

## Scope, merge and authorship
- Integration base: `d31e1990ba16cac6e72e6282abf7069c11fd6844` (prior reviewed C merge, PR #4, original agent commits retained).
- Agent A Draft PR #5: https://github.com/t1ktakdev/SpecWatt/pull/5, head `12eb3b1eba79c919066891152e0c56aceeff0e0d`, from original `b5b1c72`. A modifies exactly 10 owned files; the agent worktree remains untouched.
- Staged in isolated review worktree `C:\Users\user\.codex\worktrees\specwatt-wave1-review-20261028` with a normal two-parent merge commit, no squash/rebase/force.
- Backups before changes: `outputs/WAVE1-A-C-REVIEW-20261028/premerge-history.bundle` (verified full history of integration, A and C).
- PR #3 must stay Draft; main unchanged. No hardware, ADB, scrcpy, owner phone or 220 V operations.

## Independent findings
1. **PR #5 GitHub Security test initially FAILED**, despite 4 other jobs passing. `test_async_storage_is_confined_to_the_offline_demo_store` reported new `src/specwatt/localization/locale-mirror.ts` as an illicit second AsyncStorage owner. This is a real architecture/security regression, not a flaky test. The agent's `107 mobile pass` report did not test the security suite.
2. Original mirror used fire-and-forget independent writes from screens and read recovery in a screen effect. This could reorder rapid locale writes and race readiness/navigation. Recovery belonged in `SpecProvider`, not a UI effect.
3. The current `model.restoreState` strictly resets corrupted demo state to safety defaults. Modifying it to preserve unsafe state is unnecessary; the integrator recovers only validated locale in `store.tsx` after failure, leaving `model.ts` and CH3 invariants intact.
4. Agent C worker isolation: per-controller `try/except Exception` inside transaction context safely rolls back a failed controller and continues; `runner._advance` rejects a cancelled linked command terminally with an audit event. Four original C commits retained; 19 new deterministic tests. CI for prior `d31e199` confirmed SUCCESS.
5. Changes of A stay in onboarding/setup/settings/i18n and tests; full localization of Home/Devices/LED/Autopilot/Plan/Journal/server workspace remains deferred.
6. Kyrgyz strings were reviewed against Russian for obvious semantic leaks in badges, CH3, offline auth and device setup; dictionary key parity/types are tested. Not certified by native Kyrgyz copyeditor, and no TalkBack/Android emulator acceptance.

## Fixes made by the integrator on top of A
- `locale-mirror.ts` becomes pure, storage-adapter-injected policy without importing `AsyncStorage`.
- `store.tsx` is the **only** app module accessing AsyncStorage. It loads the primary state first; for missing/unreadable/corrupt state, it recovers only strict `ru/ky` from either the validated record or the mirror. Dangerous channels/consent/onboarded state are not restored from corrupt data. No change to `model.ts`.
- All mirror writes now follow primary snapshot writes in the existing serialized store queue; rapid locale changes cannot overwrite the latest persisted choice with an older value.
- Onboarding no longer asynchronously reads storage or changes locale after navigation. Its language selection delegates to `SpecProvider`.
- Refactored mirror and component tests and added independent `zcode-locale-store.test.mjs` for real provider lifecycle, corrupted state, primary read failure, empty state, write ordering and safe fallback.

## Verified commands on isolated combined tree
- `npm test` (mobile/specwatt-app): 114 PASS, 0 FAIL, exit 0.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `python -m unittest discover -s tests -q` (backend): 90 PASS, exit 0.
- `python -m unittest discover -s security -q` (repository root): 100 PASS, exit 0 (independent run on combined tree).
- `python scripts/smoke.py` (backend): PASS exit 0.
- `python -m bandit -r backend/specwatt_api -ll -q`: exit 0 (known non-finding nosec B608 warning).
- `python security/scan_secrets.py` and `--history`: clean exit 0.
- `git diff d31e199 --check`: exit 0.
- Local test evidence: `outputs/WAVE1-A-C-REVIEW-20261028`, independent review logs in ignored review worktree. CI of final published HEAD MUST be verified separately.

## Expo Doctor — exact pre-existing patch drift
`npx --no-install expo-doctor`: 19/20 checks PASS, exit 1 due to exactly six SDK-58 patch-level deviations:
| Dependency | Expected | Current |
| --- | --- | --- |
| @expo/ui | ~58.0.24 | 58.0.23 |
| expo | ~58.0.20 | 58.0.19 |
| expo-dev-client | ~58.0.16 | 58.0.15 |
| expo-file-system | ~58.0.12 | 58.0.11 |
| expo-router | ~58.0.27 | 58.0.26 |
| expo-web-browser | ~58.0.7 | 58.0.6 |

No native dependencies changed in this wave, so avoid blanket update without separate clean install, Android debug build and policy/security tests. Current SDK 58 has not been intentionally switched.

## SQLite index review
The C agent's optional index proposals `commands(controller_id,status)` and `schedules(status,controller_id)` are NOT adopted here. At 20k rows a measured query was ~1.37 ms and tick ~9 ms, so unnecessary v4 schema migration/risk for prototype volumes. Re-evaluate only on measured workload and with migrations tested on disposable SQLite copies.

## Non-blocking and remaining
- Native Android visual/large text/TalkBack on isolated emulator not verified, Warm Graphite design unchanged by integrator.
- npm audit raw exit 1 (4 known advisories), baseline gate exit 0; @expo/code-signing-certificates resolved since baseline. Known advisories are not necessarily remediated. Node warnings and StarletteDeprecationWarning remain.
- Six main screens still use offline demo, authenticated server workspace separate. No hardware ACK claim.
- Newly required D and B pinned HEAD must be the final integration merge SHA, not d31e199 or b5b1c72.
