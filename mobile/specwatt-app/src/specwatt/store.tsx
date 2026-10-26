import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyState, reduceState, restoreState } from "./model";
import type { Action, Assign, ChannelId, DemoState, Locale } from "./model";

export type {
  Assign,
  Channel,
  ChannelId,
  DemoState,
  Locale,
  JournalEvent,
  Schedule,
} from "./model";
export { totalPower, getPlan } from "./model";
const KEY = "specwatt-mobile-v1";
type Ctx = {
  data: DemoState;
  ready: boolean;
  storageError: string | null;
  setLocale: (x: Locale) => void;
  enterDemo: () => void;
  leaveDemo: () => void;
  assign: (id: ChannelId, assignment: Assign) => void;
  setOnboarded: () => void;
  toggleChannel: (id: ChannelId) => void;
  setAutopilot: (value: boolean) => void;
  setPeak: (value: number) => void;
  setManualMinutes: (value: number) => void;
  applyPlan: () => void;
  rejectPlan: () => void;
  setSchedule: (id: ChannelId, start: string, duration: number) => void;
};
const Context = createContext<Ctx | null>(null);
export function SpecProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DemoState>(emptyState);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!live.current || raw === null) return;
        if (raw.length > 100000) throw new Error("invalid-storage");
        const parsed: unknown = JSON.parse(raw),
          restored = restoreState(parsed);
        setData(restored);
        if (
          restored.source === "none" &&
          typeof parsed === "object" &&
          parsed !== null &&
          "source" in parsed &&
          parsed.source === "demo"
        )
          setStorageError("invalid-storage");
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
    // Serialize writes: an older snapshot must never overwrite a newer one.
    writes.current = writes.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(KEY, snapshot))
      .catch(() => {
        if (live.current) setStorageError("write-error");
      });
  }, [ready, data]);
  const ctx = useMemo<Ctx>(() => {
    const dispatch = (a: Action) => setData((s) => reduceState(s, a));
    return {
      data,
      ready,
      storageError,
      setLocale: (value) => dispatch({ type: "locale", value }),
      enterDemo: () => dispatch({ type: "enter-demo" }),
      leaveDemo: () => dispatch({ type: "leave-demo" }),
      assign: (id, assignment) => dispatch({ type: "assign", id, assignment }),
      setOnboarded: () => dispatch({ type: "onboarded" }),
      toggleChannel: (id) => dispatch({ type: "toggle", id }),
      setAutopilot: (value) => dispatch({ type: "autopilot", value }),
      setPeak: (value) => dispatch({ type: "peak", value }),
      setManualMinutes: (value) => dispatch({ type: "manual-minutes", value }),
      applyPlan: () => dispatch({ type: "apply-plan" }),
      rejectPlan: () => dispatch({ type: "reject-plan" }),
      setSchedule: (id, start, duration) =>
        dispatch({ type: "schedule", id, start, duration }),
    };
  }, [data, ready, storageError]);
  return <Context.Provider value={ctx}>{children}</Context.Provider>;
}
export function useSpec() {
  const ctx = useContext(Context);
  if (!ctx) throw Error("SpecProvider missing");
  return ctx;
}
