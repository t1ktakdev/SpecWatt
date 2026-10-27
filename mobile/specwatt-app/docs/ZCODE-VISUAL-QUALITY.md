# ZCode Wave 2 — Mission B: Professional Device Visual System (handoff), 2026-10-28

Agent: ZCode GLM-5.3-Flash (Vision), effort max. Branch `zcode/max-device-visuals`.
Base: `eff2f4d9ff1dd62ad28a8dd38efb38d1754cffd2` (origin/integration/unified-v7-20261027, verified with `git ls-remote` before any edit; unchanged during the run).
Worktree: `C:\Users\user\Documents\ChatGPT\SpecWATT-agent-worktrees\zcode-max-device-visuals` (created from the source repo `C:\Users\user\Documents\ChatGPT\SpecWATT` with `git worktree add -b zcode/max-device-visuals <path> eff2f4d9…`; clean, no foreign changes, no reset/clean/force used).

## What was implemented

1. **22 illustration families now render a distinct artwork per catalogue form.** Before the fix, 32 pairs (and one quadruple) of categories rendered pixel-identical vectors because most `DeviceIllustration` branches keyed on `family` and ignored `form`. Every distinction is new inline SVG in the existing Warm Graphite palette (body/edge/metal/glass/warm gradients, existing accent strokes) inside the fixed `viewBox="0 0 320 240"`; no categories, palette, catalog screen, or bundled photos were changed. The approved reference primitives are preserved byte-for-byte where they remain the default (the `mushroom-lamp` dome for CH1, the pc-fan frame/blade/cable geometry — the fan head stays at its original y=119, the led coil now belongs to `led-reel`, so CH2's default *vector fallback* intentionally draws the new serpentine strip instead of the coil; the bundled photos shown by default are unchanged).
   - lamp: desk-lamp (task lamp, angled arm + cone shade) and bedside-lamp (drum shade on stem base) split from the mushroom dome
   - led: led-strip becomes a serpentine strip with modules and plug (led-reel keeps the coil)
   - bulb: filament-bulb gets a taller envelope with curl-filament (smart-bulb keeps the LED zigzag)
   - pendant: wall-sconce = wall plate + downward half-dome + light pool
   - spotlight: floodlight = yoke-mounted head with beam rays (ceiling-spot unchanged)
   - fan: desk-fan vs floor-fan (parametrised head position/size, stand vs pole); extractor-fan = wall grille plate, no cables (pc-fan keeps its frame and cables)
   - purifier: dehumidifier = visible water tank; heater: convector = horizontal fins vs ceramic-heater = vertical fins + dial
   - fridge: freezer becomes a chest freezer
   - ricecooker: rice-cooker = pot with steam wisps; thermopot = tall body with pump, spout and level window (multicooker unchanged)
   - oven: mini-oven = compact body, top handle, twin knobs
   - toaster: waffle-maker = round clamshell with grid texture and steam
   - blender: food-processor (bowl + chute), coffee-grinder (compact hopper), juicer (cone + glass) all separated from the blender jug
   - washer: dryer = square door + lint slot (washing machine keeps the porthole)
   - vacuum: steam-cleaner = canister + steam wisps; robotvac: robot-mop = water tank and wet track
   - pump: circulation-pump = inline capsule with flanges and terminal box
   - computer: nas-storage = horizontal 4-bay enclosure with status LEDs
   - printer: laser-printer = compact box with top lid (inkjet keeps paper feed)
   - speaker: subwoofer = low cube, single large woofer + port
   - camera: baby-monitor = antenna, smaller lens, nightlight
   - hairdryer: hair-styler = barrel brush head; electric-shaver = flat foil head (toothbrush keeps bristle top)
   - monitor: ultrawide-monitor now really wide and low (292×102 screen vs 238×135 standard)
2. **`defaultDeviceConfig` image selection fix** (`src/specwatt/device-visual.tsx`): `image === "appliance"` fell back to the `unknown` box although the bundled `appliance.png` is a kettle; it now falls back to the `kettle` vector so a photo→vector degradation stays semantically consistent. All other mappings unchanged (charger→phone-charger, socket→smart-socket, CH2→led-strip, CH3→pc-fan, default→mushroom-lamp).
3. **Regression tests (new, deterministic, no new dependencies):**
   - `tests/zcode-device-visual-forms.test.mjs` — transpiles the real `DeviceIllustration.tsx` + real `catalog.ts` (typescript compiler + `node:vm`, the same harness pattern as the pre-existing `native-layout.test.mjs`) and asserts: every one of the 119 categories renders inside `viewBox="0 0 320 240"`; hostile config values are rejected and render exactly the safe `unknown` fallback tree (with the validation-rejection cases also covered in the pre-existing `illustrations.test.mjs`); every gradient stop is a valid numeric/percentage offset in non-decreasing order per gradient; **all categories of one family render pairwise-distinct artwork trees** — the signature covers geometry, fills/strokes, gradient stop colors and text content (this is the test that failed with 32 duplicate pairs before the fix); the ultrawide screen is >24 px wider than the standard monitor; and the art stays hook-free beyond `useId` (the harness fails loudly on new hooks).
   - `tests/zcode-device-visual-defaults.test.mjs` — loads the real `device-visual.tsx` with the real `appearance-policy`/`photo-policy`/catalog (only expo-filesystem and the asset registry mocked) and asserts the full §9 scenario chain: a valid persisted vector config renders with its exact stored config; every bundled image id renders through the bundled branch; photo renders only while the owned file exists; vanished photo → default vector; `onError` → vector on next render; appearance persisted against a category that no longer exists → bundled photo remains; `https:`/traversal photo URIs rejected by the real policy → bundled photo; unmapped/hostile `image` ids → vector, never a broken `<Image>`; scene mode paints the Warm Graphite backdrop.
   - `tests/zcode-device-visual-photos.test.mjs` — the real `photos.ts` native composition against an in-memory filesystem (only `expo-file-system`/`expo-image-picker`/`expo-image-manipulator` faked; all policy decisions run the real `photo-policy`): import lands a generated JPEG in the owned directory and cleans the manipulator cache with released contexts; canceled picker creates nothing; oversized source rejected before any owned write and over-cap manipulator output rejected at the write gate; concurrent import → `photo-busy`; prune keeps used photos, never touches foreign names, deletes only orphan generated JPEGs; clear removes all; `devicePhotoExists` gates on ownership, existence, size cap and IO/permission failure (trap); on web the module never touches the filesystem and import throws `photo-unsupported`.
   - Red/green evidence: the forms test failed at baseline with the full duplicate list (e.g. `lamp: desk-lamp renders identical to mushroom-lamp`); the defaults test failed with `appliance` → `unknown` before the fix (verified by temporarily reverting the one-line mapping, `pass 5 / fail 1`, then restoring).

## Verification log (mobile/specwatt-app unless noted)

| Command | Result |
| --- | --- |
| `git ls-remote origin integration/unified-v7-20261027` (before edits) | `eff2f4d9ff1dd62ad28a8dd38efb38d1754cffd2` — matches pinned base, exit 0 |
| `npm install` (fresh worktree, package*.json untouched) | exit 0, 811 packages |
| `npm test` (baseline before edits) | **114 pass / 0 fail, exit 0** (initial 3 failures were only the missing `node_modules`) |
| `npm run typecheck` (baseline) | exit 0 |
| `npm run lint` (baseline) | exit 0 |
| `node --test tests/zcode-device-visual-forms.test.mjs` (RED, before fix) | 3 pass / 2 fail with 32 identical-pair findings + ultrawide width 238=238 |
| `node --test tests/zcode-device-visual-defaults.test.mjs` (RED, one-line revert of `appliance` mapping) | 5 pass / 1 fail (`expected 'kettle', got 'unknown'`) |
| `npm test` (after fixes, review fixes and both night-watchdog rounds) | **151 pass / 0 fail, exit 0** (114 pre-existing + 37 new across four files; no pre-existing test modified) |
| `npm run typecheck` (after fixes) | exit 0 |
| `npm run lint` (after fixes) | exit 0 |
| `python security/scan_secrets.py` (repo root) | `SECRET SCAN: clean (tracked worktree files)`, exit 0 |
| `python security/scan_secrets.py --history` (repo root) | exit 1 — **2 pre-existing findings, not from this branch**: `[generic-assignment]` in `tests/zcode-server-e2e.test.mjs:19` at commits `77985ef` / `72b953b` (authored by "ZCode Mobile Server Resilience Agent", 2026-10-28; that file does not exist in the current tree). No finding touches commits or files of this mission. |
| `git diff --check` and `git diff --cached --check` before each commit | clean, exit 0 |
| `npx --no-install expo-doctor` | **not re-run**; the six known SDK-58 patch drifts documented in `docs/INTEGRATION-WAVE1-20261028.md` remain (no dependency changes were made, per instructions) |

## Performance (§12) — web preview measurement, NOT Android

Measured on the local Expo web preview (`npx expo start --web`, Chromium viewport 440×952, dev bundle) via in-page `performance`/DOM queries:

- The virtualized catalogue renders **25 `<svg>` elements for 119 categories** on load (existing FlatList tuning `initialNumToRender=6`, `maxToRenderPerBatch=6`, `windowSize=5` is doing its job; no new memo was added because no measured bottleneck exists at this scale).
- 1454 SVG child nodes / 1648 DOM nodes total on the catalogue screen; navigation `DOMContentLoaded` ≈ 291 ms in the dev server.
- New art adds at most 17 nodes per changed form (largest: hair-styler, 38→55 total); several changed forms actually reduce node count (led-strip, extractor-fan). The heaviest family (`led` coil, ~150 nodes) is unchanged in shape count.
- **Native Android rendering, memory and pixel-ratio behaviour: N/A — no emulator was available in this session** (see limitations). `devicePhotoExists` performs a synchronous per-render existence stat (≤ 3 files per screen); left as-is deliberately — replacing it with a cache would need invalidation wiring through `photos.ts` mutation paths and cannot be measured or verified without a device.

## Visual evidence and provenance

All evidence in this run is **browser preview or static PNG inspection — none of it is a native Android capture**.

- Approved references (read-only, Vision): `design/references-v7/devices.png`, `home.png`, `led.png` (440×952) — bundled photos in cards match the current bundled PNGs.
- Bundled assets inspected by Vision (read-only, unchanged by this branch): `mobile/specwatt-app/src/assets/specwatt/{lamp-scene,led-strip,fan,charger,socket,appliance,lamp}.png`.
- Baseline web preview screenshots (Expo web, 440×952): catalogue constructor and demo `/home` after entering demo mode — CH1/CH2/CH3 cards show the approved photos; catalogue tiles/preview render Warm Graphite vectors. Duplicate pairs observed live: `Бра`=`Подвесной светильник`, `Осушитель`=`Очиститель воздуха`, `Мини-печь`=`Духовой шкаф`, `Вафельница`=`Сэндвичница`, `Мультиварка`=`Рисоварка`, `Стиральная машина`=`Сушильная машина`, `Водяной насос`=`Циркуляционный насос`, `Настольный вентилятор`=`Напольный вентилятор`, `Конвектор`=`Керамический обогреватель`, `Акустическая колонка`=`Сабвуфер`, `Видеоняня`=`Камера наблюдения`, `Стайлер`=`Электробритва`, `Широкий монитор` не шире обычного.
- Post-fix web preview (re-rendered same route): desk-lamp vs mushroom-lamp visibly distinct; LED zigzag vs coil; wall-sconce with plate + light pool; circulation pump inline capsule; ultrawide really wide; subwoofer cube with big woofer; thermopot with pump/window. The remaining distinctions are guaranteed by the pairwise tree-signature test (every family, every form, deterministic).
- Figma (MCP `figma-desktop`, file `ge735l7Qim9ySVcG3BoeCx`, page `46:28 Stage3 — Connection & Devices`): metadata read confirms the approved image chooser (frame `09 Image chooser`, node `46:5915`) presents the three bundled photographs (Cream lamp / LED / Fan) as options with a selected checkmark, and `07 Assign device` uses a 96×88 rounded product photo. The Warm Graphite tokens and photo-first chooser are respected by this branch; no Figma pixel-parity claim is made (no pixel export was compared programmatically).

## Architecture decisions

- Stayed inside the existing single-illustration architecture: one `DeviceIllustration` switch keyed on `family` + `form`, one validated config type, no new components, no second store, no new dependencies, no runtime asset downloads.
- Distinguishing artwork is implemented as additional form branches in the same inline-SVG idiom (same gradient ids, helper closures, stroke palette) rather than a data-driven art DSL — smallest diff, zero API change, `DeviceIllustrationProps` untouched.
- Tests use the repo's established transpile+vm harness; they import only real production sources (with the two genuinely native boundaries — expo-filesystem and Metro asset registry — stubbed), so they compile-run the actual component code on every `npm test`.
- No URI schemes were added or changed; `appearance-policy`/`photo-policy` logic is untouched and now additionally covered through the real modules by the defaults test.

## Skills / MCP / tools actually used

- Skills loaded and followed: `specwatt-project-guardrails`, `using-git-worktrees`, `systematic-debugging`, `test-driven-development`, `expo-design-system`, `expo-native-ui`, `specwatt-native-visual-qa` (plus the finish-stage skills before completion).
- Browser-use skill + in-app browser: live catalogue/demos web preview, screenshots, search-driven form inspection, DOM/perf measurement.
- Figma MCP (`figma-desktop`): **available and used** for design metadata (page `46:28`); no OAuth error occurred; no screenshot pixel comparison was performed.
- Context7 / expo-docs MCP: available in this session but not needed (no API ambiguity that local SDK 58 sources could not answer; no calls made).
- Vision: used for all PNG references and bundled photos (Read tool).
- Subagents: two read-only reviewers were dispatched at review stage (architecture/security and tests/scenarios); main agent authored all files.
- Android emulator, ADB, scrcpy, physical devices: **not used and not available** (explicitly forbidden/absent).

## Bugs found outside owned files (no code changed there)

1. `src/app/index.tsx:94` uses `imageMap["lamp-scene"]` for the onboarding hero — the visual-QA skill lists "huge onboarding hero photo" as a known Warm-Graphite problem; hero sizing belongs to the onboarding owner. (Read-only observation.)
2. No visual regressions observed in the six demo screens' shared modules from this branch's changes; `npm test` includes the pre-existing layout/locale suites and stays green.

## Proposed patches for forbidden files (integrator decision, not applied)

1. **`src/app/setup.tsx` — allow returning to the bundled photo.** After a user picks a custom photo or vector, there is no action that resets `draft.appearance` to `undefined`, although the approved Figma chooser (`09 Image chooser`) presents the bundled photos as selectable options. Proposed minimal addition to the assign step (file owner should localize keys via the dictionary):

```tsx
{(draft.appearance || data.channels.find(c=>c.id===selected)?.assigned?.appearance) && (
  <CTA secondary label={t(locale, "resetImage")} onPress={() => setDraft(d => ({ ...d, appearance: undefined }))} />
)}
```

   This is safe with the current contract: `DeviceVisual` already renders the bundled photo when `appearance` is absent, `validateAppearance(undefined)` returns null, and `pruneDevicePhotos` (called on save) then reclaims the orphaned JPEG.
2. **`src/app/setup.tsx` — photo import error message.** `choosePhoto()` catches every `PhotoError` code (busy/too-large/unsupported/read-failed/write-failed/…) into the single generic `errPhoto` string. The error codes exist in `photo-policy.ts` and are now stage-accurate end to end; mapping `e.code` to distinct dictionary keys would make "file too large" vs "storage full (write)" distinguishable for the user. Proposed but not applied (dictionary files are outside this mission's file list).
3. **`src/app/index.tsx`** — onboarding hero photo sizing (known visual-QA issue) needs its owner's review; the bundled asset is fine.

## Night-watchdog round (2026-10-28, post PR #7): bundled image failure fallback

An independent night review of PR #7 head `ae56b3a46cae5126a522b451d61eecbb406a0ff2` found a reproducible gap: the `onError` handler on the bundled-`Image` branch called `setFailedUri` only for custom photos, so a missing/corrupt/undecodable **bundled** asset kept re-mounting an empty `<Image>` on every render — the safe vector fallback (including the fixed `appliance`→`kettle` mapping) was never reached. The coordinator's reproducer (`C:\Users\user\Documents\ChatGPT\ZCode-Night-Watchdog\evidence\B\repro-bundled-error.mjs`, built on this file's own harness, native boundaries mocked exactly like the committed tests) failed on that head with `after='Image'`, exit 1, and passes after the fix with `after='Vector'`, exit 0.

Exact renders (same harness, assignment `{image:'appliance'}`):

| Step | Before fix (ae56b3a) | After fix |
| --- | --- | --- |
| initial render | `Image` (source = bundled appliance asset) | `Image` (source = bundled appliance asset) |
| `onError()` → re-render | **`Image` again** (failure ignored; empty image loops forever) | **`Vector` (`categoryId='kettle'`)** |
| 3 further renders | `Image` every time (re-requests the broken source) | `Vector` every time (no re-request) |
| switch assignment to `image:'fan'` | `Image` (by accident — errors ignored) | `Image` (stale failure state does not poison the other asset) |

Fix (`src/specwatt/device-visual.tsx`): the single state slot now tracks the **failed source identity** (custom-photo URI or bundled asset number) instead of only a failed photo URI; `onError` records whichever source was rendered. A failed source stops being mounted immediately (no per-render retry) while every other source — a different bundled asset, a new custom photo — still renders normally; re-selecting a previously failed source retries it exactly once, matching the pre-existing custom-photo semantics. Photo-first behavior for healthy bundled assets, the custom photo ownership/URI policy, scene backdrop, sizes and accessibility labels are unchanged; no new URI schemes; still a single `useState` slot (the documented harness assumption holds).

Regression coverage added to `tests/zcode-device-visual-defaults.test.mjs` (3 tests): bundled decode failure degrades to the correct vector for **all seven `imageMap` ids** and is never re-mounted on subsequent renders; the source-switching sequence (appliance→fan→appliance→socket) with stale-failure isolation and one bounded retry; scene mode keeps the backdrop, vector and accessibility label after a bundled failure. The three new tests failed on the pre-fix head (`pass 8 / fail 3`) and pass after the fix; the pre-existing custom-photo `onError` and photo→vector tests are untouched and green.

## Night-watchdog round 2 (photo IO): stage-accurate write-error classification

The coordinator's second night review (head `72db762d328c5b2ec02fb0d88f6246498eff0abd`) found via the same native-boundary harness that a real native failure during the destination write (ENOSPC/EACCES in `Directory.create` or `File.copy`) escaped the outer catch and was mislabeled `photo-read-failed`, although the source had already been read and decoded; the intended `photo-write-failed` existed only on explicit validation gates. Their reproducer (`evidence/B/repro-native-write-error.mjs`, FakeFile.copy landing a partial destination then throwing ENOSPC) returned `{code:'photo-read-failed', sourcePreserved:true, partialOwned:0}` with exit 1 on that head.

Fix (`src/specwatt/photos.ts`): the section from `rendered.saveAsync` (output production) through the final owned-file verification is wrapped in an inner stage-boundary try/catch — typed `PhotoError`s rethrow unchanged, untyped native failures become `PhotoError("photo-write-failed")`. The outer catch keeps the read/decode-stage classification (picker, source stat, `renderAsync` decode → `photo-read-failed`). No native message or user URI ever enters an error message (`PhotoError` messages are the bare code string). Destination cleanup, manipulator-cache cleanup, `release()` calls and the busy-flag reset all live outside the new boundary and behave exactly as before; the prune contract was not touched.

Failure-lifecycle coverage (fault seams added to the existing harness only; no new dependencies):

| Scenario | Classification | Behavior verified |
| --- | --- | --- |
| source stat/exists failure | `photo-read-failed` (already correct; guarded) | picker original preserved |
| decoder `renderAsync` failure | `photo-read-failed` (already correct; guarded) | no owned dir, context released |
| `saveAsync` encode/write failure | `photo-write-failed` (was mislabeled — RED) | no owned dir created |
| `Directory.create` ENOSPC/EACCES | `photo-write-failed` (was mislabeled — RED) | no half-created dir, contexts released |
| `File.copy` ENOSPC with partial destination | `photo-write-failed` (was mislabeled — RED) | partial file cleaned, picker original preserved, cache cleaned, both contexts released |
| cleanup (`delete`) failing during that error path | original typed error wins, no native text leaks | honestly leaves the one partial file, touches nothing else |
| any failure | busy flag released | immediate next import succeeds |

Red/green: the four misclassification tests failed on the pre-fix head (11 pass / 4 fail), pass after the fix; the coordinator reproducer returns `{code:'photo-write-failed', sourcePreserved:true, partialOwned:0}` exit 0. Mock fault injection only — no physical native QA claimed.

## Night-watchdog round 3 (web responsive/a11y QA of the catalogue)

Method: local Expo web preview (port 8094), real Chromium DOM measurements + screenshots via browser automation; **browser evidence only — no Android/native acceptance is claimed**. Larger-text emulation = CSS `zoom` 1.3/1.5 on `body` (Chromium), explicitly NOT the native Android fontScale. Binary captures: `C:\Users\user\Documents\ChatGPT\ZCode-Night-Watchdog\evidence\B\web-qa\` (01-12, filenames below); text/DOM numbers recorded here.

Scenario / viewport / locale -> actual result:

| Scenario | Result | Limit / note |
| --- | --- | --- |
| 440x952 RU, full catalogue (01) | 0 px horizontal overflow; 139 buttons; header/preview/controls/search/groups render | fresh-load FlatList mounts all 120 SVG on web before the first scroll (bottom scroll -> 40 mounted); native first-frame behaviour is N/A — no native run happened in this session, so no claim is made about it; web-only artifact, documented, not a code change |
| 320x800 RU (02) | 0 px overflow; Back 45x45 visible; footer CTA visible full-width (h=54) | preview/controls/tiles all legible; swatches fit one row |
| long RU name at 320 (03, search verikalnaya -> 1 hit) | tile shows the 2-line ellipsis form (17 px suppressed) | full name stays in aria-label; standard list truncation, not a defect |
| 800x360 landscape (04) | 0 px overflow; Back + CTA visible and inside the viewport | content scrolls under the fixed footer as designed |
| empty search 440x952 (05) | empty message + counter 0; 1 SVG (preview only, zero tiles); Back reachable | search/empty/back chain works |
| larger text zoom 1.3 @320 (06) | 0 px overflow; Back/CTA/search visible; title wraps mid-word | mid-word wrap is cosmetic (no word-break config); readable, left as-is |
| larger text zoom 1.3 @320 (07) | DEFECT FOUND: 5th colour swatch only 15/58 px visible | colour row did not wrap |
| larger text zoom 1.5 @320 | swatch fully off-screen (-32 px), 4th clipped (48 px) | fixed, see below |
| 440x952 KY (08, real onboarding -> demo -> catalogue) | KY title/counter/swatch/CTA names; KY selected name wraps fully; 17 SVG mounted (windowed) | KY strings complete on this screen |
| long KY name at 320 (09) | 2-line ellipsis; full name in aria-label | same truncation pattern as RU |
| changed families spot-check, KY preview (10-11: ultrawide-monitor, floor-fan, extractor-fan, led-strip, wall-sconce, subwoofer, network-switch, desk-fan) | all distinct, proportional, Warm Graphite consistent with the approved references; nothing clips the preview | widest forms were confirmed inside the preview and the 320x240 viewBox in these browser captures; the standing tests enforce the root viewBox attribute and pairwise-distinct trees, not per-art geometric bounds or pixel parity — in-bounds geometry was additionally checked by the architecture reviewer's one-off pass, and no pixel-parity claim is made |
| SVG/bundled aspect | viewBox 0 0 320 240 enforced for all 119 by test; bundled photos are not part of the catalogue screen (their card rendering was verified against references in earlier rounds) | — |

Fixes applied (owned files, minimal):

1. **Colour swatch row wrapping** (`src/screens/catalog.tsx`): the five fixed-width swatches overflowed and clipped at 320 px + zoom (measured above). The row now has `flexWrap: "wrap"` + `rowGap: 8` — no visual change at widths where all five fit, wrapped rows where they do not. Browser-verified after the fix: zoom 1.5 @320 -> all swatches fully visible (12-after-fix captures).
2. **Selected state announced by name** (`src/screens/catalog.tsx`): react-native-web drops `accessibilityState.selected` for `role=button` (measured: no `aria-selected` on any control), leaving selection purely visual on web. Tiles, colour swatches, variant/details buttons and group chips now append the localized selected marker to the accessible name when selected (native TalkBack additionally keeps the native selected state — the word is additive, not a replacement).

Regression suite `tests/zcode-device-visual-catalog.test.mjs` (5 tests, real CatalogScreen + real catalogue/search logic, navigation/store/primitives mocked): exactly-one selected tile and all four control groups announce the marker in RU and KY (with the kyrgyz word), unselected entries stay unmarked; the colour row carries `flexWrap:"wrap"`; search drives the real `searchDevices` (empty state + counter 0, fridge query -> counter 3 with all three matches); selection/use flow only dismisses back with the verbatim config (no capability effects). The marker/wrap assertions failed before the fixes and pass after.

## Night-watchdog round 4 (catalog test harness useState semantics)

The coordinator's review of head `d7007459144d505ce748ad21b4f00d62edacfab8` correctly identified a defect in THIS repo's catalog test harness (not in production code): `useState` computed the lazy initial value but never stored it in the hook slot, so the first functional updater received `undefined` and a config loaded from the route silently lost `color`/`variant`/`details`. Their reproducer (`evidence/B/repro-catalog-harness.mjs`, exit 1: `actual {categoryId:'fridge'}` missing three fields) confirmed it; the existing round-trip test passed because it asserted only `categoryId`.

Fix (test file only, no production change): the harness now stores the initializer's result exactly once per hook slot (`index in states`, so falsy stored values such as the empty search string are never re-initialized), and functional updaters receive the actual stored value; `resetState` still re-initializes fresh and `rewind` still preserves slots across re-renders.

New regression test `a functional selection keeps colour, variant and details through the use round-trip`: loads a non-default config through the route (`air-fryer/sage/angular/minimal`), performs a functional category selection immediately after load (the exact case that previously dropped fields), verifies idle re-renders do not mutate the stored config, applies two more sequential edits, then asserts the `use()` round-trip returns the exact deep config `{categoryId:'fridge', color:'copper', variant:'rounded', details:'minimal'}` with channel `CH1`. Red on the pre-fix harness (fields lost), green after; all six catalog tests and the full suite stay green.

Note on the reproducer file itself: it embeds a snapshot of the pre-fix harness text (its line still contains the old `states[index] ?? ...` literal), so it cannot turn green against the fixed file — the same scenario is covered by the live round-trip test above. The history-only CI blocker (D-agent commits) and all earlier limitations remain with the integrator.

## Code review (two independent read-only reviewers, main agent dispositions)

Reviewer A (architecture/security) independently re-derived the 32-duplicate baseline, ran geometry-bounds checks over all 119 renders and greps of the diff. Reviewer B (tests/scenarios) re-ran all suites, reproduced the red baseline from the base commit in a temp dir and mapped every mission scenario to its coverage. Both returned CHANGES-REQUESTED with no P0. Dispositions of every non-note finding:

| Finding | Severity | Disposition |
| --- | --- | --- |
| Doc claimed a Draft PR before it existed | P1 | Resolved by actually pushing and opening the Draft PR (URL in the final commit of this branch); doc corrected to record the real state at each commit. |
| `photos.ts` native paths (`importDevicePhoto`, `pruneDevicePhotos`, real `devicePhotoExists`) had zero automated coverage | P1 | New `tests/zcode-device-visual-photos.test.mjs` (10 tests) with an in-memory filesystem; real policy code exercised throughout. |
| No test that a valid persisted vector config renders with its stored config | P1 | Added to `zcode-device-visual-defaults.test.mjs` (air-fryer config asserted byte-deep through the render). |
| Artwork-signature ignored `stopColor`/`stopOpacity`/text content | P2 | Signature extended; the pairwise-distinctness test is now palette- and text-aware. |
| Hostile-config test was weaker than its name | P2 | Now feeds seven hostile-shaped configs through the renderer and asserts each renders exactly the safe `unknown` fallback tree. |
| Bundled branch exercised only with `image:'lamp'` | P2 | Now asserted for all six bundled ids. |
| Doc: hostile-config claim outran its test | P2 | Claim rewritten to describe the actual two-part coverage (rejection in `illustrations.test.mjs`, fallback-equality here). |
| pc-fan head drifted 3 px from the approved geometry via shared `headY` | P3 | Fixed: hardware fans pin `headY=119`, restoring the approved pc-fan geometry byte-for-byte. |
| Doc: "pc-fan/led art unchanged" imprecise (CH2 vector fallback intentionally changed) | P3 | Reworded to name the byte-identical primitives and the intentional led-strip change. |
| Doc: node-count bound 15 measured 17 | P3 | Corrected to the measured bound with the largest form named. |
| Harness: silent crash if a new hook appears; rewind assumes a single `useState`; dead `deviceVisualPath` parameter | P3 | Hook-guard throws added with explanatory message; one-hook assumption documented in the harness comment; dead parameter removed. |
| Pre-existing dead conditional `smallDisplay(f === 2 ? 136 : 136, …)` | P3 | Left as-is (pre-existing code outside this mission's defect list; not worth diff noise). |
| Reviewer-noted untestable-without-device gaps (app-restart JSON round-trip through model validation, channel rename) | P3 | Documented here as remaining manual QA items; rename feeds only `accessibilityLabel` (low risk). |

## Remaining limitations / honest statements

- **No Android visual acceptance.** No emulator or device was used; all visual claims above are browser-preview or static-PNG evidence. Native pixel-ratio, 320 dp, rotation, font-scale and TalkBack behaviour of the changed illustrations remain unverified. Unautomated manual-QA items: app-restart round-trip of persisted appearance JSON through model validation, channel-rename rendering, real-picker permission-denied on device.
- No Figma pixel-parity claim: Figma was used for metadata/structure only.
- Perf claims are web-labeled; native measurements N/A.
- `npm audit` was not re-baselined in this run; the four known advisories documented by the wave-1 integrator remain (no dependency changes here).
- `lamp.png` (cutout) is currently unreferenced by `imageMap` (only `lamp-scene` is used); it is not bundled by Metro (never `require`d) — kept for future chooser use, not removed.
- Commit authorship: all commits are authored in this worktree as "ZCode Device Visuals Agent"; no history rewrites, no force push, PR opened as Draft against `integration/unified-v7-20261027` (not main). **PR: https://github.com/t1ktakdev/SpecWatt/pull/7** (head `f476471cfb89bc561e4965c9a7626f8572fce6f6` at opening; the two follow-up commits below complete the record).
