# SpecWATT product UI implementation — 2026-10-28

Base: verified remote integration/unified-v7-20261027, e27fe00. Dedicated managed worktree, branch codex/specwatt-product-ui-20261028. The user explicitly requested implementation without another design approval cycle.

## Direction and constraints

Retain Warm Graphite #181A18 / peach #FFAA69, existing licensed Arimo and original SVG artwork. Use quieter surfaces, 4/8 spacing, readable 12–16 text, meaningful numeric hierarchy and in-flow device media. Preserve all backend/security/firmware/contracts/dependencies, CH3 read-only, demo/server separation, request uncertainty, photo ownership and localization recovery. No push/merge or physical devices.

Consulted SDK 58 docs and RN 0.88 useWindowDimensions. Expo leaf skills are absent locally. Keep existing cross-platform controls and their motion contract rather than introducing platform-specific UI replacements during a visual correction.

## Sequential implementation and evidence

- [x] A: DeviceVisual: update renderer regression expectations first, verify RED, remove implicit bundled source, preserve explicit vector/photo and errors, verify GREEN and commit.
- [x] B: theme/ui/mobile-ui: consistent surfaces, typography, 48dp controls, responsive gutters/tab bar; use mobile baseline as visual regression and verify typecheck/lint.
- [x] C: dashboard/device: flow-based cards, sibling navigation and switches, unknown/stale presentation; behavioral renderer/UI tests and 320/393/440 captures.
- [x] D: chart geometry with tested finite scales, readable undistorted labels, accessible summaries; autopilot permission count and honest proposals; commit.
- [x] E: onboarding, journal, detail/setup/settings/server presentation through shared components, locale and navigation smoke; preserve independent server state.
- [x] F: preserve/review reduced motion, cancel animations and press feedback; fix layout-changing feedback if observed. Final validation, visual matrix, provenance, local commits and draft PR description.

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


## Closure ledger

| ID | Root cause → implementation | Evidence |
|---|---|---|
| VIS-01 | implicit imageMap selection removed; valid explicit vector/photo preserved | DeviceVisual renderer tests RED→GREEN, native photo/policy suite, browser default contains no img; unique gradient ids |
| TYPE-01 | unified line heights and tabular metrics; nav/chart/catalog labels 12+ | font file wght 400–700; all six Kyrgyz glyphs present; RU/KY screenshots |
| GRID-01 | nav width derives from same 440 maximum and 16/20 gutters | 320–440 captures, bottom scroll snapshots |
| CARD-01/02 | in-flow layout, growing text, narrow/large-type single column | dashboard renderer tests and 320px long-name fixture |
| FLOW-01 | detail action and switch are siblings | component assertion + actual browser click changes exactly one event, remains /home |
| DATA-01 | unknown and stale are labelled, controls disabled; historical detail value explicit | component test + missing/stale fixture screenshots |
| CHART-01/02 | measured width, adaptive finite ticks, missing values, scalable SVG geometry | chart-layout + chart-ui tests including null/zero/high/long series and fontScale 1/1.5/2 |
| AUTO-01 | status/permission card replaces decorative gauge; eligible denominator excludes CH3 | autopilot captures show 0 of 2, proposal explicitly unexecuted |
| A11Y-01 | 48+ targets, wrapping labels, keyboard focus outline | renderer focus RED→GREEN; catalog review and browser smoke |
| ONBOARD-01 | concrete energy purpose, quiet offline account, clearer none mode | all 3 onboarding scenes both locales; demo and none flow including reload |
| JOURNAL-01 | no history vs empty filter differentiated, no fabricated events | filtered-empty capture + actual UI smoke |
| MOTION-01 | root/detail/catalog obey live Reduce Motion, startup fade cancels, focus feedback added | navigation-motion + existing cancellation/press wrapper tests; native performance unmeasured |
| NET-01 | newly reproduced baseline browser fetch receiver bug; default fetch bound to globalThis | browser Illegal invocation vs global health200, test RED network_error → GREEN, real server UI requested→explicit ACK |

Ruling: NET-01 is a minimal frontend transport correctness fix needed to validate the existing server UI, not a visual shortcut. No endpoint, auth, timeout, retry, state or backend contract changed. Injected fetchers remain unchanged. Independent reviewer accepted this correction.

Independent review found fixed SVG text ignoring system font scale; fixed and verified at 1, 1.5 and 2 in component harness. Follow-up found no important regressions and caught residual catalog 10px/45dp color selectors; these were corrected to 12px/48dp.

Contrast on #242623: primary 13.85:1; muted 7.52:1; secondary 6.38:1; peach 8.14:1. Dark text on peach: 8.67:1. Artwork micro-mark is decorative, not a UI label.

Native acceptance, Android font measurement/insets/TalkBack, native photo picker and 60fps profiling are NOT claimed. No Android SDK/emulator executable was found in the checked standard installation/PATH. No physical device commands were issued.

Final visual review: at 320px use short visible tab names with full accessibility labels; at large system font show the selected tab label across the bar above five accessible icons. History axes fit the 320px content width without unnecessary horizontal clipping. Settings language controls inherit the shared 48dp minimum.
