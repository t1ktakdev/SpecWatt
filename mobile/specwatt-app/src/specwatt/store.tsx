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
import type { Action, Assign, ChannelId, DemoState, FirstRunStep, Locale } from "./model";
import { localeFromStoredState, recallLocale, rememberLocale } from "./localization/locale-mirror";

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
  setFirstRunStep: (value: FirstRunStep) => void;
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
    async function load() {
      let next = emptyState();
      let error: string | null = null;
      let corruptLocale: Locale | null = null;
      let recover = false;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw === null) {
          recover = true; // Main record missing: try the independent locale.
        } else if (raw.length > 100000) {
          error = "invalid-storage";
          recover = true;
        } else {
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            error = "invalid-storage";
            recover = true;
          }
          if (!recover) {
            corruptLocale = localeFromStoredState(parsed);
            const source =
              typeof parsed === "object" && parsed !== null && "source" in parsed
                ? parsed.source
                : null;
            const restored = restoreState(parsed);
            if (
              !corruptLocale ||
              (source !== "none" && source !== "demo") ||
              (source === "demo" && restored.source !== "demo")
            ) {
              // Discard ALL unsafe channel/consent data, but recover language.
              error = "invalid-storage";
              recover = true;
            } else {
              next = restored;
            }
          }
        }
      } catch {
        error = "read-error";
        recover = true;
      }
      if (recover) {
        const mirror = await recallLocale(AsyncStorage);
        next = { ...emptyState(), locale: corruptLocale ?? mirror ?? "ru" };
      }
      if (!live.current) return;
      setData(next);
      if (error) setStorageError(error);
      setReady(true);
    }
    void load();
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const snapshot = JSON.stringify(data);
    const locale = data.locale;
    // Strict order of ALL writes: an old language can never overwrite a
    // newer one. Persist the primary state first, then its recovery mirror.
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        try {
          await AsyncStorage.setItem(KEY, snapshot);
        } catch {
          if (live.current) setStorageError("write-error");
        }
        await rememberLocale(AsyncStorage, locale);
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
      setFirstRunStep: (value) => dispatch({ type: "first-run-step", value }),
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
