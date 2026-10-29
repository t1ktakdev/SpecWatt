import React from "react";
import { DevicesScreen as DemoScreen } from "../screens/dashboard";
import {useLive} from "../specwatt/live-context";
import {LiveTabScreen} from "../screens/live-tabs";
export default function Screen() {
  const {state}=useLive();
  return state.kind==="demo"?<DemoScreen/>:<LiveTabScreen tab="devices"/>;
}
