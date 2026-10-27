import { test } from "node:test";
import assert from "node:assert/strict";
import * as energy from "../src/specwatt/energy.ts";
import { demoState } from "../src/specwatt/model.ts";

const sample = (at, watts, freshness = "fresh", source = "measured") => ({
  at,
  watts,
  freshness,
  source,
});
const hour = 3600000;
test("held readings integrate watts by actual elapsed time into Wh and kWh", () => {
  const result = energy.integratePower(
    [sample(0, 1000), sample(hour, 500), sample(3 * hour, 0)],
    { maxGapMs: 3 * hour },
  );
  assert.equal(result.observedWh, 2000);
  assert.equal(result.kWh, 2);
  assert.equal(result.coveredMs, 3 * hour);
  assert.equal(result.complete, true);
  assert.equal(result.peakW, 1000);
  assert.equal(result.averageW, 2000 / 3);
});
test("trapezoid interpolation and clipped intervals use actual endpoints", () => {
  const result = energy.integratePower([sample(0, 0), sample(hour, 1000)], {
    method: "trapezoid",
    from: hour / 4,
    to: (hour * 3) / 4,
    maxGapMs: hour,
  });
  assert.equal(result.observedWh, 250);
  assert.equal(result.coveredMs, hour / 2);
  assert.equal(result.peakW, 750);
});
test("stale, missing, long gaps and extrapolation are explicitly uncovered", () => {
  const readings = [
    sample(0, 100),
    sample(1000, 100, "stale"),
    sample(2000, null, "missing"),
    sample(3000, 100),
    sample(10000, 100),
  ];
  const result = energy.integratePower(readings, {
    from: 0,
    to: 12000,
    maxGapMs: 2000,
  });
  assert.equal(result.observedWh, 0);
  assert.equal(result.coveredMs, 0);
  assert.equal(result.missingMs, 12000);
  assert.equal(result.complete, false);
  assert.equal(result.averageW, null);
});
test("zero power is valid while absent readings never become zero energy claims", () => {
  const zero = energy.integratePower([sample(0, 0), sample(1000, 0)]);
  assert.equal(zero.observedWh, 0);
  assert.equal(zero.complete, true);
  assert.equal(zero.peakW, 0);
  const empty = energy.integratePower([], { from: 0, to: 1000 });
  assert.equal(empty.complete, false);
  assert.equal(empty.missingMs, 1000);
  assert.equal(empty.peakW, null);
});
test("invalid timestamps, values, ordering and mixed provenance fail closed", () => {
  for (const data of [
    [sample(0, -1), sample(1, 0)],
    [sample(NaN, 1)],
    [sample(1, 1), sample(1, 1)],
    [sample(2, 1), sample(1, 1)],
    [sample(0, 1), sample(1, 1, "fresh", "demo")],
  ])
    assert.throws(() => energy.integratePower(data));
  assert.throws(() =>
    energy.integratePower([sample(0, 1)], { from: 10, to: 1 }),
  );
  assert.throws(() => energy.integratePower([sample(0, 1)], { maxGapMs: 0 }));
});
test("deterministic demo history has exact channel totals, current endpoint and consistent energy", () => {
  const s = demoState(),
    endAt = 12 * hour;
  const history = energy.createDemoHistory(s.channels, endAt);
  assert.equal(history.source, "demo");
  assert.equal(history.samples.length, 25);
  assert.equal(history.samples.at(-1).watts, 4.2);
  history.samples.forEach((reading, i) => {
    assert.equal(
      reading.watts,
      Math.round(
        Object.values(history.byChannel).reduce(
          (sum, values) => sum + values[i].watts,
          0,
        ) * 10,
      ) / 10,
    );
    assert.equal(reading.source, "demo");
  });
  assert.deepEqual(history, energy.createDemoHistory(s.channels, endAt));
  assert.equal(
    history.summary.observedWh,
    Object.values(history.byChannel).reduce(
      (sum, values) =>
        sum + energy.integratePower(values, { maxGapMs: hour }).observedWh,
      0,
    ),
  );
  s.channels[0].freshness = "stale";
  assert.equal(
    energy.createDemoHistory(s.channels, endAt).samples.at(-1).watts,
    null,
  );
});
const job = (
  id,
  channelId,
  watts,
  preferredStartMinute,
  durationMinutes,
  latestEndMinute,
  extra = {},
) => ({
  id,
  channelId,
  watts,
  preferredStartMinute,
  durationMinutes,
  earliestMinute: preferredStartMinute,
  latestEndMinute,
  priority: 50,
  movable: true,
  allowAuto: true,
  protected: false,
  ...extra,
});
test("capacity scheduler shifts lower-priority work, retains protected load and conserves Wh", () => {
  const result = energy.scheduleLoads(
    [
      job("lamp", "CH1", 1.8, 840, 30, 870, { movable: false, priority: 100 }),
      job("led", "CH2", 4.2, 840, 60, 930),
    ],
    { limitWatts: 7, baseWatts: 2.4 },
  );
  assert.equal(result.status, "feasible");
  assert.deepEqual(result.starts, { lamp: 840, led: 870 });
  assert.equal(result.beforePeakW, 8.4);
  assert.equal(result.afterPeakW, 6.6);
  assert.equal(result.beforeEnergyWh, result.afterEnergyWh);
});
test("fixed permissions, protected jobs and manual intervention cannot be moved", () => {
  for (const extra of [
    { allowAuto: false },
    { protected: true },
    { manualUntilMinute: 900 },
  ]) {
    const result = energy.scheduleLoads(
      [
        job("lamp", "CH1", 1.8, 840, 30, 870, { movable: false }),
        job("led", "CH2", 4.2, 840, 60, 930, extra),
      ],
      { limitWatts: 7, baseWatts: 2.4, nowMinute: 840 },
    );
    assert.equal(result.status, "infeasible");
    assert.deepEqual(result.starts, {});
  }
});
test("same-channel overlaps are rejected even if watt limit would permit them", () => {
  const result = energy.scheduleLoads(
    [
      job("a", "CH1", 1, 0, 60, 60, { movable: false }),
      job("b", "CH1", 1, 30, 60, 90, { movable: false }),
    ],
    { limitWatts: 10, baseWatts: 0 },
  );
  assert.equal(result.status, "infeasible");
  assert.equal(result.reason, "channel-conflict");
});
test("bounded search reports exhaustion, not mathematical impossibility", () => {
  const result = energy.scheduleLoads(
    [job("a", "CH1", 2, 0, 10, 20), job("b", "CH2", 2, 0, 10, 20)],
    { limitWatts: 2, baseWatts: 0, maxSearchNodes: 1 },
  );
  assert.equal(result.status, "search-limit");
  assert.deepEqual(result.starts, {});
});
test("planner rejects invalid task numbers and duplicate identifiers", () => {
  assert.throws(() =>
    energy.scheduleLoads([job("a", "CH1", NaN, 0, 30, 60)], {
      limitWatts: 7,
      baseWatts: 0,
    }),
  );
  assert.throws(() =>
    energy.scheduleLoads(
      [job("a", "CH1", 1, 0, 30, 60), job("a", "CH2", 1, 0, 30, 60)],
      { limitWatts: 7, baseWatts: 0 },
    ),
  );
});
test("integration is additive across adjacent clipped ranges and never invents energy at a single endpoint", () => {
  const samples = [sample(0, 120), sample(1000, 240), sample(4000, 0)];
  const all = energy.integratePower(samples);
  const first = energy.integratePower(samples, { from: 0, to: 2000 });
  const second = energy.integratePower(samples, { from: 2000, to: 4000 });
  assert.ok(
    Math.abs(all.observedWh - first.observedWh - second.observedWh) < 1e-10,
  );
  const single = energy.integratePower([sample(0, 1000)], {
    from: 0,
    to: 1000,
  });
  assert.equal(single.complete, false);
  assert.equal(single.observedWh, 0);
  assert.equal(single.peakW, 1000);
});
test("power overflow values and invalid demo channel identities are rejected", () => {
  assert.throws(() =>
    energy.integratePower(
      [sample(0, Number.MAX_VALUE), sample(hour, Number.MAX_VALUE)],
      { maxGapMs: hour },
    ),
  );
  const s = demoState();
  s.channels[2].id = "X";
  assert.throws(() => energy.createDemoHistory(s.channels, 12 * hour));
});
test("higher priority preferred starts win and half-open task boundaries never double count", () => {
  const result = energy.scheduleLoads(
    [
      job("low", "a", 3, 0, 10, 20, { priority: 1 }),
      job("high", "b", 3, 0, 10, 20, { priority: 100 }),
    ],
    { limitWatts: 3, baseWatts: 0, horizonMinutes: 20 },
  );
  assert.equal(result.status, "feasible");
  assert.equal(result.starts.high, 0);
  assert.equal(result.starts.low, 10);
  assert.equal(result.afterPeakW, 3);
  assert.equal(result.afterEnergyWh, 1);
});
test("empty task sets retain protected baseline and impossible baseline is explicit", () => {
  const empty = energy.scheduleLoads([], {
    limitWatts: 3,
    baseWatts: 2.4,
    horizonMinutes: 60,
  });
  assert.equal(empty.status, "feasible");
  assert.equal(empty.afterEnergyWh, 2.4);
  assert.equal(empty.afterPeakW, 2.4);
  assert.equal(
    energy.scheduleLoads([], { limitWatts: 2, baseWatts: 2.4 }).status,
    "infeasible",
  );
});

test("SpecWATT CH3 cannot be shifted even if caller supplies protected false", () => {
  const result = energy.scheduleLoads(
    [
      job("fan", "CH3", 2.4, 0, 10, 20, { protected: false }),
      job("load", "CH1", 2, 0, 10, 10, { movable: false }),
    ],
    { limitWatts: 3, baseWatts: 0, horizonMinutes: 20 },
  );
  assert.equal(result.status, "infeasible");
});
