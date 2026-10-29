import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(initial='active') {
 let cleanup,change,reads=0,cancels=0,finish;
 const timers=new Set();
 const appState={currentState:initial,addEventListener:(_event,fn)=>{change=next=>{appState.currentState=next;fn(next);};return{remove(){}};}};
 const workspace={getState:()=>({kind:'server-simulator',selectedId:'a'}),subscribe(){},refresh:()=>{reads++;return new Promise(resolve=>{finish=resolve;});},cancelReads:()=>cancels++};
 const mocks={react:{createContext:()=>({}),useCallback:fn=>fn,useContext:()=>workspace,useSyncExternalStore:(_subscribe,get)=>get()},'react-native':{AppState:appState},'expo-router':{useFocusEffect:fn=>{cleanup=fn();}},'expo-crypto':{},'./api':{},'./live-workspace':{LIVE_POLL_MS:10000}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/specwatt/live-context.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:name=>mocks[name],setTimeout:(fn,ms)=>{const t={fn,ms};timers.add(t);return t;},clearTimeout:t=>timers.delete(t)});
 exports.useLivePolling();
 return {timers,change:next=>change(next),cleanup:()=>cleanup(),finish:()=>finish(),takeFinish:()=>finish,get reads(){return reads;},get cancels(){return cancels;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('focused foreground poll waits for GET completion, uses ten seconds and stops on blur',async()=>{
 const h=harness();assert.equal(h.reads,1);assert.equal(h.timers.size,0);h.finish();await flush();assert.equal(h.timers.size,1);assert.equal([...h.timers][0].ms,10000);h.cleanup();assert.equal(h.timers.size,0);assert.equal(h.cancels,1);
});
test('background has no polling; stale completion after resume cannot create a second timer',async()=>{
 const h=harness('background');assert.equal(h.reads,0);h.change('active');const finishOld=h.takeFinish();
 h.change('background');h.change('active');finishOld();await flush();h.finish();await flush();
 assert.equal(h.timers.size,1);h.cleanup();
});
