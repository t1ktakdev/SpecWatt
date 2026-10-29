import React from "react";
import { AutopilotScreen as DemoScreen } from "../screens/automation";
import {useLive} from "../specwatt/live-context";
import {LiveTabScreen} from "../screens/live-tabs";
export default function Screen() {
  const {state}=useLive();
  return state.kind==="demo"?<DemoScreen/>:<LiveTabScreen tab="autopilot"/>;
}
