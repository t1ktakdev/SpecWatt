# SpecWATT · React Native / Expo integration foundation

This folder contains **platform-agnostic TypeScript**, NOT an installed Expo application and NOT an Android APK.

## Source-of-truth
- Figma design: https://www.figma.com/design/ge735l7Qim9ySVcG3BoeCx
- Approved warm graphite examples: Page 1, six original screens. Never substitute blank generic cards.
- Stateful preview: `outputs/SpecWATT-Stage3/index.html`
- Existing reducer for browser demonstration: `work/stage3/state.js`.
- This starter: `core.ts` (data/state/command semantics), `tokens.ts` (native style variables), `core.test.mjs`.

## Mobile implementation order
1. Initialize Expo+React Native+TypeScript using the team's pinned, supported Expo SDK; exact SDK has not yet been chosen in this repo.
2. Add bundled Manrope font and existing PNG images from `outputs/SpecWATT-Stage3/assets`, respecting their licenses.
3. Build real native components that match Figma: Power Hero, Day Chart, Device Tile, Protected Channel, Bottom Navigation, timeline and modal confirmations.
4. Implement Android persistence keyed by `source=demo|live`; preserve null measurements and separate auto consent for environments.
5. Agree typed Brain FastAPI transport contract with backend developer before implementing real controller pairing, auth, schedules and ACK.
6. Integrate the ESP32 only with 5V classroom loads after verified ACK/reconciliation and safety tests. No 220V hardware path.

## Invariants
- Not seeing telemetry is **not** zero watts. Freshness, meter capability and connection determine if a total can be displayed.
- Requested/sent command does not change confirmed state; only acknowledged execution does. Timeout requires reconciliation rather than blind retry.
- CH3 protected cannot be toggled or enrolled for automation.
- Demo 8.4 -> 6.6 W is reduction of a **scenario peak**, not measured energy savings.
- Browser 'demo login', export and photo selection are local only.
- `core.ts` is a smallest-integration sample, not a replacement for full browser state engine. No real backend, Bluetooth or operating system notification support.

## Verify
From this directory on Node.js 24:
`node --test core.test.mjs`
From Stage3 source:
`node --test work/stage3/state.test.js`

**Not verified:** React Native rendering, Metro bundler, build for Android, background execution, production network paths.
