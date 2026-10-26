import { test } from "node:test";
import assert from "node:assert/strict";
import * as model from "../src/specwatt/model.ts";

test("domain exports deterministic isolated demo model", () => {
  assert.equal(typeof model.demoState, "function");
  const s = model.demoState();
  assert.equal(model.totalPower(s.channels), 4.2);
  assert.equal(s.channels[2].protected, true);
  assert.equal(
    s.channels.some((c) => c.assigned?.allowAuto),
    false,
  );
});

test("CH3 protection cannot be removed through assignment, switch or persistence", () => {
  let s = model.demoState();
  s = model.reduceState(
    s,
    {
      type: "assign",
      id: "CH3",
      assignment: { ...s.channels[2].assigned, allowAuto: true },
    },
    1000,
  );
  s = model.reduceState(s, { type: "toggle", id: "CH3" }, 1000);
  assert.equal(s.channels[2].watts, 2.4);
  assert.equal(s.channels[2].assigned?.allowAuto, false);
  const raw = JSON.parse(JSON.stringify(s));
  raw.channels[2].protected = false;
  raw.channels[2].assigned.allowAuto = true;
  const restored = model.restoreState(raw);
  assert.equal(restored.channels[2].protected, true);
  assert.equal(restored.channels[2].assigned?.allowAuto, false);
});

test("manual demo switching updates aggregate and records hold, stale data blocks it", () => {
  const initial = model.demoState();
  initial.peak = 8.4;
  let s = model.reduceState(initial, { type: "toggle", id: "CH2" }, 1000);
  assert.equal(model.totalPower(s.channels), 8.4);
  assert.equal(s.channels[1].manualUntil, 1801000);
  s.channels[1].freshness = "stale";
  s = model.reduceState(s, { type: "toggle", id: "CH2" }, 2000);
  assert.equal(s.channels[1].watts, 4.2);
  assert.equal(model.totalPower(s.channels), null);
});

test("manual start above configured peak is rejected without changing measurement or hold", () => {
  const s = model.demoState();
  const blocked = model.reduceState(s, { type: "toggle", id: "CH2" }, 1000);
  assert.equal(model.totalPower(blocked.channels), 4.2);
  assert.equal(blocked.channels[1].watts, 0);
  assert.equal(blocked.channels[1].manualUntil, 0);
  assert.equal(blocked.events[0].code, "peak-exceeded");
  assert.equal(blocked.events[0].kind, "error");
  assert.deepEqual(blocked.events[0].details, { projected: 8.4, limit: 7 });
  assert.equal(model.restoreState(blocked).events[0].code, "peak-exceeded");
});

test("manual off remains available above peak and exact-limit start is allowed", () => {
  let s = model.demoState();
  s.peak = 8.4;
  s = model.reduceState(s, { type: "toggle", id: "CH2" }, 1000);
  assert.equal(model.totalPower(s.channels), 8.4);
  s = model.reduceState(s, { type: "peak", value: 3 }, 1100);
  s = model.reduceState(s, { type: "toggle", id: "CH2" }, 1200);
  assert.equal(s.channels[1].watts, 0);
  assert.equal(s.events[0].code, "manual-off");
  s = model.reduceState(s, { type: "toggle", id: "CH1" }, 1300);
  assert.equal(model.totalPower(s.channels), 2.4);
});

test("manual start fails closed when another channel measurement is stale", () => {
  const s = model.demoState();
  s.channels[0].freshness = "stale";
  const blocked = model.reduceState(s, { type: "toggle", id: "CH2" }, 1000);
  assert.equal(blocked.channels[1].watts, 0);
  assert.equal(blocked.events[0].code, "stale");
});

test("constraint planner shifts the LED to earliest feasible slot without changing protected base", () => {
  let s = model.demoState();
  assert.equal(model.getPlan(s, 1000).canApply, false);
  s = model.reduceState(
    s,
    {
      type: "assign",
      id: "CH2",
      assignment: { ...s.channels[1].assigned, allowAuto: true },
    },
    1000,
  );
  s = model.reduceState(s, { type: "autopilot", value: true }, 1000);
  const p = model.getPlan(s, 1000);
  assert.equal(p.canApply, true);
  assert.equal(p.beforePeak, 8.4);
  assert.equal(p.afterPeak, 6.6);
  assert.equal(p.from, "14:00");
  assert.equal(p.to, "14:30");
  assert.deepEqual(p.labels, ["14:00", "14:30", "15:00", "15:30"]);
  assert.deepEqual(p.before, [8.4, 6.6, 2.4, 2.4]);
  assert.deepEqual(p.after, [4.2, 6.6, 6.6, 2.4]);
  const applied = model.reduceState(s, { type: "apply-plan" }, 1000);
  assert.equal(
    applied.schedules.find((x) => x.channelId === "CH2")?.start,
    "14:30",
  );
  assert.equal(applied.channels[2].watts, 2.4);
  assert.equal(
    applied.channels[1].watts,
    0,
    "a future schedule is not a current relay confirmation",
  );
  assert.equal(applied.planStatus, "applied");
  const retained = model.getPlan(applied, 2000);
  assert.equal(retained.reason, "applied");
  assert.equal(retained.from, "14:00");
  assert.equal(retained.to, "14:30");
  assert.equal(retained.beforePeak, 8.4);
  assert.deepEqual(retained.before, p.before);
  assert.deepEqual(
    model.getPlan(
      model.restoreState(JSON.parse(JSON.stringify(applied))),
      2000,
    ),
    retained,
  );
});

