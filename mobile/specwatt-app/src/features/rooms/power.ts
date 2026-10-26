/**
 * Rooms & Spaces — room/device resolution and power aggregation adapters.
 *
 * Pure functions over the existing device model (no React, no transport).
 * The single source of truth for "which room is this device in" is the
 * `Assign.room` string. Catalog rooms match devices by trimmed name; devices
 * whose room string has no catalog entry form implicit rooms so nothing is
 * ever orphaned.
 *
 * Power honesty rule (mirrors `totalPower` in the domain model): an exact sum
 * is only produced when every contributing measurement is fresh. Otherwise the
 * result is a clearly-labelled lower bound or "no data" — never a silent zero.
 */

import type { Assign, Channel, ChannelId } from "../../specwatt/model";
import type { Room, RoomsData } from "./model";

export const NO_ROOM_KEY = "";

/**
 * Local copy of model.normalizeName (kept import-free so this module loads
 * under plain `node --test` without extension-rewriting). The module tests
 * pin both implementations to the same canonical form.
 */
function norm(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Trimmed room string of a device assignment ('' when unassigned). */
export function deviceRoom(assigned: Assign | null | undefined): string {
  if (!assigned || typeof assigned.room !== "string") return NO_ROOM_KEY;
  return norm(assigned.room);
}

export function isRoomDevice(channel: Channel, roomName: string): boolean {
  // Case-insensitive: users type room names in any case, and the same
  // physical room must never split into two groups over casing.
  if (roomName === "") return deviceRoom(channel.assigned) === "";
  return deviceRoom(channel.assigned).toLowerCase() === roomName.toLowerCase();
}

export type RoomPower = {
  /** exact = every device measured fresh; partial = lower bound; none = nothing usable */
  kind: "exact" | "partial" | "none";
  watts: number;
  /** channels with a fresh, usable measurement */
  measured: number;
  /** channels whose measurement is missing/stale/null */
  unavailable: number;
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Sums current watts of the room's channels. Fresh zero readings are real
 * measurements and count as exact. Unavailable readings never become zero
 * silently: with at least one usable value the sum is returned as `partial`
 * (a lower bound), otherwise `none`.
 */
export function roomPower(channels: Channel[], roomName: string): RoomPower {
  const inRoom = channels.filter((c) => isRoomDevice(c, roomName));
  let watts = 0;
  let measured = 0;
  let unavailable = 0;
  for (const c of inRoom) {
    if (c.freshness === "fresh" && typeof c.watts === "number" && Number.isFinite(c.watts) && c.watts >= 0) {
      watts += c.watts;
      measured++;
    } else {
      unavailable++;
    }
  }
  if (!inRoom.length) return { kind: "none", watts: 0, measured: 0, unavailable: 0 };
  if (unavailable === 0) return { kind: "exact", watts: round1(watts), measured, unavailable: 0 };
  if (measured > 0) return { kind: "partial", watts: round1(watts), measured, unavailable };
  return { kind: "none", watts: 0, measured: 0, unavailable };
}

/** Devices grouped by trimmed room string; key '' = not placed in a room. */
export function groupChannels(channels: Channel[]): Map<string, Channel[]> {
  const map = new Map<string, Channel[]>();
  for (const c of channels) {
    const key = deviceRoom(c.assigned);
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  return map;
}

/**
 * Distinct non-empty room strings present on devices, deduplicated
 * case-insensitively (first spelling wins for display), sorted by name.
 */
export function deviceRoomNames(channels: Channel[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const key of groupChannels(channels).keys()) {
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    names.push(key);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export type RoomEntry =
  | { kind: "catalog"; room: Room }
  | { kind: "implicit"; name: string }
  | { kind: "none" };

export function roomKeyOfEntry(entry: RoomEntry): string {
  if (entry.kind === "none") return NO_ROOM_KEY;
  return entry.kind === "catalog" ? entry.room.name : entry.name;
}

/**
 * Room list merged from catalog + devices:
 * - catalog rooms always appear (even with zero devices);
 * - device room strings without a catalog entry appear as implicit rooms;
 * - unmatched devices are never dropped or rewritten.
 * The "Без помещения" bucket ({kind:"none"}) is added by the UI when the
 * unassigned group is non-empty; it is absence of a room, not a room.
 */
export function mergeRoomEntries(data: RoomsData, channels: Channel[]): RoomEntry[] {
  const entries: RoomEntry[] = data.rooms.map((room) => ({ kind: "catalog" as const, room }));
  const known = new Set(data.rooms.map((r) => r.name.toLowerCase()));
  for (const name of deviceRoomNames(channels)) {
    if (!known.has(name.toLowerCase())) entries.push({ kind: "implicit", name });
  }
  return entries;
}

export function channelsOfEntry(entry: RoomEntry, channels: Channel[]): Channel[] {
  return channels.filter((c) => isRoomDevice(c, roomKeyOfEntry(entry)));
}

/**
 * Dispatch plan for renaming a room: for every device currently in `from`,
 * the same assignment with only `room` rewritten. Name, image, category and
 * `allowAuto` are carried over untouched (the reducer additionally re-forces
 * CH3's `allowAuto: false`).
 */
export function renamePlan(
  channels: Channel[],
  from: string,
  to: string,
): { id: ChannelId; assignment: Assign }[] {
  const next = norm(to);
  if (!next) return [];
  return channels
    .filter((c) => c.assigned && isRoomDevice(c, from))
    .map((c) => ({
      id: c.id,
      assignment: { ...(c.assigned as Assign), room: next },
    }));
}

/** Assignment copy for moving one device to another room ('' = no room). */
export function moveAssignment(assigned: Assign | null, toRoom: string): Assign | null {
  if (!assigned) return null;
  return { ...assigned, room: norm(toRoom) };
}
