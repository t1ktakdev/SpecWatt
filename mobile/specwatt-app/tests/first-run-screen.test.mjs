import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {t} from '../src/specwatt/i18n.ts';
import {emptyState,reduceState} from '../src/specwatt/model.ts';

function harness(locale='ru',state={}) {
 const calls=[];
 const store={data:{...emptyState(),locale,...state},ready:true,storageError:null,
  setLocale(value){this.data=reduceState(this.data,{type:'locale',value});},
  setFirstRunStep(value){store.data=reduceState(store.data,{type:'first-run-step',value});},
  setOnboarded(){calls.push('complete');store.data=reduceState(store.data,{type:'onboarded'});},
  enterDemo(){calls.push('demo');store.data=reduceState(store.data,{type:'enter-demo'});},
 };
 // Functions from context are intentionally safe to destructure, as in SpecProvider.
 store.setLocale=value=>{store.data=reduceState(store.data,{type:'locale',value});};
 const react={useState:v=>[v,()=>{}],useEffect:fn=>fn(),useRef:v=>({current:v}),
  createElement:(type,props,...children)=>({type,props:{...props,children}})};
 const mocks={react,'react-native':{View:'View',ScrollView:'Scroll',TextInput:'Input',KeyboardAvoidingView:'Keyboard',Platform:{OS:'web'},useWindowDimensions:()=>({width:320,height:700,fontScale:1.5})},
  'react-native-safe-area-context':{SafeAreaView:'Safe',useSafeAreaInsets:()=>({top:0,bottom:0})},
  'expo-router':{router:{push:p=>calls.push(p),replace:p=>calls.push(p)}},
  '../specwatt/motion':{MotionPressable:'Pressable',Reveal:'Reveal'},
  '../specwatt/ui':{Copy:'Copy',CTA:'CTA',Panel:'Panel',Photo:'Photo'},
  '../specwatt/theme':{theme:{},sty:{}},'../specwatt/images':{imageMap:{}},
  '../specwatt/store':{useSpec:()=>store},'../specwatt/i18n':{t},
  '../specwatt/localization/locale-mirror':{applyLocale:(set,value)=>set(value)},
 };
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/index.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:n=>{if(!mocks[n])throw Error(n);return mocks[n];}});
 const flatten=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(flatten):[n,...flatten(n.props?.children)];
 const render=()=>flatten(exports.default());
 const click=label=>{const n=render().find(n=>n.props?.label===label||n.props?.accessibilityLabel===label);assert.ok(n,`action missing: ${label}`);n.props.onPress();};
 return {store,calls,render,click};
}
for(const locale of ['ru','ky']){
 test(`${locale}: three cards, back and skip reach language without completing or pairing`,()=>{
  const h=harness(locale);
  h.click(t(locale,'next')); assert.equal(h.store.data.firstRunStep,'insight');
  h.click(t(locale,'next')); assert.equal(h.store.data.firstRunStep,'safety');
  h.click(t(locale,'back')); assert.equal(h.store.data.firstRunStep,'insight');
  h.click(locale==='ru'?'Пропустить знакомство':'Таанышууну өткөрүү');
  assert.equal(h.store.data.firstRunStep,'locale');
  h.click('Кыргызча'); assert.equal(h.store.data.locale,'ky');
  h.click(t('ky','next')); assert.equal(h.store.data.firstRunStep,'mode');
  h.click(t('ky','real')); assert.equal(h.store.data.firstRunStep,'controller');
  assert.equal(h.store.data.onboarded,false);assert.deepEqual(h.calls,[]);
  assert.match(JSON.stringify(h.render()),/ESP32/);
 });
 test(`${locale}: auth routes to the one real workspace, no simulated credential fields`,()=>{
  const h=harness(locale,{firstRunStep:'mode'});
  h.click(t(locale,'authEntry'));
  assert.deepEqual(h.calls,['/server']);
  assert.equal(h.store.data.onboarded,false);
  assert.equal(h.render().filter(n=>n.type==='Input').length,0);
 });
 test(`${locale}: demo needs no auth and completes only on explicit selection`,()=>{
  const h=harness(locale,{firstRunStep:'mode'});
  h.click(t(locale,'demo'));
  assert.deepEqual(h.calls,['demo','/home']);
  assert.equal(h.store.data.source,'demo');assert.equal(h.store.data.onboarded,true);
  assert.equal(h.store.data.channels[2].assigned.allowAuto,false);
 });
}
