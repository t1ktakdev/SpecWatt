import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function mount({loaded=false,error=null,reduce=()=>new Promise(()=>{})}={}) {
 const slots=[],effects=[],timers=[];let cursor=0,hidden=0,started=0;
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{slots[i].value=v;}];},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||!deps.every((v,j)=>Object.is(v,slots[i].deps[j]))){slots[i]={deps};effects.push(fn);}}};
 const mocks={react,'react-native-gesture-handler':{GestureHandlerRootView:'Root'},
  '../specwatt/motion':{MotionProvider:'Motion',useMotion:()=>true},
  '../specwatt/motion-tokens':{motion:{duration:{reveal:200,standard:200}}},
  'expo-router':{Stack:Object.assign('Stack',{Screen:'Screen'})},
  'expo-font':{useFonts:()=>[loaded,error]},
  'react-native':{View:'View',Text:'Text',Animated:{Value:class{},View:'Overlay',sequence:()=>({start(){started++;},stop(){}}),delay:()=>{},timing:()=>{}},AccessibilityInfo:{isReduceMotionEnabled:reduce,addEventListener:()=>({remove(){}})}},
  'expo-splash-screen':{preventAutoHideAsync:()=>Promise.resolve(),hideAsync:()=>{hidden++;return Promise.resolve();}},
  '../specwatt/store':{SpecProvider:'Store'},'../specwatt/theme':{theme:{}},'../assets/specwatt/Arimo.ttf':0};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/_layout.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:n=>mocks[n],setTimeout:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},clearTimeout:timer=>{timer.cleared=true;}});
 const render=()=>{cursor=0;const tree=exports.default();effects.splice(0).forEach(fn=>fn());return tree;};
 return {render,timers,get hidden(){return hidden;},get started(){return started;}};
}
test('stalled font loading releases native splash and mounts navigation within five seconds',()=>{
 const h=mount();h.render();
 assert.ok(h.timers.some(t=>t.ms<=5000),'font startup needs a bounded deadline');
 h.timers.filter(t=>!t.cleared).forEach(t=>t.fn());
 const tree=h.render();assert.ok(h.hidden>0);assert.match(JSON.stringify(tree),/Store/);
});
test('unresolved accessibility query cannot leave the brand overlay forever',()=>{
 const h=mount({loaded:true});h.render();
 assert.ok(h.timers.some(t=>t.ms<=5000),'animation deadline must not depend on an accessibility promise');
 h.timers.filter(t=>!t.cleared).forEach(t=>t.fn());
 assert.doesNotMatch(JSON.stringify(h.render()),/Overlay/);
});
test('Reduce Motion and font failure skip the animated overlay',async()=>{
 for(const options of [{loaded:true,reduce:()=>Promise.resolve(true)},{error:Error('font failed'),reduce:()=>Promise.resolve(false)}]){
  const h=mount(options);h.render();await new Promise(r=>setImmediate(r));
  assert.equal(h.started,0);assert.doesNotMatch(JSON.stringify(h.render()),/Overlay/);assert.ok(h.hidden>0);
 }
});
