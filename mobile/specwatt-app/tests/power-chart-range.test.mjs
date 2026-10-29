import assert from 'node:assert/strict';
import test from 'node:test';
import {powerChartRange} from '../src/specwatt/live-history.ts';
test('a channel with two off readings has a true peak of zero and a usable plotting ceiling',()=>{
 assert.deepEqual(powerChartRange([0,0]),{observedPeak:0,ceiling:1});
 assert.deepEqual(powerChartRange([0.2,0.4]),{observedPeak:0.4,ceiling:1});
 assert.deepEqual(powerChartRange([1.8,4.2]),{observedPeak:4.2,ceiling:4.2});
});