test("corrupted protected-fan zero telemetry does not manufacture a recovery measurement", () => {
  const raw = model.demoState();
  raw.channels[2].watts = 0;
  const recovered = model.restoreState(raw);
  assert.equal(recovered.source, "none");
  assert.deepEqual(recovered.channels, []);
});

test("planner refuses an already running LED and honors minute precise lamp ending", () => {
  let s = model.demoState();
  s.autopilot = true;
  s.channels[1].assigned.allowAuto = true;
  s.peak = 8.4;
  s = model.reduceState(s, { type: "toggle", id: "CH2" }, 1000);
  assert.equal(model.getPlan(s, 1801001).reason, "already-running");
  s.channels[1].watts = 0;
  s.channels[1].manualUntil = 0;
  s.peak = 7;
  s = model.reduceState(
    s,
    { type: "schedule", id: "CH1", start: "14:00", duration: 37 },
    1000,
  );
  assert.equal(model.getPlan(s, 1000).reason, "no-window");
  s.schedules.find((x) => x.channelId === "CH2").latest = "15:37";
  const plan = model.getPlan(s, 1000);
  assert.equal(plan.to, "14:37");
  assert.equal(plan.afterPeak, 6.6);
});

test("Kyrgyz demo fixture has localized device names and rooms", () => {
  const s = model.demoState("ky");
  assert.equal(s.channels[0].assigned.name, "Чырак");
  assert.equal(s.channels[0].assigned.room, "Конок бөлмөсү");
});

test("exit demo clears measurements, consent, schedules and history while preserving language", () => {
  const s = model.demoState("ky");
  const exited = model.reduceState(s, { type: "leave-demo" }, 1000);
  assert.equal(exited.locale, "ky");
  assert.equal(exited.source, "none");
  assert.deepEqual(exited.channels, []);
  assert.deepEqual(exited.events, []);
  assert.deepEqual(exited.schedules, []);
  assert.equal(exited.autopilot, false);
  assert.deepEqual(
    model.reduceState(exited, { type: "toggle", id: "CH1" }, 1000),
    exited,
  );
});

test("restored state is reconstructed and journal entries are bounded and unique", () => {
  let s = model.demoState();
  for (let i = 0; i < 120; i++)
    s = model.reduceState(s, { type: "autopilot", value: i % 2 === 0 }, 1000);
  assert.equal(s.events.length, 100);
  assert.equal(new Set(s.events.map((e) => e.id)).size, 100);
  const restored = model.restoreState(s);
  restored.channels[0].assigned.name = "Changed";
  assert.equal(s.channels[0].assigned.name, "Светильник");
  const duplicate = model.demoState();
  duplicate.channels[1].id = "CH1";
  assert.deepEqual(model.restoreState(duplicate), model.emptyState());
});

test("legacy v1 migrates without enabling automation or losing validated assignments", () => {
  const raw = model.demoState("ky");
  for (const key of [
    "schedules",
    "events",
    "autopilot",
    "peak",
    "manualMinutes",
    "planStatus",
  ])
    delete raw[key];
  const restored = model.restoreState(raw);
  assert.equal(restored.locale, "ky");
  assert.equal(model.totalPower(restored.channels), 4.2);
  assert.equal(restored.autopilot, false);
  assert.equal(restored.schedules.length, 2);
});

test("planner refuses stale, held, infeasible and missing permissions", () => {
  const s = model.demoState();
  s.autopilot = true;
  assert.equal(model.getPlan(s, 1000).reason, "permission");
  s.channels[1].assigned.allowAuto = true;
  s.channels[1].manualUntil = 2000;
  assert.equal(model.getPlan(s, 1000).reason, "manual-priority");
  s.channels[1].manualUntil = 0;
  s.channels[0].freshness = "stale";
  assert.equal(model.getPlan(s, 1000).reason, "stale");
  s.channels[0].freshness = "fresh";
  s.peak = 5;
  assert.equal(model.getPlan(s, 1000).reason, "no-window");
  assert.equal(
    model.reduceState(s, { type: "apply-plan" }, 1000).planStatus,
    "pending",
  );
});

test("restore rejects malformed data and isolates no-controller from demo measurements", () => {
  assert.deepEqual(
    model.restoreState({ source: "demo", channels: "bad" }),
    model.emptyState(),
  );
  const raw = { ...model.demoState(), source: "none" };
  assert.deepEqual(model.restoreState(raw).channels, []);
  assert.deepEqual(model.restoreState(raw).events, []);
  const bad = model.demoState();
  bad.channels[0].watts = -5;
  assert.deepEqual(model.restoreState(bad), model.emptyState());
  assert.equal(
    model.totalPower([{ ...model.demoState().channels[0], watts: NaN }]),
    null,
  );
});

test("schedule input validates time and preserves old schedule on invalid values", () => {
  const s = model.demoState();
  const next = model.reduceState(
    s,
    { type: "schedule", id: "CH2", start: "99:10", duration: -2 },
    1000,
  );
  assert.deepEqual(next.schedules, s.schedules);
  const next2 = model.reduceState(
    s,
    { type: "schedule", id: "CH3", start: "14:30", duration: 20 },
    1000,
  );
  assert.deepEqual(next2.schedules, s.schedules);
});
