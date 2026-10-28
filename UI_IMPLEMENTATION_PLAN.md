# SpecWATT product UI implementation — 2026-10-28

Base: verified remote integration/unified-v7-20261027, e27fe00. Dedicated managed worktree, branch codex/specwatt-product-ui-20261028. The user explicitly requested implementation without another design approval cycle.

## Direction and constraints

Retain Warm Graphite #181A18 / peach #FFAA69, existing licensed Arimo and original SVG artwork. Use quieter surfaces, 4/8 spacing, readable 12–16 text, meaningful numeric hierarchy and in-flow device media. Preserve all backend/security/firmware/contracts/dependencies, CH3 read-only, demo/server separation, request uncertainty, photo ownership and localization recovery. No push/merge or physical devices.

Consulted SDK 58 docs and RN 0.88 useWindowDimensions. Expo leaf skills are absent locally. Keep existing cross-platform controls and their motion contract rather than introducing platform-specific UI replacements during a visual correction.

## Sequential implementation and evidence

- [ ] A: DeviceVisual: update renderer regression expectations first, verify RED, remove implicit bundled source, preserve explicit vector/photo and errors, verify GREEN and commit.
- [ ] B: theme/ui/mobile-ui: consistent surfaces, typography, 48dp controls, responsive gutters/tab bar; use mobile baseline as visual regression and verify typecheck/lint.
- [ ] C: dashboard/device: flow-based cards, sibling navigation and switches, unknown/stale presentation; behavioral renderer/UI tests and 320/393/440 captures.
- [ ] D: chart geometry with tested finite scales, readable undistorted labels, accessible summaries; autopilot permission count and honest proposals; commit.
- [ ] E: onboarding, journal, detail/setup/settings/server presentation through shared components, locale and navigation smoke; preserve independent server state.
- [ ] F: preserve/review reduced motion, cancel animations and press feedback; fix layout-changing feedback if observed. Final validation, visual matrix, provenance, local commits and draft PR description.

## Defect ledger (baseline findings; closure evidence appended during work)

| ID | Priority | Evidence / cause | Expected correction |
|---|---|---|---|
| VIS-01 | P1 | DeviceVisual bundledSource precedes SVG with legacy image | Vector default; explicit owned photo only |
| TYPE-01 | P1 | nav overrides Copy 12 with 10; chart labels 9–10 | readable 12+ labels |
| GRID-01 | P1 | content 440 vs nav 542 | one aligned content width |
| CARD-01 | P1 | home fixed 230 and absolute media/control | in-flow media, growing text |
| CARD-02 | P1 | list text 64% and absolute media 54% | separate nonoverlapping areas |
| FLOW-01 | P1 | nested home card and switch pressables | sibling detail and toggle actions |
| DATA-01 | P0 | watts ?? 0 labels unknown as off | explicit missing/stale, disabled unsafe control |
| CHART-01 | P1 | 350×88 SVG stretched to 70 high | measured width, uniform text |
| CHART-02 | P1 | static ticks / grid 345 / long series | finite adaptive scale and full grid |
| AUTO-01 | P1 | permission denominator 3 includes protected CH3 | eligible CH1/CH2 only; remove decorative gauge |
| A11Y-01 | P1 | chips 39, toggle 44, info icon only | minimum 48 area, readable wrapping |
| ONBOARD-01 | P1 | competing unavailable login / generic value | clear energy purpose and quiet offline entry |
| JOURNAL-01 | P1 | filtered-empty and no events share message | useful distinct empty/filter state |
| MOTION-01 | P2 | MotionPressable existing fixed callback contract | preserve cancellation/reduced motion; no false ACK |

## QA and limitations

Baseline npm test: exit 0, 196/196. Existing HTTP E2E starts disposable loopback FastAPI/SQLite and awaits readiness; historical flake not reproduced in this run, no speculative backend/test lifecycle edits.
Capture real WEB before/after with isolated browser contexts on port 8097, fixed demo fixture/time and RU/KY. Preserve original archive separately with hashes (21/21 match). WEB is not native fontScale QA; native acceptance remains pending unless an isolated emulator is available. Review text scaling structurally and in component tests, never label browser zoom as Android fontScale.
