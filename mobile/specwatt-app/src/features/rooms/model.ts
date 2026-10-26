/**
 * Rooms & Spaces — pure catalog model.
 *
 * The rooms module is an organization layer on top of the existing device
 * model. It never replaces `src/specwatt/model.ts`: a device stays bound to a
 * room through the existing `Assign.room` string, and every device mutation
 * the module performs goes through the existing public `assign` action.
 * This file holds no React and no React Native imports so the module tests can
 * load it directly under `node --test`.
 *
 * Safety rules mirrored from the domain model:
 * - Removing a room never touches device assignments. Devices whose `room`
 *   string no longer has a catalog entry simply regroup as an implicit room.
 * - Renaming a room produces a dispatch plan for the affected assignments;
 *   every field except `room` is carried over untouched.
 * - Room names follow the same 80-character cap as `Assign.room`.
 */

export type RoomType =
  | "living"
  | "bedroom"
  | "kitchen"
  | "office"
  | "bathroom"
  | "hallway"
  | "other";

export type RoomArt =
  | "living"
  | "bedroom"
  | "kitchen"
  | "office"
  | "bathroom"
  | "hallway"
  | "loft"
  | "corner";

export type Room = {
  id: string;
  name: string;
  type: RoomType;
  art: RoomArt;
  createdAt: number;
};

export type RoomsData = {
  version: 1;
  rooms: Room[];
};

export const roomTypes: RoomType[] = [
  "living",
  "bedroom",
  "kitchen",
  "office",
  "bathroom",
  "hallway",
  "other",
];

export const roomArts: RoomArt[] = [
  "living",
  "bedroom",
  "kitchen",
  "office",
  "bathroom",
  "hallway",
  "loft",
  "corner",
];

export const ROOM_NAME_MAX = 80;

export type NameError = "required" | "too-long" | "duplicate";

/** Collapses inner whitespace so lookups stay stable across edits. */
export function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function emptyRooms(): RoomsData {
  return { version: 1, rooms: [] };
}

export function newRoomId(now = Date.now()): string {
  return `rm-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function roomNameError(
  rawName: string,
  rooms: Room[],
  excludeId?: string,
): NameError | null {
  const name = normalizeName(rawName);
  if (!name) return "required";
  if (name.length > ROOM_NAME_MAX) return "too-long";
  const lower = name.toLowerCase();
  if (
    rooms.some((r) => r.id !== excludeId && r.name.toLowerCase() === lower)
  )
    return "duplicate";
  return null;
}

export type RoomsAction =
  | { type: "add"; room: Room }
  | { type: "rename"; id: string; name: string }
  | { type: "set-type"; id: string; roomType: RoomType }
  | { type: "set-art"; id: string; art: RoomArt }
  | { type: "remove"; id: string };

/**
 * Pure catalog reducer. Device assignments are intentionally out of scope:
 * removal drops only the catalog entry, rename only rewrites the catalog name
 * (devices are re-assigned through a separate dispatch plan).
 */
export function reduceRooms(data: RoomsData, action: RoomsAction): RoomsData {
  switch (action.type) {
    case "add": {
      const room = action.room;
      if (
        roomNameError(room.name, data.rooms) ||
        !roomTypes.includes(room.type) ||
        !roomArts.includes(room.art)
      )
        return data;
      return {
        ...data,
        rooms: [
          ...data.rooms,
          {
            ...room,
            id: room.id,
            name: normalizeName(room.name),
            createdAt: room.createdAt,
          },
        ],
      };
    }
    case "rename": {
      const target = data.rooms.find((r) => r.id === action.id);
      if (!target) return data;
      if (roomNameError(action.name, data.rooms, action.id)) return data;
      return {
        ...data,
        rooms: data.rooms.map((r) =>
          r.id === action.id ? { ...r, name: normalizeName(action.name) } : r,
        ),
      };
    }
    case "set-type":
      if (!roomTypes.includes(action.roomType)) return data;
      return {
        ...data,
        rooms: data.rooms.map((r) =>
          r.id === action.id ? { ...r, type: action.roomType } : r,
        ),
      };
    case "set-art":
      if (!roomArts.includes(action.art)) return data;
      return {
        ...data,
        rooms: data.rooms.map((r) =>
          r.id === action.id ? { ...r, art: action.art } : r,
        ),
      };
    case "remove":
      return {
        ...data,
        rooms: data.rooms.filter((r) => r.id !== action.id),
      };
  }
}

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const boundedText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Strict schema validation for persisted rooms. Any structural corruption
 * discards the whole catalog (the same fail-safe the device model applies);
 * assignments live in the device state and are never reconstructed here.
 */
export function restoreRooms(raw: unknown): RoomsData {
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.rooms))
    return emptyRooms();
  if (raw.rooms.length > 100) return emptyRooms();
  const rooms: Room[] = [];
  const seen = new Set<string>();
  for (const entry of raw.rooms) {
    if (
      !record(entry) ||
      !boundedText(entry.id, 100) ||
      !boundedText(entry.name, ROOM_NAME_MAX) ||
      !roomTypes.includes(entry.type as RoomType) ||
      !roomArts.includes(entry.art as RoomArt) ||
      !finite(entry.createdAt) ||
      entry.createdAt < 0
    )
      return emptyRooms();
    const lower = (entry.name as string).toLowerCase();
    if (seen.has(lower)) return emptyRooms();
    seen.add(lower);
    rooms.push({
      id: entry.id as string,
      name: entry.name as string,
      type: entry.type as RoomType,
      art: entry.art as RoomArt,
      createdAt: entry.createdAt as number,
    });
  }
  return { version: 1, rooms };
}
