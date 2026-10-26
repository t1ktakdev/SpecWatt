import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,demoState,totalPower,requestCommand,acknowledgeCommand,exitDemo} from './core.ts';
test('fresh live home does not invent devices or measurements',()=>{const s=emptyState();assert.equal(s.source,'live');assert.equal(s.channels.length,0);assert.equal(totalPower(s),null);});
test('demo returns three channels and only measured 4.2 W',()=>{const s=demoState();assert.equal(s.channels.length,3);assert.equal(s.channels[2].protected,true);assert.equal(totalPower(s),4.2);});
test('requested command does not optimistically change confirmed state',()=>{const s=demoState();const out=requestCommand(s,'CH1',false,'cmd-1');assert.equal(out.channels[0].confirmed,true);assert.equal(out.commands[0].status,'requested');const ack=acknowledgeCommand(out,'cmd-1',0);assert.equal(ack.channels[0].confirmed,false);assert.equal(totalPower(ack),2.4);});
test('protected channel is never manually switchable',()=>{assert.throws(()=>requestCommand(demoState(),'CH3',false,'cmd-protected'),/protected/);});
test('stale channel blocks readings and new commands',()=>{const s=demoState();s.channels[0].freshness='stale';assert.equal(totalPower(s),null);assert.throws(()=>requestCommand(s,'CH1',false,'cmd-stale'),/stale/);});
test('demo permissions and readings cannot leak to live',()=>{const s=demoState();s.autoConsent=true;s.channels[0].allowAuto=true;const live=exitDemo(s);assert.equal(live.autoConsent,false);assert.equal(live.channels.length,0);assert.equal(totalPower(live),null);});
