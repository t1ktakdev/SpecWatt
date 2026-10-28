import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {chartScale,chartValue} from '../src/specwatt/chart-layout.ts';
import {demoState} from '../src/specwatt/model.ts';
import {createDemoHistory,integratePower} from '../src/specwatt/energy.ts';

function harness(fontScale, locale='ru') {
 const exports={};
 const mocks={
  react:{createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:x=>[x,()=>{}],useMemo:fn=>fn()},
  'react-native':{View:'View',ScrollView:'ScrollView',StyleSheet:{create:x=>x},useWindowDimensions:()=>({width:320,fontScale})},
  'react-native-reanimated':{}, 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  'expo-router':{usePathname:()=>'/devices'},'expo-linear-gradient':{},
  'react-native-svg':{default:'Svg',__esModule:true,Path:'Path',Circle:'Circle',Line:'Line',Text:'SvgLabel'},
  './motion':{ChartBar:'Bar'},'./motion-tokens':{},'./ui':{Copy:'Copy'},
  './theme':{theme:{r:{card:20}}},'./store':{useSpec:()=>({data:demoState(locale)})},
  './chart-layout':{chartScale,chartValue},'./energy':{createDemoHistory,integratePower},
 };
 const code=ts.transpileModule(fs.readFileSync(new URL('../src/specwatt/mobile-ui.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require:n=>{if(!mocks[n])throw Error(n);return mocks[n];}});
 const flatten=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(flatten):[n,...flatten(n.props?.children)];
 return {exports,flatten};
}
for(const scale of [1,1.3,1.5,2]) {
 test(`both charts scale labels and scroll extent at fontScale ${scale}`,()=>{
  const {exports,flatten}=harness(scale);
  for(const tree of [exports.HistoryChart(),exports.ComparisonChart({before:[0,null,27,4],after:[0,7,13,4],labels:['14:00','14:30','15:00','15:30']})]) {
   const nodes=flatten(tree),svg=nodes.find(n=>n.type==='Svg');
   assert.ok(svg);
   const labels=nodes.filter(n=>n.type==='SvgLabel');
   assert.ok(labels.length>4);
   for(const label of labels) {
    assert.ok(label.props.fontSize>=12*scale);
    assert.ok(label.props.y<=svg.props.height);
   }
   assert.ok(svg.props.width>=240*scale);
  }
 });
}

test('fixed demo history never claims to be measurements from today in either locale',()=>{
 for(const locale of ['ru','ky']) {
  const {exports,flatten}=harness(1,locale);
  const copies=flatten(exports.HistoryChart()).filter(n=>n.type==='Copy');
  const text=copies.map(n=>n.props.children.flat().join('')).join(' ');
  assert.doesNotMatch(text,/сегодня|бүгүнкү/i);
  assert.match(text,/демо/i);
 }
});
test('narrow navigation has readable short labels; large text gets one full-width selected label',()=>{
 for(const scale of [1,1.5,2]) {
  const {exports,flatten}=harness(scale);
  const nodes=flatten(exports.BottomNav({active:'/devices'}));
  const labels=nodes.filter(n=>n.type==='Copy').map(n=>n.props.children.flat().join(''));
  assert.deepEqual(labels,scale===1?['Главная','Техника','Авто','План','Журнал']:['Устройства']);
  assert.equal(nodes.filter(n=>n.props?.accessibilityRole==='tab').length,5);
 }
});
