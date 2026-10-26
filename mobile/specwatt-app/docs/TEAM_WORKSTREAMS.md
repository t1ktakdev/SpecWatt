# SpecWATT — 4 frontend developers

Single Expo SDK 58 + React Native + TypeScript project. All code goes through PRs. Do not change the six approved Warm Graphite originals.

| Frontend | Primary ownership | Files |
|---|---|---|
| FE1 | Welcome, RU/KY, auth offline, accessibility | src/app/index.tsx |
| FE2 | Controller discovery, CH1-CH3 state, simulation/error paths | src/app/setup.tsx (pairing section) |
| FE3 | Device assignment, six stock photos, room and permissions | src/app/setup.tsx (assignment section) |
| FE4 | Home, device cards, theme, reusable UI, navigation | src/app/home.tsx; src/specwatt/ui.tsx; theme.ts |

FE2 and FE3 must coordinate on setup.tsx: split into feature modules before editing in parallel. Shared changes to store.tsx and theme.ts require cross-review. Screenshots and tests with every PR. Do not claim Expo preview is APK.

Rules: data provenance demo != live; meter absent != 0 W; CH3 protected even if UI is bypassed; ACK required before command success; no fake login; password never persisted; category image does not imply controlling that appliance. Limit current hardware to 5V educational channels.

Verification: npm ci; npx tsc --noEmit; npx expo export --platform android --output-dir dist-android. Test on actual Android before a release. Require RU/KY coverage and TalkBack, minimum 12sp secondary text.
