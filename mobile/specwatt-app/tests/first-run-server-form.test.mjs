import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as api from '../src/specwatt/api.ts';
import * as scope from '../src/specwatt/server-request-scope.ts';
import {t} from '../src/specwatt/i18n.ts';
function mount(locale){
 const states=[];let cursor=0;
 const react={useMemo:fn=>fn(),useRef:v=>({current:v}),useEffect:()=>{},
  useState:v=>{const i=cursor++;if(!states[i])states[i]={v:typeof v==='function'?v():v};return[states[i].v,value=>{states[i].v=value;}];},
  createElement:(type,props,...children)=>({type,props:{...props,children}})};
 const mocks={react,'react-native':{ActivityIndicator:'Busy',KeyboardAvoidingView:'Keyboard',Platform:{OS:'web'},Pressable:'Pressable',ScrollView:'Scroll',TextInput:'Input',View:'View'},
  'react-native-safe-area-context':{SafeAreaView:'Safe'},'expo-router':{router:{}},
  '../specwatt/api':api,'../specwatt/ui':{Copy:'Copy',CTA:'CTA',Panel:'Panel'},
  '../specwatt/theme':{theme:{},sty:{}},'../specwatt/store':{useSpec:()=>({data:{locale}})},
  './server-schedules':{},'../specwatt/server-request-scope':scope,'../specwatt/i18n':{t}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/screens/server.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:n=>{if(!mocks[n])throw Error(n);return mocks[n];},__DEV__:true});
 const flatten=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(flatten):[n,...flatten(n.props?.children)];
 return ()=>{cursor=0;return flatten(exports.default());};
}
for(const locale of ['ru','ky'])test(`${locale} server form provides secure autofill and reversible show/hide`,()=>{
 const render=mount(locale);
 let tree=render();
 let password=tree.find(n=>n.type==='Input'&&n.props.secureTextEntry);
 assert.equal(password.props.autoComplete,'current-password');
 assert.equal(password.props.maxLength,128);
 assert.equal(tree.find(n=>n.type==='Input'&&n.props.accessibilityLabel==='Email').props.autoComplete,'email');
 let show=tree.find(n=>n.props.label===t(locale,'showPassword'));assert.ok(show);
 show.props.onPress();tree=render();
 password=tree.find(n=>n.type==='Input'&&n.props.autoComplete==='current-password');
 assert.equal(password.props.secureTextEntry,false);
 tree.find(n=>n.props.label===t(locale,'hidePassword')).props.onPress();
 assert.equal(render().find(n=>n.type==='Input'&&n.props.autoComplete==='current-password').props.secureTextEntry,true);
});
