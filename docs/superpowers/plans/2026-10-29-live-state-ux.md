# Live state and premium UX implementation plan

Execution: inline, no subagents, as explicitly requested. Source specification: supplied SpecWATT-CODEX-LIVE-UX-20261029 bundle; base d6360aacfc6189f15aa982d266fdb09a60c7e5b4.

Goal: an owner can sign in, select a simulator and use the main tabs without demo leakage or fabricated acknowledgements.
Architecture: reuse BrainClient, its single vault and createServerRequestScope in one observable app workspace; React context subscribes to it. DEMO stays in SpecProvider. Five route wrappers select their source explicitly.
Tech: existing Expo 58 / React Native 0.88 / TypeScript / FastAPI SQLite. No dependency upgrades.

Acceptance (8 conditions):
1. Existing first-run, RU/KY and fully offline DEMO work unchanged.
2. One vault/session/selection lifecycle; logout, owner and URL changes invalidate all data and old responses.
3. Home/Devices use server snapshot provenance, acquisition time, freshness and unknown values.
4. CH3 never offers actuation; CH1/2 requests send once, with stable UUID, fresh-data and in-flight guards.
5. Simulator acknowledgement/sample are separate explicit actions; lost mutation response is uncertain and reconciled using GET.
6. Journal/history are controller scoped, validated, cursor paginated and never mixed with demo events.
7. Foreground polling is finite, deduplicated and cancelled on navigation/background/source changes.
8. Existing suites, real HTTP, browser regression, security, builds and visual evidence are recorded with actual exits; native/hardware limitations explicit.

Review focus: delayed old-owner responses; mutation committed with lost reply; stale time and skew; missing/deleted controller; browser reload memory-only session.

Tasks:
- [ ] Baseline: install locked dependencies, run suites, export and capture six screens at RU/KY 320/393/440 before product edits.
- [ ] P0 data: add failing tests for strict events/history and workspace lifecycle; implement BrainClient history methods, observable workspace and provider; run focused tests.
- [ ] P0 UI: reuse auth form with shared workspace; source-aware route wrappers, Home/Devices/Journal, protected details, explicit command/step and honest system states. Real HTTP + browser acceptance before proceeding.
- [ ] P1: reuse ServerSchedules on main Plan and permission/limits on Autopilot; no invented enabled state.
- [ ] P2: refine source/status hierarchy, curated SVG, genuine power history and responsive layouts. Compare before/after evidence.
- [ ] Verification and delivery: all required gates, current/history secrets, raw audit + baseline, Expo Doctor, WEB/Android exports; local commits, runbook/gaps/review.

Rulings: user has provided full design and requested immediate execution, so additional design approval is unnecessary. Native worktree tool cannot choose D:; explicit D: requirement takes precedence and git worktree was used. No physical phone, firmware, Stage1, push or PR mutation. No selected-ID persistence: session-memory selection is safer and revalidated after each auth; browser reload requires login as existing vault specifies.
