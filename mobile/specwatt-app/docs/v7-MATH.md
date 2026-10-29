# v7 power, energy, history and scheduling

`src/specwatt/energy.ts` contains pure, transport-free functions. It does not import React, contact a server, actuate a relay or fabricate measured-mode statistics.

## Units and missing coverage

`PowerSample` stores `at` in Unix milliseconds, `watts` in W, explicit freshness, and provenance `demo | measured | forecast`. `integratePower(samples, options)` returns `observedWh`, `kWh`, `coveredMs`, `missingMs`, `complete`, `peakW` and `averageW`. A power value is not an energy value: `W × milliseconds / 3,600,000 = Wh`; `Wh / 1000 = kWh`.

The default `step` method treats a confirmed reading as a held state until the next reading. Optional `trapezoid` linearly interpolates sampled meter power. Neither is universally a perfect reconstruction; the caller must select the method appropriate to its measurement protocol. Clipping an interval accounts for its actual boundary values and elapsed duration.

Only intervals bracketed by fresh, valid samples and shorter than `maxGapMs` are integrated. Default maximum gap is five minutes. Stale/missing readings, long gaps and time outside the available samples remain uncovered; they do not become zero consumption. `observedWh` is the subtotal from covered intervals and must be labelled partial whenever `complete` is false. Peak is the maximum valid reading or interpolated boundary in the requested range, even when energy coverage is incomplete. A single valid sample can establish an instantaneous peak but cannot establish any accumulated energy. Mixed provenance, duplicate/out-of-order timestamps, negative/nonfinite/overflow power, and invalid ranges are rejected.

## Explicit offline demo history

`createDemoHistory(channels, endAt?)` returns `{source:'demo', samples, byChannel, summary, durationHours:12}`. It models 25 half-hour endpoints over twelve hours. Every aggregate point equals the sum of its three channel points. CH3 contributes the protected 2.4 W baseline. Historic lamp/LED intervals are deterministic and do not overlap; the terminal point reflects the current local channel readings, including unavailable data. A switch occurring at that terminal instant has zero elapsed duration and does not retroactively alter accumulated energy.

The default fixed endpoint corresponds to 14:00 Bishkek on 26 October 2026; these are sample scenario timestamps, not the user's current measured day. UI must label this as a twelve-hour demonstration history. Call this function only for the offline demo; actual measurement mode must pass real samples into `integratePower`. Half-hour demo summaries use a one-hour allowed gap. For channel detail, use `byChannel[id]` and the same gap setting. No unsupported tariff, cost, kWh savings or physical readings are inferred.

## Existing demonstration forecast

The existing `getPlan` API and state schema are retained. `LoadPlan` adds optional `source:'forecast-demo'`, `windowMinutes`, `beforeEnergyWh`, and `afterEnergyWh`. The original scenario shifts CH2 from 14:00 to 14:30, reducing forecast peak from 8.4 W to 6.6 W while preserving **8.7 Wh** over the common ninety-minute window. The calculation includes the fan baseline throughout that window and every task's complete duration. Applied plans retain these values alongside the original before/after graph; validation accepts old v6 snapshots without the optional metadata and rejects invalid new metadata. No timer executes these saved tasks.

## General bounded feasibility engine

`scheduleLoads(tasks, options)` supports at most eight explicit same-day minute-grid jobs. Each job declares channel, W, duration, earliest start/latest end, preferred start, priority, mobility, automation consent, protection and optional active manual hold. Exact `CH3` is always immovable even if an incoming flag attempts to remove protection. Protected, unpermitted, immovable or manually held jobs keep their preferred time. Tasks on one physical channel cannot overlap, even if the total W limit permits them.

The engine tries higher-priority preferred placements first and searches permitted alternatives with bounded backtracking. It reports `feasible`, `infeasible` or `search-limit`; exhausting the search cap is never described as proof of impossibility. Failure returns no partial executable plan. Successful output includes placements, before/after peak, unchanged task energy over the common horizon and an explanation code. The default horizon is 1440 minutes; choose a smaller explicit common horizon when comparing a shorter scenario. Default search budget is 50,000 candidate placements. This is a small deterministic MVP feasibility solver, not an unbounded optimizer or a background scheduler.

The six-screen UI still exposes the existing three-channel educational scenario. The generalized engine is independently tested and ready for a future multi-task editor; do not claim that such an editor, server scheduling or real hardware execution has been delivered merely because this function exists.

## Tests

Run `node --experimental-strip-types --test tests/energy.test.mjs tests/model.test.mjs` from the mobile project. Tests cover units, clipping, additivity, stale/gaps/no extrapolation, sample validation, provenance, exact demo sums and terminal readings, priority, half-open boundaries, same-channel conflict, CH3 protection, explicit infeasibility/search exhaustion, manual holds, conservation and applied-state migration.
