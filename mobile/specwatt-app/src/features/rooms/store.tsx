/**
 * Rooms & Spaces — module store.
 *
 * The rooms catalog persists under its own AsyncStorage key and is fully
 * independent of the main app store. The only bridge to the shared device
 * state is the existing public `useSpec()` API:
 * - moving a device dispatches the existing `assign` action (all other
 *   assignment fields, including autopilot permission, are preserved);
 * - the module never dispatches toggle/schedule/plan actions and never
 *   touches measurements or equipment commands.
 *
 * Mount `RoomsProvider` below `SpecProvider` (the `/rooms` route layout does
 * exactly this), so both hooks resolve.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSpec } from "../../specwatt/store";
import type { Assign, ChannelId } from "../../specwatt/model";
import {
  emptyRooms,
  newRoomId,
  normalizeName,
  reduceRooms,
  restoreRooms,
  roomNameError,
} from "./model";
import type { Room, RoomArt, RoomsData, RoomType } from "./model";
import { moveAssignment, renamePlan } from "./power";

const KEY = "specwatt-rooms-v1";

export type NewRoomInput = {
  name: string;
  roomType: RoomType;
  art: RoomArt;
};

type RoomsCtx = {
  data: RoomsData;
  ready: boolean;
  storageError: string | null;
  addRoom: (input: NewRoomInput) => Room | null;
  renameRoom: (id: string, name: string) => boolean;
  setRoomType: (id: string, roomType: RoomType) => void;
  setRoomArt: (id: string, art: RoomArt) => void;
  removeRoom: (id: string) => void;
  /** Existing assignment with only the room rewritten; goes through `assign`. */
  moveDevice: (channelId: ChannelId, toRoom: string) => void;
};

const Context = createContext<RoomsCtx | null>(null);

export function RoomsProvider({ children }: { children: React.ReactNode }) {
  const { data: app, assign } = useSpec();
  const [data, setData] = useState<RoomsData>(emptyRooms);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!live.current || raw === null) return;
        if (raw.length > 50000) throw new Error("invalid-storage");
        setData(restoreRooms(JSON.parse(raw)));
      })
      .catch(() => {
        if (live.current) setStorageError("read-error");
      })
      .finally(() => {
        if (live.current) setReady(true);
      });
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const snapshot = JSON.stringify(data);
    writes.current = writes.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(KEY, snapshot))
      .catch(() => {
        if (live.current) setStorageError("write-error");
      });
  }, [ready, data]);

  const ctx = useMemo<RoomsCtx>(() => {
    const dispatch = (a: Parameters<typeof reduceRooms>[1]) =>
      setData((s) => reduceRooms(s, a));
    return {
      data,
      ready,
      storageError,
      addRoom: (input) => {
        const name = normalizeName(input.name);
        if (roomNameError(name, data.rooms)) return null;
        const room: Room = {
          id: newRoomId(),
          name,
          type: input.roomType,
          art: input.art,
          createdAt: Date.now(),
        };
        dispatch({ type: "add", room });
        return room;
      },
      renameRoom: (id, name) => {
        const target = data.rooms.find((r) => r.id === id);
        if (!target) return false;
        const next = normalizeName(name);
        if (roomNameError(next, data.rooms, id)) return false;
        // Devices follow the catalog rename through the existing assign
        // action: autopilot permissions and everything else stay untouched.
        for (const step of renamePlan(app.channels, target.name, next))
          assign(step.id, step.assignment);
        dispatch({ type: "rename", id, name: next });
        return true;
      },
      setRoomType: (id, roomType) =>
        dispatch({ type: "set-type", id, roomType }),
      setRoomArt: (id, art) => dispatch({ type: "set-art", id, art }),
      removeRoom: (id) => {
        // Catalog entry only: device assignments keep their room strings and
        // regroup as an implicit room, so nothing is destroyed.
        dispatch({ type: "remove", id });
      },
      moveDevice: (channelId, toRoom) => {
        const channel = app.channels.find((c) => c.id === channelId);
        if (!channel) return;
        const next: Assign | null = moveAssignment(channel.assigned, toRoom);
        if (next) assign(channelId, next);
      },
    };
  }, [data, ready, storageError, app.channels, assign]);

  return <Context.Provider value={ctx}>{children}</Context.Provider>;
}

export function useRooms(): RoomsCtx {
  const ctx = useContext(Context);
  if (!ctx) throw Error("RoomsProvider missing");
  return ctx;
}
