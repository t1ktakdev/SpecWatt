import test from 'node:test';
import assert from 'node:assert/strict';
import {chartScale,chartValue} from '../src/specwatt/chart-layout.ts';

test('chart scale covers high loads with finite evenly spaced ticks',()=>{
  for(const values of [[0,0],[null,NaN,Infinity,-3],[4.2,4.2],[13,27],[0.01,0.02],Array.from({length:90},(_,i)=>i*17)]) {
    const {max,ticks}=chartScale(values);
    assert.ok(Number.isFinite(max)&&max>0);
    assert.equal(ticks.length,4);
    assert.equal(ticks[0],0);
    assert.equal(ticks[3],max);
    for(const v of values) if(typeof v==='number'&&Number.isFinite(v)&&v>0) assert.ok(max>=v);
  }
});
test('chart missing values stay missing while zero stays zero',()=>{
  for(const v of [null,undefined,NaN,Infinity,-1]) assert.equal(chartValue(v),null);
  assert.equal(chartValue(0),0);
  assert.equal(chartValue(27),27);
});
