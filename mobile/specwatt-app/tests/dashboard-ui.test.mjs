import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const calls={toggle:[],push:[]};
  const react={useState:x=>[x,()=>{}],createElement:(type,props,...children)=>({type,props:{...props,children}})};
  const names=['Shell','Header','Brand','Gauge','HistoryChart','RowLink','Chips','Empty','Toggle','Icon'];
  const mocks={
    react, 'react-native':{View:'View',useWindowDimensions:()=>({width:320,fontScale:1.5})},
    'expo-router':{router:{push:x=>calls.push.push(x)}},
    '../specwatt/device-visual':{DeviceVisual:'Visual'},
    '../specwatt/motion':{MotionPressable:'Pressable'},
    '../specwatt/ui':{Copy:'Copy'},
    '../specwatt/store':{useSpec:()=>({toggleChannel:id=>calls.toggle.push(id)})},
    '../specwatt/theme':{theme:{peach:'#FFAA69',surface:'#242623',line:'#41433D'}},
    '../specwatt/mobile-ui':{...Object.fromEntries(names.map(n=>[n,n])),useWords:()=>(ru)=>ru,s:{card:{}},formatW:n=>n===null?'—':String(n)},
  };
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(new URL('../src/screens/dashboard.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,require:n=>{if(!mocks[n])throw Error(n);return mocks[n];}});
  const flatten=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(flatten):[n,...flatten(n.props?.children)];
  return {exports,calls,flatten};
}
const channel={id:'CH1',protected:false,watts:1.8,freshness:'fresh',assigned:{name:'Очень длинное название светильника',allowAuto:false}};
test('device switch changes one channel and is outside every detail press target',()=>{
  const {exports,calls,flatten}=harness();
  const tree=exports.DeviceCard({channel});
  const nodes=flatten(tree),toggle=nodes.find(n=>n.type==='Toggle');
  assert.ok(toggle);
  for(const p of nodes.filter(n=>n.type==='Pressable')) assert.ok(!flatten(p).includes(toggle),'toggle must be a sibling of detail action');
  toggle.props.onChange();
  assert.deepEqual(calls.toggle,['CH1']);
  assert.deepEqual(calls.push,[]);
});
test('missing telemetry is never labelled off; CH3 has no switch',()=>{
  const {exports,flatten}=harness();
  const missing=exports.DeviceCard({channel:{...channel,watts:null,freshness:'missing'}});
  assert.match(JSON.stringify(missing),/Нет измерений/);
  assert.doesNotMatch(JSON.stringify(missing),/Выключен/);
  assert.equal(flatten(missing).find(n=>n.type==='Toggle').props.disabled,true);
  const protectedTree=exports.DeviceCard({channel:{...channel,id:'CH3',protected:true}});
  assert.equal(flatten(protectedTree).filter(n=>n.type==='Toggle').length,0);
});
