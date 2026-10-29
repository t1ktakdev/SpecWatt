import test from 'node:test';
import assert from 'node:assert/strict';
import { serverPowerHistory } from '../src/specwatt/live-history.ts';
const row=(sequence,measured_at,total=10)=>({sequence,measured_at,source:'simulator',channels:{CH1:total-2.4,CH2:0,CH3:2.4}});
test('server history estimates 5 Wh for 10 W over 30 minutes with explicit interpolation bound',()=>{
 const h=serverPowerHistory([row(1,100),row(2,1900)],2000,1800);assert.equal(h.summary.observedWh,5);assert.equal(h.summary.complete,true);
});
test('default 60 second gap is shown and never integrated or bridged',()=>{
 const h=serverPowerHistory([row(1,100),row(2,3700)],4000);assert.equal(h.summary.observedWh,0);assert.equal(h.summary.missingMs,3600000);assert.equal(h.hasGap,true);
});
test('replayed sequence, duplicate/backward times, future and mixed sources are excluded',()=>{
 const h=serverPowerHistory([row(1,100),row(1,110),row(2,100),row(3,99),row(4,500),{...row(5,120),source:'hardware'},row(6,130)],200);
 assert.deepEqual(h.points.map(p=>p.at),[100000,130000]);assert.equal(h.ignored,5);assert.ok(h.summary.observedWh>0);
});
test('partial/malformed history never becomes zero or a partial total',()=>{
 const h=serverPowerHistory([{...row(1,100),channels:{CH1:5,CH3:2.4}},row(2,120)],200);assert.equal(h.points.length,1);assert.equal(h.ignored,1);assert.equal(h.summary.coveredMs,0);
});
