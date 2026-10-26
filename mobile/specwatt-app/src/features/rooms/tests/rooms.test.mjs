/**
 * Rooms & Spaces — module tests.
 *
 * Pure logic only: catalog model, power aggregation honesty, room/device
 * resolution, rename/move dispatch plans, and the bridge into the existing
 * device model reducer. Fixtures here are isolated test data; in the real UI
 * demo data is always labelled as demo.
 *
 * Run: node --experimental-strip-types --test src/features/rooms/tests/*.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rooms from "../model.ts";
import * as power from "../power.ts";
import * as i18n from "../i18n.ts";
import * as model from "../../../specwatt/model.ts";

// ---- fixtures -------------------------------------------------------------

const now = 1_700_000_000_000;

function room(overrides = {}) {
  return {
    id: "rm-test-1",
    name: "Гостиная",
    type: "living",
    art: "living",
    createdAt: now,
    ...overrides,
  };
}

function channel(overrides = {}) {
  return {
    id: "CH1",
    protected: false,
    assigned: {
      name: "Светильник",
      category: "lamp",
      image: "lamp",
      room: "Гостиная",
      allowAuto: false,
    },
    watts: 1.8,
    freshness: "fresh",
    ...overrides,
  };
}

// ---- catalog model ---------------------------------------------------------

test("restoreRooms accepts a valid catalog and rejects structural corruption", () => {
  const valid = { version: 1, rooms: [room(), room({ id: "rm-2", name: "Кухня", type: "kitchen", art: "kitchen" })] };
  assert.deepEqual(rooms.restoreRooms(JSON.parse(JSON.stringify(valid))), valid);

  for (const broken of [
    null,
    "x",
    {},
    { version: 2, rooms: [] },
    { version: 1, rooms: "no" },
    { version: 1, rooms: [{ id: "", name: "x", type: "living", art: "living", createdAt: 1 }] },
    { version: 1, rooms: [{ id: "a", name: "", type: "living", art: "living", createdAt: 1 }] },
    { version: 1, rooms: [{ id: "a", name: "x", type: "garage", art: "living", createdAt: 1 }] },
    { version: 1, rooms: [{ id: "a", name: "x", type: "living", art: "garage", createdAt: 1 }] },
    { version: 1, rooms: [{ id: "a", name: "x", type: "living", art: "living", createdAt: "now" }] },
    { version: 1, rooms: [room(), room({ id: "rm-2", name: "гостиная" })] },
  ]) {
    assert.deepEqual(rooms.restoreRooms(broken), rooms.emptyRooms(), `broken: ${JSON.stringify(broken)}`);
  }
});

test("room names: normalization, length cap and uniqueness are enforced", () => {
  assert.equal(rooms.normalizeName("  Гостиная\t downstairs "), "Гостиная downstairs");
  assert.equal(rooms.roomNameError("", []), "required");
  assert.equal(rooms.roomNameError("   ", []), "required");
  assert.equal(rooms.roomNameError("x".repeat(81), []), "too-long");
  assert.equal(rooms.roomNameError("x".repeat(80), []), null);
  assert.equal(rooms.roomNameError("Кухня", [room({ name: "Кухня" })]), "duplicate");
  assert.equal(rooms.roomNameError("кухня", [room({ name: "Кухня" })]), "duplicate");
  assert.equal(rooms.roomNameError("Кухня", [room({ name: "Гостиная" })]), null);
  assert.equal(rooms.roomNameError("Гостиная", [room()], "rm-test-1"), null);
});

test("reduceRooms: add validates, rename keeps identity, remove never touches other rooms", () => {
  let data = rooms.emptyRooms();
  const created = room({ id: "rm-a" });
  data = rooms.reduceRooms(data, { type: "add", room: created });
  assert.deepEqual(data.rooms, [{ ...created, name: "Гостиная" }]);

  // duplicate (case-insensitive) rejected
  const rejected = rooms.reduceRooms(data, { type: "add", room: room({ id: "rm-b", name: "ГОСТИНАЯ" }) });
  assert.equal(rejected.rooms.length, 1);

  // invalid type/art rejected
  assert.equal(rooms.reduceRooms(data, { type: "add", room: room({ id: "rm-b", type: "garage" }) }).rooms.length, 1);
  assert.equal(rooms.reduceRooms(data, { type: "add", room: room({ id: "rm-b", art: "garage" }) }).rooms.length, 1);

  // rename normalizes and keeps id/type/art/createdAt
  data = rooms.reduceRooms(data, { type: "rename", id: "rm-a", name: "  Большая  гостиная  " });
  assert.deepEqual(data.rooms[0], { ...created, name: "Большая гостиная" });

  // rename to a duplicate name rejected
  data = rooms.reduceRooms(data, { type: "add", room: room({ id: "rm-b", name: "Кухня", type: "kitchen", art: "kitchen" }) });
  const before = data.rooms;
  assert.equal(rooms.reduceRooms(data, { type: "rename", id: "rm-b", name: "большая гостиная" }).rooms, before);
  assert.equal(rooms.reduceRooms(data, { type: "rename", id: "rm-x", name: "Зал" }).rooms, before);

  // set-type / set-art validate
  data = rooms.reduceRooms(data, { type: "set-type", id: "rm-b", roomType: "bedroom" });
  assert.equal(data.rooms[1].type, "bedroom");
  assert.equal(rooms.reduceRooms(data, { type: "set-type", id: "rm-b", roomType: "garage" }).rooms, data.rooms);
  data = rooms.reduceRooms(data, { type: "set-art", id: "rm-b", art: "bedroom" });
  assert.equal(data.rooms[1].art, "bedroom");

  // remove only removes the target
  data = rooms.reduceRooms(data, { type: "remove", id: "rm-a" });
  assert.deepEqual(data.rooms.map((r) => r.id), ["rm-b"]);
  assert.deepEqual(rooms.reduceRooms(data, { type: "remove", id: "rm-x" }).rooms, data.rooms);
});

// ---- room/device resolution ------------------------------------------------

test("deviceRoom resolves the assignment room string, empty when unassigned", () => {
  assert.equal(power.deviceRoom(channel().assigned), "Гостиная");
  assert.equal(
    power.deviceRoom(channel({ assigned: { ...channel().assigned, room: "  Спальня  " } }).assigned),
    "Спальня",
  );
  assert.equal(power.deviceRoom(null), "");
  assert.equal(power.deviceRoom({ ...channel().assigned, room: "" }), "");
});

test("power norm and model.normalizeName agree on the same canonical form", () => {
  for (const sample of ["  А  Б ", "Гостиная", "  ", "x\t\ny", "Кухня  "]) {
    assert.equal(
      power.deviceRoom(channel({ assigned: { ...channel().assigned, room: sample } }).assigned),
      rooms.normalizeName(sample),
    );
  }
});

test("roomPower sums fresh measurements exactly, including the protected channel", () => {
  const channels = [
    channel(),
    channel({ id: "CH2", watts: 0 }),
    channel({ id: "CH3", protected: true, assigned: { ...channel().assigned, room: "Гостиная", allowAuto: false }, watts: 2.4 }),
  ];
  const p = power.roomPower(channels, "Гостиная");
  assert.deepEqual(p, { kind: "exact", watts: 4.2, measured: 3, unavailable: 0 });

  // another room is not mixed in
  assert.deepEqual(power.roomPower(channels, "Кухня"), { kind: "none", watts: 0, measured: 0, unavailable: 0 });
});

test("roomPower never presents an incomplete sum as exact", () => {
  // one stale channel: partial lower bound, never a silent zero
  const partial = power.roomPower(
    [channel(), channel({ id: "CH2", freshness: "stale", watts: 4.2 })],
    "Гостиная",
  );
  assert.equal(partial.kind, "partial");
  assert.equal(partial.watts, 1.8);
  assert.equal(partial.measured, 1);
  assert.equal(partial.unavailable, 1);

  // all measurements unavailable: none, not zero
  const none = power.roomPower(
    [channel({ freshness: "missing", watts: null }), channel({ id: "CH2", freshness: "stale", watts: 4.2 })],
    "Гостиная",
  );
  assert.equal(none.kind, "none");
  assert.equal(none.watts, 0);
  assert.equal(none.unavailable, 2);
});

test("room grouping: case-insensitive match, implicit rooms, unassigned bucket", () => {
  const channels = [
    channel({ assigned: { ...channel().assigned, room: "гостиная" } }),
    channel({ id: "CH2", assigned: { ...channel().assigned, name: "LED", room: "Кухня" } }),
    channel({ id: "CH3", assigned: { ...channel().assigned, name: "Вентилятор", room: "" } }),
  ];
  const data = { version: 1, rooms: [room()] };

  // catalog room matches devices case-insensitively
  const entry = power.mergeRoomEntries(data, channels)[0];
  assert.equal(entry.kind, "catalog");
  assert.equal(power.channelsOfEntry(entry, channels).length, 1);

  // implicit room appears for unknown strings; unassigned devices are not dropped
  const names = power.deviceRoomNames(channels);
  // sorted deterministically; exact collation order is locale-dependent
  assert.deepEqual([...names].sort((a, b) => a.localeCompare(b)), names);
  assert.deepEqual(new Set(names), new Set(["Кухня", "гостиная"]));
  const merged = power.mergeRoomEntries({ version: 1, rooms: [] }, channels);
  assert.deepEqual(
    new Set(merged.map((e) => (e.kind === "implicit" ? e.name : "?"))),
    new Set(["Кухня", "гостиная"]),
  );

  // no duplicate implicit rooms over casing
  const casing = power.deviceRoomNames([
    channel({ assigned: { ...channel().assigned, room: "Спальня" } }),
    channel({ id: "CH2", assigned: { ...channel().assigned, room: "спальня" } }),
  ]);
  assert.deepEqual(casing, ["Спальня"]);
});

test("mergeRoomEntries never duplicates a catalog room as implicit", () => {
  const channels = [channel()];
  const data = { version: 1, rooms: [room()] };
  const entries = power.mergeRoomEntries(data, channels);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "catalog");
});

// ---- rename / move dispatch plans -------------------------------------------

test("renamePlan rewrites only the room field and touches nothing else", () => {
  const channels = [
    channel(),
    channel({ id: "CH2", assigned: { ...channel().assigned, room: "Кухня" } }),
    channel({ id: "CH3", protected: true, assigned: { ...channel().assigned, allowAuto: false }, watts: 2.4 }),
  ];
  const plan = power.renamePlan(channels, "Гостиная", "  Зал  ");
  assert.deepEqual(
    plan.map((s) => s.id),
    ["CH1", "CH3"],
  );
  for (const step of plan) {
    assert.equal(step.assignment.room, "Зал");
    assert.equal(step.assignment.name, "Светильник");
    assert.equal(step.assignment.image, "lamp");
    assert.equal(step.assignment.category, "lamp");
    assert.equal(step.assignment.allowAuto, false);
  }
  assert.deepEqual(power.renamePlan(channels, "Гостиная", "   "), []);
});

test("moveAssignment copies the assignment with only the room rewritten", () => {
  const assigned = channel().assigned;
  const moved = power.moveAssignment(assigned, "Спальня");
  assert.deepEqual(moved, { ...assigned, room: "Спальня" });
  assert.equal(power.moveAssignment(null, "Спальня"), null);
  assert.deepEqual(power.moveAssignment(assigned, "  "), { ...assigned, room: "" });
});

// ---- bridge into the existing device model ---------------------------------

test("device moves through the existing assign action keep name, image and autopilot permission", () => {
  let s = model.demoState("ru");
  const before = s.channels[0].assigned;
  s = model.reduceState(
    s,
    { type: "assign", id: "CH1", assignment: power.moveAssignment(before, "Спальня") },
    1000,
  );
  const after = s.channels[0].assigned;
  assert.equal(after.room, "Спальня");
  assert.equal(after.name, before.name);
  assert.equal(after.image, before.image);
  assert.equal(after.allowAuto, before.allowAuto);
  // measurement untouched by an organization action
  assert.equal(s.channels[0].watts, 1.8);
  assert.equal(s.channels[0].freshness, "fresh");
});

test("CH3 protection survives room moves through the existing reducer", () => {
  let s = model.demoState("ru");
  s = model.reduceState(
    s,
    {
      type: "assign",
      id: "CH3",
      assignment: { ...power.moveAssignment(s.channels[2].assigned, "Ванная"), allowAuto: true },
    },
    1000,
  );
  assert.equal(s.channels[2].assigned.room, "Ванная");
  assert.equal(s.channels[2].assigned.allowAuto, false);
  assert.equal(s.channels[2].protected, true);
  assert.equal(s.channels[2].watts, 2.4);
});

test("demo fixture rooms aggregate the documented demo totals", () => {
  const s = model.demoState("ru");
  const living = power.roomPower(s.channels, "Гостиная");
  assert.equal(living.kind, "exact");
  assert.equal(living.watts, 1.8); // CH1 1.8 W + CH2 0 W (off)
  const stand = power.roomPower(s.channels, "Тестовый стенд");
  assert.equal(stand.kind, "exact");
  assert.equal(stand.watts, 2.4); // protected CH3
  // restoring the demo state through the strict validator keeps the demo label
  assert.equal(model.restoreState(JSON.parse(JSON.stringify(s))).source, "demo");
});

// ---- localization -----------------------------------------------------------

test("every room type and art label exists in RU and KY and differs by locale", () => {
  const types = rooms.roomTypes;
  const arts = rooms.roomArts;
  assert.ok(types.length >= 7);
  assert.ok(arts.length >= 8);
  for (const t of types) {
    for (const locale of ["ru", "ky"]) {
      const label = i18n.roomTypeLabel(t, locale);
      assert.equal(typeof label, "string");
      assert.ok(label.trim().length > 0, `empty label for ${t}/${locale}`);
    }
  }
  for (const a of arts) {
    assert.ok(i18n.roomArtLabel(a, "ru").trim().length > 0);
    assert.ok(i18n.roomArtLabel(a, "ky").trim().length > 0);
  }
  // spot-check locale switching
  assert.equal(i18n.roomTypeLabel("living", "ru"), "Гостиная");
  assert.equal(i18n.roomTypeLabel("living", "ky"), "Конок бөлмөсү");
  assert.notEqual(i18n.roomArtLabel("bedroom", "ru"), i18n.roomArtLabel("bedroom", "ky"));
});
