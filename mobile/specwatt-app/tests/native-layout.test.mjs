import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual wrapper with tiny platform mocks: native Reanimated normalizes
// style to an array before forwarding it, so callback styles must be resolved.
function motionHarness() {
  const states = [];
  let cursor = 0;
  const react = {
    createContext: () => ({}), useContext: () => false, useEffect: () => {},
    useState: initial => { const index = cursor++; return [states[index] ?? initial, value => { states[index] = value; }]; },
    createElement: (type, props, ...children) => ({type, props: {...props, children}}),
  };
  const reanimated = {
    createAnimatedComponent: component => component,
    cancelAnimation: () => {}, useSharedValue: value => ({value, set() {}}),
    useAnimatedStyle: callback => callback(), withTiming: value => value,
    withSpring: value => value, ReduceMotion: {System: 'system'},
  };
  const mocks = {
    react,
    'react-native': {Pressable: 'Pressable', TextInput: 'TextInput', Platform: {OS: 'web'}},
    'react-native-reanimated': {...reanimated, default: reanimated},
    'react-native-svg': {Path: 'Path', Rect: 'Rect'},
    'expo-haptics': {},
    './motion-tokens': {motion: {pressScale: .98, spring: {}}, motionDuration: () => 0},
  };
  const source = fs.readFileSync(new URL('../src/specwatt/motion.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true}}).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: name => mocks[name]});
  return props => { cursor = 0; return exports.MotionPressable(props); };
}

test('native pressable preserves card geometry and press-state colors through Reanimated', () => {
  const render = motionHarness();
  const geometry = {position: 'absolute', width: '54%', top: 28, bottom: 0};
  let node = render({style: geometry});
  assert.ok(Array.isArray(node.props.style), 'Reanimated must receive concrete styles');
  assert.equal(node.props.style[0], geometry);
  const style = ({pressed}) => [{height: 54, flex: 1}, {backgroundColor: pressed ? '#pressed' : '#idle'}];
  node = render({style});
  assert.equal(node.props.style[0][1].backgroundColor, '#idle');
  node.props.onPressIn({});
  node = render({style});
  assert.equal(node.props.style[0][1].backgroundColor, '#pressed');
  node.props.onPressOut({});
  node = render({style});
  assert.equal(node.props.style[0][1].backgroundColor, '#idle');
});

test('all SVG gradient offsets use Android-compatible numeric or percentage values', () => {
  const source = fs.readFileSync(new URL('../src/specwatt/illustrations/DeviceIllustration.tsx', import.meta.url), 'utf8');
  const offsets = [...source.matchAll(/\boffset="([^"]+)"/g)].map(match => match[1]);
  assert.ok(offsets.length > 10);
  for (const offset of offsets) assert.match(offset, /^(?:0(?:\.\d+)?|1(?:\.0+)?|\d+(?:\.\d+)?%)$/, offset);
});

test('device visuals use SVG unless an explicit owned photo is chosen', () => {
  const react = {useState: () => ['', () => {}], createElement: (type, props, ...children) => ({type, props: {...props, children}})};
  const mocks = {
    react, 'react-native': {Image: 'Image', View: 'View'},
    'expo-linear-gradient': {LinearGradient: 'Gradient'},
    './illustrations': {DeviceIllustration: 'Vector', defaultIllustration: categoryId => ({categoryId})},
    './photos': {devicePhotoExists: uri => uri === 'file:///owned.jpg'},
    './appearance-policy': {validateAppearance: value => value ?? null},
    './images': {imageMap: {lamp: 123, 'led-strip': 456}},
  };
  const source = fs.readFileSync(new URL('../src/specwatt/device-visual.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true}}).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: name => mocks[name]});
  const render = assigned => exports.DeviceVisual({assignment: assigned, id: 'CH1'}).props.children.at(-1);
  assert.equal(render({image: 'lamp'}).type, 'Vector');
  assert.equal(render({image: 'lamp', appearance: {kind: 'vector', config: {categoryId: 'fan'}}}).type, 'Vector');
  assert.equal(render({image: 'lamp', appearance: {kind: 'photo', uri: 'file:///owned.jpg'}}).props.source.uri, 'file:///owned.jpg');
  assert.equal(render({image: 'lamp', appearance: {kind: 'photo', uri: 'file:///missing.jpg'}}).type, 'Vector');
  assert.equal(render({image: '../../unsafe'}).type, 'Vector');
});
