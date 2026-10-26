# SpecWATT Warm Graphite Stage 2 Implementation Plan

> For agentic workers: execute the implementation in this session, using independent localization and route-audit work already dispatched. The user has explicitly authorized execution.

**Goal:** Recreate the approved six screens as editable objects and extend every requested user flow, state and language without changing Warm Graphite.

**Architecture:** One declarative native design model drives local preview, editable SVG exports and a Figma Plugin API builder. Components contain native text, vectors and separate device images. Figma output uses actual master components, variants, instances, variable bindings, Auto Layout and prototype reactions. Original PNGs live only in a references section.

**Tech Stack:** Local JSON design model, Python authoring/export, browser review, vanilla JavaScript prototype, Figma Plugin API. This is a design/prototype deliverable, not the production Expo app or FastAPI server.

**Spec:** C:/Users/user/Downloads/SpecWATT_ЭТАП_2_ПОЛНЫЙ_ДИЗАЙН_FIGMA.txt

## Global Constraints

- Warm Graphite #222321 / #2B2D2A / #33342F, ivory #F4F1EA, peach #FFB681; Manrope.
- 393×852 Android viewports, safe areas, scrolling, 48 dp targets.
- CH1=1.8 W, CH2=0 W, CH3=2.4 W protected; demo total=4.2 W. Pending never appears confirmed.
- Peak planning example 8.4→6.6 W; no energy saving claim or fake hardware evidence.
- RU default, complete KY coverage with specific editorial-review flags.
- Existing PNGs unchanged; no flattened UI substitutes for editable screens.
- Figma connector currently returns unavailable and browser requires login. Continue independent local authoring; do not claim a cloud file until verified.

## Review Focus

- Text reflow and long Kyrgyz labels at 393 dp.
- Lost connection / unknown readings must never become zero power or confirmed commands.
- Protected CH3 must never expose an off action.
- Rule and schedule constraints must produce a conflict/unplannable state rather than false success.
- Language, command, rule and plan transitions must preserve their intended state and route.

## Task 1 — Sources, routes and localization

- [x] Read the full stage 2 brief, previous kit notes/tokens/manifest and official project DOCX text.
- [x] Preserve original source images in work/source.
- [x] Produce a complete route/state graph and RU/KY string catalogue.
- [x] Audit every action target and mandatory flow.

## Task 2 — Foundations and reusable native components

- [x] Define primitives, semantic aliases, text/effect styles, spacing/radius variables.
- [x] Build buttons, icon buttons, fields, chips, switches, navigation, device cards, graph panels, event rows, status panels, dialogs and sheets with state variants.
- [x] Validate editability, token bindings, independent image layers and component properties in the native model.

## Task 3 — Six approved screens

- [x] Recreate Home, Devices, Device detail, Autopilot, Plan and Journal from editable components.
- [x] Compare composition, typography, warmth and device imagery with the preserved PNGs.
- [x] Keep readable content in scrolling frames rather than shrinking body text to fit.

## Task 4 — Complete scenario coverage

- [x] Implement onboarding/account/controller flows, all three channel details, rule editor, scheduling, event details, settings/profile/export/delete.
- [x] Include actual separate loading/empty/offline/error/denied/conflict/pending/success screens and transitions.
- [x] Generate RU and KY versions, verify translation coverage and geometry.

## Task 5 — Prototype, Figma and handoff

- [x] Build working local prototype state transitions and design-property editor as the editable fallback.
- [x] Build native Figma plugin with original reference section, components, screens and prototype links.
- [ ] Run the complete builder and verify native Figma editability. File created, but both browsers fail to load plugin environment; connector unavailable. See handoff/acceptance.md.
- [x] Perform representative browser checks on the 393×852 model and record honest acceptance status. Full manual scenario coverage remains open.
- [x] Deliver motion specification, route map, team/API handoff and outstanding issues.
