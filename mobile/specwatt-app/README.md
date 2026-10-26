# SpecWATT — native Expo client 0.2.0

Expo SDK 58 / React Native 0.88 / Expo Router / TypeScript. Six React Native screens, local demo, constraints/planner/journal and a separate working local FastAPI simulator connection. APK/native execution and ESP32 are not yet verified. See [current delivery status](../../docs/DELIVERY-2026-10-26.md).

Quick start from this directory:

  npm ci
  npm test
  npm run lint
  npx tsc --noEmit
  npx expo start
  npx expo export --platform android --output-dir dist-android

Routes under src/app delegate six screens and settings to src/screens. Existing index/setup provide onboarding and assignment. src/specwatt/model.ts is the pure tested demo model; store.tsx validates/serializes persistence. api.ts and server.tsx connect to a separate authenticated server simulator. Photos are existing resources; Manrope OFL included. Live Figma and Android screenshot parity remain pending.

AsyncStorage saves local settings, demo schedules and events, never passwords. Native server bearer tokens use SecureStore; web sessions use memory only. Demo never accesses the API. Pairing is unavailable; server controllers are explicitly simulators. CH3 protected; no real appliance control. Applying schedules saves a forecast, without wall-clock execution.

Build caveat: npm reports FIVE HIGH security advisories in Expo CLI, node-forge, zod dependency graph. Do not auto-run npm audit fix --force because it suggests incompatible Expo major downgrades. Review patched upstream dependencies before production release.

Figma controller setup: https://www.figma.com/design/ge735l7Qim9ySVcG3BoeCx/SpecWATT?node-id=156-2

Current architecture: [architecture](../../docs/ARCHITECTURE.md). Implemented server contract: [backend](../../backend/README.md). API connection: [integration](docs/API-INTEGRATION.md). Build profiles/instructions: [Android](../../docs/ANDROID-BUILD.md). Historical contract draft is superseded.
