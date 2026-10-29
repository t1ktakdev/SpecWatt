import React from "react";
import { DeviceScreen as DemoScreen } from "../screens/device";
import {useLive} from "../specwatt/live-context";
import {LiveTabScreen} from "../screens/live-tabs";
export default function Screen() {
  const {state}=useLive();
  return state.kind==="demo"?<DemoScreen/>:<LiveTabScreen tab="device"/>;
}
