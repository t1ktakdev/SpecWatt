import test from 'node:test';
import assert from 'node:assert/strict';
import { BrainClient, ApiError, parseSnapshot } from '../src/specwatt/api.ts';
import { createLiveWorkspace } from '../src/specwatt/live-workspace.ts';

const snapshot = (id='a') => ({controller_id:id,name:id,source:'simulator',measured_at:100,freshness:'fresh',total_watts:4.2,peak_watts:7,
 channels:['CH1','CH2','CH3'].map((id,i)=>({id,protected:i===2,watts:[1.8,0,2.4][i],last_known_watts:[1.8,0,2.4][i],freshness:'fresh',assigned:{name:id,room:'Room',image:'lamp',allow_auto:false}}))});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(overrides={}) {
 let posts=0;const commands=[];
 const client={baseUrl:'http://localhost:8000',hasSession:async()=>false,authenticate:async()=>{},logout:async()=>{},controllers:async()=>['a','b'].map(id=>({id,name:id,source:'simulator'})),snapshot:async id=>snapshot(id),commands:async()=>commands,events:async()=>[],measurements:async()=>[],command:async()=>{posts++;const c={id:'cmd',controller_id:'a',channel_id:'CH1',on:false,status:'requested',transitions:[]};commands.push(c);return c;},...overrides};
 const workspace=createLiveWorkspace({client,connect:()=>client,now:()=>100000,uuid:()=> '00000000-0000-4000-8000-000000000001'});
 return {client,workspace,posts:()=>posts};
}
async function signed(w){await w.authenticate('http://localhost:8000','login','fixture@example.test','correct-horse-battery');}

