# ZCode Wave 2 — Mission B: Professional Device Visual System (handoff), 2026-10-28

Agent: ZCode GLM-5.3-Flash (Vision), effort max. Branch `zcode/max-device-visuals`.
Base: `eff2f4d9ff1dd62ad28a8dd38efb38d1754cffd2` (origin/integration/unified-v7-20261027, verified with `git ls-remote` before any edit; unchanged during the run).
Worktree: `C:\Users\user\Documents\ChatGPT\SpecWATT-agent-worktrees\zcode-max-device-visuals` (created from the source repo `C:\Users\user\Documents\ChatGPT\SpecWATT` with `git worktree add -b zcode/max-device-visuals <path> eff2f4d9…`; clean, no foreign changes, no reset/clean/force used).

## What was implemented

1. **22 illustration families now render a distinct artwork per catalogue form.** Before the fix, 32 pairs (and one quadruple) of categories rendered pixel-identical vectors because most `DeviceIllustration` branches keyed on `family` and ignored `form`. Every distinction is new inline SVG in the existing Warm Graphite palette (body/edge/metal/glass/warm gradients, existing accent strokes) inside the fixed `viewBox="0 0 320 240"`; no categories, palette, catalog screen, or bundled photos were changed. The approved defaults are untouched: `mushroom-lamp` (CH1 vector fallback), `led` art, `pc-fan` art, and all seven bundled PNGs stay exactly as approved.
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
   - `tests/zcode-device-visual-forms.test.mjs` — transpiles the real `DeviceIllustration.tsx` + real `catalog.ts` (typescript compiler + `node:vm`, the same harness pattern as the pre-existing `native-layout.test.mjs`) and asserts: every one of the 119 categories renders inside `viewBox="0 0 320 240"`; hostile config values never leak into the tree; every gradient stop is a valid numeric/percentage offset in non-decreasing order per gradient; **all categories of one family render pairwise-distinct artwork trees** (this is the test that failed with 32 duplicate pairs before the fix); the ultrawide screen is >24 px wider than the standard monitor.
   - `tests/zcode-device-visual-defaults.test.mjs` — loads the real `device-visual.tsx` with the real `appearance-policy`/`photo-policy`/catalog (only expo-filesystem and the asset registry mocked) and asserts the full §9 scenario chain: bundled photo by default; photo renders only while the owned file exists; vanished photo → default vector; `onError` → vector on next render; appearance persisted against a category that no longer exists → bundled photo remains; `https:`/traversal photo URIs rejected by the real policy → bundled photo; unmapped/hostile `image` ids → vector, never a broken `<Image>`; scene mode paints the Warm Graphite backdrop.
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
| `npm test` (after fixes) | **125 pass / 0 fail, exit 0** (114 pre-existing + 11 new; no existing test modified) |
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
- New art adds ≤ 15 nodes per changed form; the heaviest family (`led` coil, ~150 nodes) is unchanged in shape count.
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
2. **`src/app/setup.tsx` — photo import error message.** `choosePhoto()` catches every `PhotoError` code (busy/too-large/unsupported/…) into the single generic `errPhoto` string. The error codes exist in `photo-policy.ts`; mapping `e.code` to distinct dictionary keys would make "file too large" vs "permission denied" distinguishable. Proposed but not applied (dictionary files are outside this mission's file list).
3. **`src/app/index.tsx`** — onboarding hero photo sizing (known visual-QA issue) needs its owner's review; the bundled asset is fine.

## Remaining limitations / honest statements

- **No Android visual acceptance.** No emulator or device was used; all visual claims above are browser-preview or static-PNG evidence. Native pixel-ratio, 320 dp, rotation, font-scale and TalkBack behaviour of the changed illustrations remain unverified.
- No Figma pixel-parity claim: Figma was used for metadata/structure only.
- Perf claims are web-labeled; native measurements N/A.
- `npm audit` was not re-baselined in this run; the four known advisories documented by the wave-1 integrator remain (no dependency changes here).
- `lamp.png` (cutout) is currently unreferenced by `imageMap` (only `lamp-scene` is used); it is not bundled by Metro (never `require`d) — kept for future chooser use, not removed.
- Commit authorship: all commits are authored in this worktree as the ZCode device-visuals agent; no history rewrites, no force push, PR opened as Draft against `integration/unified-v7-20261027` (not main).
