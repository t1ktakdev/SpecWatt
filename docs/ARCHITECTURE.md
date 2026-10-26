# Software architecture and data

## Mobile

Expo Router routes under `mobile/specwatt-app/src/app` delegate six compositions to `src/screens`. Existing onboarding/setup remain in place. Shared mobile components, semantic colors, imagery, chart renderers and navigation live under `src/specwatt`.

`model.ts` is a pure local domain reducer. It cannot access any network or equipment transport. It defines locale, source, channel assignments, measured demo watts/freshness, manual hold, consent, peak, explicit same-day demo schedules and capped structured events. Immutable CH3 protection is enforced for assignment, switching, scheduling and restored state. `store.tsx` validates persisted unknown data and migrates the prior v1 schema, serializes AsyncStorage writes and exposes storage errors. Settings contain no password or bearer token.

`getPlan` searches allowed start minutes for the LED job, sums nominal scheduled job loads with the protected baseline, and proposes an earliest feasible lower peak. It gates apply on fresh values, auto enabled, consent, no manual hold, LED not already running and feasible window. Applying stores a future schedule shift and original comparison; no background job executes. Demo values are examples, not real energy measurements. Demo journal events are created by actual app actions and marked demo.

`api.ts` is a separate explicitly server-simulator client, not a real-controller mode in the offline store. It validates snapshots and totals, uses timeouts without automatic actuation retries, enforces protected CH3 and stores native tokens in SecureStore. Web tokens are memory only. `server.tsx` provides genuine local server account/session and command lifecycle testing; it does not claim email recovery, real discovery or physical delivery.

## Brain

FastAPI app factory and SQLite schema are documented in `backend/README.md`. Users own controllers; sessions are opaque and revocable, passwords scrypt-hashed. Controllers, channel assignments, command transitions, events and measurement history are persisted. Migrations use schema user_version1; PostgreSQL migration is future work. Every request/dispatch rechecks safety; SQLite independently protects CH3. Simulator step is an explicit test transport and labels its acknowledgement as such. A later authoritative simulator sample can reconcile uncertainty without proving delivery.

## Grid

No protocol or GPIO mapping has been validated. `firmware/README.md` lists the confirmed-hardware gate and acceptance requirements. Do not equate simulator/API tests with an ESP32 integration.

## Ownership for development

Frontend developers can own dashboard/device screens, automation/journal screens, onboarding/settings/localization, and API/storage respectively. Shared reducer types and tokens require coordinated review. Backend owns server contract/storage/command validation. Route wrappers should remain thin; do not duplicate source state or send physical commands from UI handlers. Current repository retains historical core separately; it is not imported by the new model and its migration/unification is future cleanup.
