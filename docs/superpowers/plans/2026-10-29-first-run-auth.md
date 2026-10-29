# First run and auth entry implementation plan

Goal: complete the supplied 02_FULL_CODEX_TASK.md in the existing Expo 58 application.
Base: origin/integration/unified-v7-20261027, e842287a4aa9c381e086ceb244bd6a6c4a6279a1.
Owner: Codex, sole writer in feature/first-run-auth-ux-20261029.
Execution: inline, as requested by the user; no extra approval before implementation.

Acceptance conditions:
1. Native splash and brand transition have a bounded font/animation fallback and respect Reduce Motion.
2. Three concise product cards have progress, Back, Continue and Skip to language selection.
3. RU/KY and unfinished steps survive reload through the existing serialized store.
4. DEMO works without network; opening controller information never completes pairing or onboarding.
5. Login opens the existing /server, sharing BrainClient, vault and request scope; no second session.
6. Server credentials validate at 12–128 characters, provide show/hide, autofill, busy/error states, and never persist passwords.
7. Existing permissions, CH3, six main screens, backend and firmware stay intact.
8. Actual tests, WEB before/after captures and limitations accompany local commits; no push or merge.

Tasks:
- [x] Capture baseline WEB onboarding and run the existing mobile suite.
- [x] RED: model resume/invalid-step/permission preservation and first-run interaction tests.
- [x] GREEN: optional validated firstRunStep in model.ts; store.tsx dispatch; index.tsx journey and typed i18n copy.
- [x] RED/GREEN: stalled fonts and reduced motion splash lifecycle tests and bounded fallback in _layout.tsx.
- [x] RED/GREEN: existing server form show/hide and autofill tests; minimal server.tsx changes only, preserve scope/vault.
- [x] Run complete mobile/type/lint/doctor/exports/backend/security/smoke/audits; record every exit and skipped check.
- [x] Browser RU/KY at 320/393/440, enlarged text, reload/back/skip/offline/controller and actual FastAPI entry; capture evidence.
- [x] Review diff, commit implementation and evidence/handoff with truthful provenance.

Review focus: interrupted writes; restored onboarding destination; stale authentication response after navigation; screenreader step changes; narrow widths with enlarged text. Browser text enlargement is not native fontScale proof. No emulator/device was attached on initial adb inventory.

Ruling: use the brief's explicitly allowed /server handoff instead of extracting auth from a working workspace. Missing Expo leaf skills are not installed; consult version 58 official docs and existing shared components. Keep accepted custom Warm Graphite buttons for native/web parity.

Result: 226 mobile, 90 backend, 102 security tests passed. Independent read-only review found no Critical/Important issues. Native acceptance remains BLOCKED; Doctor and raw npm audit limitations are in docs/first-run/REPORT.md.
