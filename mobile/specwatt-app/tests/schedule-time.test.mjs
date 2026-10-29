import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {localStartToUtc,formatLocalStart} from '../src/specwatt/schedule-time.ts';
test('local schedule time converts Bishkek 20:30 to 14:30Z without changing intent',()=>{
 const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`import {localStartToUtc} from './src/specwatt/schedule-time.ts';console.log(localStartToUtc('29.10.2026 20:30'));`],{cwd:process.cwd(),env:{...process.env,TZ:'Asia/Bishkek'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'2026-10-29T14:30:00Z');
});
test('local schedule rejects normalized invalid calendar/time and raw UTC input',()=>{
 for(const value of ['31.02.2026 12:00','29.10.2026 24:01','29.10.2026 12:60','2026-10-29T12:00:00Z',''])assert.throws(()=>localStartToUtc(value),/invalid_local_time/);
 assert.match(formatLocalStart(new Date(2026,9,29,20,30)),/^29\.10\.2026 20:30$/);
});
test('DST gaps and ambiguous repeated time require another explicit local time',()=>{
 const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`import assert from 'node:assert/strict';import {localStartToUtc} from './src/specwatt/schedule-time.ts';for(const value of ['08.03.2026 02:30','01.11.2026 01:30'])assert.throws(()=>localStartToUtc(value),/invalid_local_time/);`],{cwd:process.cwd(),env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
