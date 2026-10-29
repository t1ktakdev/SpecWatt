import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { BrainClient, createTokenVault } from "./api";
import { createLiveWorkspace, LIVE_POLL_MS } from "./live-workspace";
import type { LiveWorkspace } from "./live-workspace";

const Context = createContext<LiveWorkspace | null>(null);
export const defaultServerUrl = () => __DEV__
  ? Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000"
  : "https://localhost:8000";

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const workspace = useMemo(() => {
    const vault = createTokenVault(Platform.OS !== "web");
    const connect = (baseUrl: string) => new BrainClient({baseUrl,development:__DEV__,vault});
    return createLiveWorkspace({client:connect(defaultServerUrl()),connect,uuid:randomUUID});
  }, []);
  useEffect(() => { void workspace.restore();return ()=>workspace.dispose(); },[workspace]);
  return <Context.Provider value={workspace}>{children}</Context.Provider>;
}
export function useLive() {
  const workspace=useContext(Context);
  if(!workspace) throw new Error("LiveProvider missing");
  const state=useSyncExternalStore(workspace.subscribe,workspace.getState,workspace.getState);
  return {workspace,state};
}
/** Poll only while one main server screen is focused and the app is active. */
export function useLivePolling() {
  const {workspace,state}=useLive();
  useFocusEffect(useCallback(()=>{
    if(state.kind!=="server-simulator"||!state.selectedId)return;
    let timer: ReturnType<typeof setTimeout> | undefined, stopped=false;
    const active=()=>AppState.currentState===null||AppState.currentState==="active";
    const tick=async()=>{
      if(stopped||!active())return;
      await workspace.refresh();
      if(!stopped&&active())timer=setTimeout(tick,LIVE_POLL_MS);
    };
    void tick();
    const listener=AppState.addEventListener("change",next=>{
      clearTimeout(timer);workspace.cancelReads();
      if(next==="active")void tick();
    });
    return ()=>{stopped=true;clearTimeout(timer);listener.remove();workspace.cancelReads();};
  },[state.kind,state.selectedId,workspace]));
}
