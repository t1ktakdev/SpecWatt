import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('Reduce Motion disables root and detail/catalog transitions immediately',()=>{
 for(const reduced of [false,true]) {
  const exports={},Stack=Object.assign(()=>{}, {Screen:'Screen'});
  const mocks={react:{createElement:(type,props,...children)=>({type,props:{...props,children}})},
   'react-native-gesture-handler':{},'../specwatt/motion':{useMotion:()=>reduced},
   '../specwatt/motion-tokens':{motion:{duration:{standard:200}}},'expo-router':{Stack},'expo-font':{},
   'react-native':{},'expo-splash-screen':{preventAutoHideAsync:()=>Promise.resolve()},'../specwatt/store':{},'../specwatt/theme':{theme:{}},
  };
  const code=ts.transpileModule(fs.readFileSync(new URL('../src/app/_layout.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,require:n=>{if(!mocks[n])throw Error(n);return mocks[n];}});
  const tree=exports.AppNavigation();
  assert.equal(tree.props.screenOptions.animation,reduced?'none':'fade');
  for(const route of tree.props.children.filter(n=>['device','catalog'].includes(n.props?.name))) assert.equal(route.props.options.animation,reduced?'none':route.props.name==='device'?'slide_from_right':'slide_from_bottom');
 }
});