test('main workspace selects owner controller and never writes demo state',async()=>{
 const {workspace:w}=fixture();assert.equal(w.getState().kind,'demo');await signed(w);
 assert.equal(w.getState().kind,'server-simulator');assert.equal(w.getState().snapshot,null);
 await w.select('a');assert.equal(w.getState().snapshot.controller_id,'a');
 w.demo();assert.equal(w.getState().kind,'demo');assert.equal(w.getState().snapshot,null);assert.deepEqual(w.getState().commands,[]);
});
test('explicit simulator creation loads selected snapshot even while creation holds mutation lock',async()=>{
 const {workspace:w}=fixture({createSimulator:async()=>({id:'a',name:'a',source:'simulator'})});await signed(w);await w.create('a');
 assert.equal(w.getState().snapshot?.controller_id,'a');assert.equal(w.getState().busy,false);
});
test('late snapshot cannot cross selection or logout even when fetch ignores abort',async()=>{
 const slow=deferred();const {workspace:w}=fixture({snapshot:id=>id==='a'?slow.promise:Promise.resolve(snapshot(id))});
 await signed(w);const old=w.select('a');await w.select('b');slow.resolve(snapshot('a'));await old;
 assert.equal(w.getState().snapshot.controller_id,'b');await w.logout();assert.equal(w.getState().snapshot,null);
});
test('CH3, stale, future timestamps and double taps never submit unsafe commands',async()=>{
 const {workspace:w,posts}=fixture();await signed(w);await w.select('a');
 await w.command('CH3',false);assert.equal(posts(),0);await w.refresh();
 await Promise.all([w.command('CH1',false),w.command('CH1',false)]);assert.equal(posts(),1);assert.equal(w.getState().commands[0].status,'requested');
 for(const at of [0,101]){const f=fixture({snapshot:async()=>({...snapshot(),measured_at:at})});await signed(f.workspace);await f.workspace.select('a');await f.workspace.command('CH1',false);assert.equal(f.posts(),0);}
});
test('ambiguous mutation sends once, blocks subsequent commands until GET reconciliation',async()=>{
 let posts=0;const {workspace:w}=fixture({command:async()=>{posts++;throw new ApiError('network_error');}});await signed(w);await w.select('a');
 await w.command('CH1',false);assert.equal(w.getState().uncertain,true);await w.command('CH1',false);assert.equal(posts,1);
 await w.refresh();assert.equal(w.getState().uncertain,false);
});
test('401 removes controller data without falling back to demo',async()=>{
 const {client,workspace:w}=fixture();await signed(w);await w.select('a');client.snapshot=async()=>{throw new ApiError('http_401');};await w.refresh();
 assert.equal(w.getState().kind,'unconfigured');assert.equal(w.getState().snapshot,null);assert.deepEqual(w.getState().controllers,[]);
});
test('history cursor stays scoped, deduplicates and rejects another controller response',async()=>{
 const cursors=[];const {client,workspace:w}=fixture({events:async(id,after)=>{cursors.push([id,after]);return after?[]:[{sequence:1,controller_id:id,source:'simulator',kind:'created',channel_id:null,command_id:null,reason:null,created_at:100}];}});
 await signed(w);await w.select('a');await w.refresh();assert.equal(w.getState().events.length,1);await w.select('b');assert.deepEqual(cursors,[['a',0],['a',1],['b',0]]);
 client.snapshot=async()=>snapshot('a');await w.refresh();assert.equal(w.getState().error,'invalid_response');assert.equal(w.getState().snapshot,null);
});
test('BrainClient validates event source/owner and measurement sequence/value boundaries',async()=>{
 let body=[];const c=new BrainClient({baseUrl:'http://localhost:8000',development:true,vault:{get:async()=> 'fixture-session',set:async()=>{},clear:async()=>{}},fetcher:async()=>new Response(JSON.stringify(body))});
 body=[{sequence:1,controller_id:'a',source:'simulator',kind:'created',channel_id:null,command_id:null,reason:null,created_at:100}];assert.equal((await c.events('a'))[0].sequence,1);
 body[0].controller_id='b';await assert.rejects(c.events('a'),e=>e.code==='invalid_response');
 body=[{sequence:1,source:'simulator',measured_at:100,channels:{CH1:1.8,CH2:0,CH3:2.4}}];assert.equal((await c.measurements('a'))[0].channels.CH2,0);
 for(const change of [{source:'hardware'},{sequence:1.5},{channels:{CH1:-1,CH2:0,CH3:2.4}}]){const good=body[0];body=[{...good,...change}];await assert.rejects(c.measurements('a'),e=>e.code==='invalid_response');body=[good];}
});
test('logout clears synchronously and a delayed old logout cannot clear a new owner session',async()=>{
 const slow=deferred();const {workspace:w}=fixture({logout:()=>slow.promise});await signed(w);await w.select('a');
 const old=w.logout();assert.equal(w.getState().snapshot,null);assert.equal(w.getState().kind,'unconfigured');
 await signed(w);await w.select('b');slow.resolve();await old;assert.equal(w.getState().snapshot.controller_id,'b');
});
test('cancelled navigation reads abort; late ignored-abort response cannot commit',async()=>{
 const slow=deferred();let signal;
 const {workspace:w}=fixture({snapshot:(_id,options)=>{signal=options.signal;return slow.promise;}});await signed(w);
 const read=w.select('a');w.cancelReads();assert.equal(signal.aborted,true);slow.resolve(snapshot());await read;assert.equal(w.getState().snapshot,null);assert.equal(w.getState().refreshing,false);
});
test('mutation ambiguity survives navigation read cancellation and blocks another POST',async()=>{
 const slow=deferred();let posts=0;const {workspace:w}=fixture({command:()=>{posts++;return slow.promise;}});await signed(w);await w.select('a');
 const command=w.command('CH1',false);w.cancelReads();slow.resolve(Promise.reject(new ApiError('network_error')));await command;
 assert.equal(w.getState().uncertain,true);await w.command('CH1',false);assert.equal(posts,1);
});
test('simultaneous foreground refreshes deduplicate in flight and never manufacture telemetry',async()=>{
 let calls=0;const slow=deferred();const {client,workspace:w}=fixture();await signed(w);await w.select('a');
 client.snapshot=async()=>{calls++;return slow.promise;};const reads=[w.refresh(),w.refresh(),w.refresh()];slow.resolve(snapshot());await Promise.all(reads);assert.equal(calls,1);
});
test('accepted requested record stays visible if following history GET fails',async()=>{
 const {client,workspace:w}=fixture();await signed(w);await w.select('a');
 client.command=async()=>({id:'accepted',controller_id:'a',channel_id:'CH1',status:'requested',on:false,transitions:[]});
 client.commands=async()=>{throw new ApiError('network_error');};await w.command('CH1',false);
 assert.equal(w.getState().commands[0]?.id,'accepted');assert.equal(w.getState().commands[0]?.status,'requested');
});
test('server snapshot retains actual manual priority and per-channel hold for scheduler views',()=>{
 const raw={...snapshot(),manual_priority_minutes:30};raw.channels[0].manual_until=250;
 const parsed=parseSnapshot(raw);assert.equal(parsed.manual_priority_minutes,30);assert.equal(parsed.channels[0].manual_until,250);
 for(const invalid of [-1,NaN,Infinity]){raw.channels[0].manual_until=invalid;assert.throws(()=>parseSnapshot(raw),e=>e.code==='invalid_response');}
});
