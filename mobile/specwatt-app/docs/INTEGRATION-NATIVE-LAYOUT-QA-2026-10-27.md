# Native layout repair evidence — 2026-10-27

## Scope and source of truth

Compared the six approved `design/references-v7/{home,devices,led,autopilot,plan,journal}.png` images with the previous real Android captures in `outputs/v7-device-screenshots-2026-10-26/`. Used existing source and an isolated local **React Native Web browser preview** for repair verification. No phone, USB, ADB, scrcpy, installation, or physical-device capture was used.

These repairs restore existing Warm Graphite geometry and behavior. They do **not** establish Android visual acceptance. Browser rendering does not prove native Yoga/SVG painting, accessibility behavior, gesture performance, or smoothness.

## Root causes and repairs

1. **All motion pressables lost native styles.** `MotionPressable` passed a function as the `style` of `Animated.createAnimatedComponent(Pressable)`. Installed Reanimated 4.7.1 `PropsFilter.filterNonAnimatedProps` normalizes the function into an array. Native Pressable receives an array, never calls that function, and loses dimensions, absolute positioning, flex, and background colors. This explains the correlated giant device scene, hidden card text, bare filter chips, missing CTA styling, and clustered bottom labels in the old Android captures. The wrapper now tracks press/hover state and passes a concrete style array, retaining forwarding of events, accessibility props, and animations.
2. **Ten SVG gradient offsets used leading-dot strings.** Changed `.NN` to `0.NN` without changing colors, shapes, or catalog configuration.
3. **Web scene backgrounds obscured SVG art.** Browser DOM inspection showed valid SVG geometry and complete artwork, but its positioned gradient sibling painted above the static SVG. Making the SVG positioned restores sibling painting order. The web-only unsupported `accessible=true` DOM attribute was removed while retaining the native accessibility prop and labels.
4. **Onboarding had a fixed 800-point minimum and oversized content.** Removed the minimum, constrained the column to the existing 440-point screen maximum, sized the hero photo to available window height within 130–220 points, and combined the two headline lines into one block. At the measured 394×852 browser viewport, Continue occupies y=538–592 and login y=604–658, both 54 points high.
5. **Navigation needed bounded labels after flex was restored.** Each tab retains equal flex width, permits shrinking with `minWidth: 0`, and bounds its label to one line. Native text can fit down to 80% scale. At 320×700, browser labels can ellipsize, while accessible names remain complete; no tab labels overlap.
6. **Four plan chart groups were wider than the card.** The chart previously rendered at least 350 points inside a measured 314-point viewport. Four groups now scale to the actual layout width; longer series retain horizontal scrolling. Browser verification measured both chart and parent at 314 points and confirmed the fourth group is visible.
7. **Default device appearances discarded existing photos.** `DeviceVisual` previously selected vectors whenever no custom appearance was set, ignoring the existing `assigned.image`. It now uses only known bundled imageMap assets for that default, retains explicit vectors and custom owned photos, and falls back to vectors for missing custom photos or unknown identifiers. No new artwork or external image source was introduced.
8. **The home chart and gauge drifted from the reference composition.** Restored the history card to approximately 138 points. Its energy/peak summary remains in the chart accessibility description and can be expanded with its header info button; browser interaction confirmed the exact 52.2 Wh / 6.6 W summary appears. Replaced rectangular painted gauge notches with separated round-cap orange arc segments, retaining normalized power. Reduced home content gaps to 9 points. At **440×952**, the entire fan and autopilot rows are above the navigation: autopilot y=790.99–861.59, navigation begins y=866.40. At nominal 393×852, a normal scroll is still required; a captured scroll verifies both lower rows are reachable.

## Verification

- Added `tests/native-layout.test.mjs`. All three cases failed on their respective original code, then passed after the fixes.
- The pressable regression transpiles and executes the **actual component** with minimal platform/hook mocks. It asserts concrete absolute geometry and press/release style resolution. It is not a source-regex-only test. It does not replace a native runtime test.
- The SVG offset regression checks every explicit gradient offset in the illustration source.
- The photo regression executes the actual DeviceVisual component and verifies bundled-photo priority, explicit vector preservation, valid custom-photo selection, and missing/unsafe-photo fallback.
- `npm test`: 76/76 passed after these repairs, including concurrently added integration tests from the parent task (initial layout-only stage was 57/57).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Local browser preview bundled successfully on explicit port 8097. It was stopped after QA.

## Saved browser evidence

In the integration worktree: `outputs/integration-web-qa-2026-10-27/`.

- `00-welcome-393x852-web.png`
- `01-home-393x852-web.png`
- `02-devices-393x852-web.png`
- `03-led-393x852-web.png`
- `04-autopilot-393x852-web.png`
- `05-plan-393x852-web.png`
- `06-journal-393x852-web.png`
- `07-no-controller-320x700-web.png`
- `layout-metrics.json`, `small-layout-metrics.json`

The following **final** captures supersede the intermediate 01–06 vector/large-chart captures:

- `08-home-440x952-web.png`
- `09-devices-440x952-web.png`
- `10-led-440x952-web.png`
- `11-autopilot-440x952-web.png`
- `12-plan-440x952-web.png`
- `13-journal-440x952-web.png`
- `14-home-final-393x852-web.png`
- `15-home-scrolled-final-393x852-web.png`
- `final-home-440-metrics.json`

Capture correction: the first saved 08 image still contained the transient splash overlay despite a nearby inline preview appearing settled. It was replaced after observing splash completion, saving one captured byte buffer and displaying that same buffer, then reopening the saved PNG with `view_image`. A uniquely named identical copy is **`08b-home-settled-440x952-web.png`** (SHA-256 `A728ABA2159128F76EE71580D820AAAAC1815298C60230788E76069A4F0D19F7`). Use this copy to avoid stale image previews. The replacement 08/08b and saved 09–13 were visually inspected and contain no splash overlay. This correction changes evidence only, not source behavior.

The nominal 393-point override produced a measured browser width of 394 due to browser device scaling; metrics record the actual dimensions. The compact preview measured exactly 320×700. Browser screenshots are explicitly named `web`, not Android captures. Browser viewport overrides were reset and temporary preview tabs closed. Only QA-created demo data was cleared through the app UI.

## Keep / improve / discard

- **KEEP:** existing Warm Graphite tokens, bundled device photos, screen composition, native safe areas, validated optional offline vector catalog, bounded photo policy, reduced-motion support, domain safety restrictions, and honest demo labels. The six-reference hierarchy is recognizable after the shared style defect is removed.
- **IMPROVE (implemented):** the shared style boundary, SVG number syntax/layering, responsive onboarding, bounded navigation labels, chart sizing/density, default appearance priority, and rounded gauge segments.
- **DISCARD:** the assumption that successful static tests or an export establish native visual acceptance. Do not recreate old giant cards or retain the function-style boundary.

## Remaining limitations

- Android visual acceptance and native animation performance remain unverified until a separately authorized native test is available.
- Small screens correctly scroll content; all cards and the plan CTA are not simultaneously visible above the bottom navigation. Native tap areas and scroll reachability still need device validation.
- Existing bundled lamp and LED assets differ from the exact photographed scenes in the six approved reference PNGs. These repairs restore the existing photos rather than replacing them with vectors, but do not claim pixel parity with those scenes. Explicit vector choices remain available in the catalog.
- Fresh demo state starts autopilot off with no channel permissions; reference screenshots show a configured/on state and a populated journal. QA did not fabricate history or permissions just to imitate those states.
