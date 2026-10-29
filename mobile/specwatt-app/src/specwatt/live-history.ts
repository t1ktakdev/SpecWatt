import { integratePower } from "./energy.ts";
import type { PowerSample } from "./energy.ts";
import type { ServerMeasurement } from "./api.ts";

/** Controller scope belongs to workspace; observations retain simulator provenance. */
export function serverPowerHistory(rows: readonly ServerMeasurement[], nowSeconds: number, maxGapSec = 60) {
  const points: PowerSample[] = [];
  let sequence = 0, at = -1, ignored = 0;
  for (const row of rows) {
    const values = [row.channels.CH1,row.channels.CH2,row.channels.CH3];
    if (row.source !== "simulator" || row.sequence <= sequence || !Number.isSafeInteger(row.sequence) ||
        !Number.isFinite(row.measured_at) || row.measured_at <= at || row.measured_at > nowSeconds ||
        values.some(v=>!Number.isFinite(v)||v<0) || values.reduce((a,b)=>a+b,0)>1e9) { ignored++;continue; }
    sequence = row.sequence; at = row.measured_at;
    points.push({at:at*1000,watts:values.reduce((a,b)=>a+b,0),source:"simulator",freshness:"fresh"});
  }
  const summary=integratePower(points,{method:"trapezoid",maxGapMs:maxGapSec*1000});
  return {points,summary,ignored,hasGap:summary.missingMs>0};
}
