import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as i18n from '../src/specwatt/i18n.ts';
import * as defaultDraftModule from '../src/specwatt/localization/default-draft.ts';

// Component harness: transpiles real screen sources and runs them with tiny
// platform mocks (same approach as tests/native-layout.test.mjs). Provenance:
// node --test with mocked react/react-native — a functional test, not an
// emulator screenshot.
const transpile = (relPath) => {
  const source = fs.readFileSync(new URL(relPath, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
};

const reactMock = ({ runEffects = true } = {}) => {
  const states = [];
  let cursor = 0;
  const react = {
    useState: (initial) => {
      const i = cursor++;
      return [states[i] ?? initial, (v) => { states[i] = v; }];
    },
    useRef: (v) => ({ current: v }),
    useEffect: (fn) => { if (runEffects) fn(); },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    createElement: (type, props, ...children) => ({
      type: typeof type === 'function' && type.tag ? type.tag : type,
      props: { ...props, children },
    }),
  };
  return {
    react,
    rerender: () => { cursor = 0; },
    states,
  };
};

const flatten = (node, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  out.push(node);
  flatten(node.props?.children, out);
  return out;
};
const treeText = (tree) => JSON.stringify(tree);
const findAll = (tree, predicate) => flatten(tree).filter(predicate);
const find = (tree, predicate) => findAll(tree, predicate)[0];
const isType = (type) => (node) => node?.type === type;

const component = (type) => {
  const fn = (props) => ({ type, props: { ...props } });
  fn.tag = type; // resolved back by the mocked createElement
  return fn;
};
const themeMock = {
  bg: '#181A18', surface: '#242623', raised: '#302D28', peach: '#FFAA69',
  line: '#41433D', text: '#F4F4F2', muted: '#A5A69F', dim: '#8D908B',
  ink: '#22201D', error: '#F27C67', r: { card: 23, pill: 30, tile: 19 },
  font: 'Arimo',
};
const styMock = {
  screen: {}, body: {}, row: {}, card: {}, field: {}, button: {},
  buttonText: {}, heading: {}, title: {}, sub: {}, eyebrow: {},
};

function indexHarness(store) {
  const mirrorCalls = { remember: [] };
  const { react, rerender } = reactMock();
  const routerCalls = { replace: [], push: [] };
  const mocks = {
    react: react,
    'react-native': {
      View: component('View'), ScrollView: component('ScrollView'),
      TextInput: component('TextInput'), KeyboardAvoidingView: component('KeyboardAvoidingView'),
      Platform: { OS: 'android' }, useWindowDimensions: () => ({ height: 900, width: 400 }),
    },
    'react-native-safe-area-context': {
      SafeAreaView: component('SafeArea'), useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
    },
    'expo-router': { router: { replace: (x) => routerCalls.replace.push(x), push: (x) => routerCalls.push.push(x) } },
    '../specwatt/motion': { MotionPressable: component('Pressable') },
    '../specwatt/ui': {
      Copy: component('Copy'), CTA: component('CTA'),
      Panel: component('Panel'), Photo: component('Photo'),
    },
    '../specwatt/theme': { theme: themeMock, sty: styMock },
    '../specwatt/images': { imageMap: { 'lamp-scene': 0 } },
    '../specwatt/store': { useSpec: () => store },
    '../specwatt/i18n': i18n,
    '../specwatt/localization/locale-mirror': {
      // The real module imports AsyncStorage (native); the harness mirrors
      // its exact policy: store update + fire-and-forget mirror write.
      recallLocale: async () => store.__mirrorLocale ?? null,
      rememberLocale: (locale) => mirrorCalls.remember.push(locale),
      applyLocale: (setLocale, locale) => { setLocale(locale); mirrorCalls.remember.push(locale); },
    },
  };
  const exports = {};
  vm.runInNewContext(transpile('../src/app/index.tsx'), {
    exports,
    require: (name) => {
      if (name in mocks) return mocks[name];
      throw new Error(`unexpected require: ${name}`);
    },
  });
  const render = () => { rerender(); return exports.default({}); };
  return { render, routerCalls, mirrorCalls, states: react.states };
}

const storeBase = (overrides = {}) => ({
  data: { locale: 'ky', source: 'none', onboarded: false },
  ready: true,
  storageError: null,
  setLocale: () => {},
  enterDemo: () => {},
  setOnboarded: () => {},
  ...overrides,
});

test('KY onboarding welcome page shows Kyrgyz feature badges, never Russian ones', () => {
  const store = storeBase();
  const { render } = indexHarness(store);
  const tree = render();
  const text = treeText(tree);
  assert.ok(text.includes('Жүктөм'), 'KY badge "Жүктөм" must render');
  assert.ok(text.includes('Баары иштейт'), 'KY welcome title must render');
  assert.ok(!text.includes('Нагрузка'), 'hardcoded Russian badge leaked into KY onboarding');
  assert.ok(!text.includes('Всё работает'), 'hardcoded Russian title leaked into KY onboarding');
});

test('language cards expose role, label, selected state and mirror the choice', () => {
  const setLocale = [];
  const store = storeBase({ setLocale: (x) => setLocale.push(x) });
  const { render, mirrorCalls } = indexHarness(store);
  let tree = render();
  const next = find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ky', 'next'));
  assert.ok(next, 'welcome CTA must use the dictionary');
  next.props.onPress();
  tree = render();
  const cards = findAll(tree, (n) => isType('Pressable')(n) && n.props.accessibilityRole === 'button');
  const labels = cards.map((c) => c.props.accessibilityLabel).sort();
  assert.deepEqual(labels, ['Кыргызча', 'Русский'], 'cards must be named for screen readers');
  const kyCard = cards.find((c) => c.props.accessibilityLabel === 'Кыргызча');
  assert.equal(kyCard.props.accessibilityState.selected, true, 'current locale must be announced');
  const ruCard = cards.find((c) => c.props.accessibilityLabel === 'Русский');
  assert.equal(ruCard.props.accessibilityState.selected, false);
  assert.ok(kyCard.props.accessibilityHint, 'cards must carry a screen reader hint');
  ruCard.props.onPress();
  assert.deepEqual(setLocale, ['ru']);
  assert.deepEqual(mirrorCalls.remember, ['ru'], 'locale choice must be mirrored for recovery');
});

test('login form inputs carry accessibility labels and errors are announced', () => {
  const store = storeBase();
  const { render, states } = indexHarness(store);
  let tree = render();
  find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ky', 'loginUnavailable')).props.onPress();
  tree = render();
  const labels = findAll(tree, isType('TextInput')).map((n) => n.props.accessibilityLabel);
  assert.ok(labels.includes(i18n.t('ky', 'email')), 'email input needs a label');
  assert.ok(labels.includes(i18n.t('ky', 'password')), 'password input needs a label');
  // Trigger a validation error through the real submit handler.
  const submit = find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ky', 'loginTitle'));
  assert.ok(submit, 'login submit must use the dictionary');
  submit.props.onPress();
  tree = render();
  const live = find(tree, (n) => isType('Copy')(n) && n.props.accessibilityLiveRegion === 'polite');
  assert.ok(live, 'validation error must be a live region');
  assert.ok(treeText(live).includes(i18n.t('ky', 'errEmail')));
});

test('failed storage read restores the mirrored locale instead of resetting to Russian', async () => {
  const setLocale = [];
  const store = storeBase({
    storageError: 'read-error',
    data: { locale: 'ru', source: 'none', onboarded: false },
    setLocale: (x) => setLocale.push(x),
    __mirrorLocale: 'ky',
  });
  const { render } = indexHarness(store);
  render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(setLocale, ['ky'], 'mirror must restore KY after corrupted storage');
});

test('healthy storage never overrides the stored locale with the mirror', async () => {
  const setLocale = [];
  const store = storeBase({
    data: { locale: 'ru', source: 'none', onboarded: false },
    setLocale: (x) => setLocale.push(x),
    __mirrorLocale: 'ky',
  });
  const { render } = indexHarness(store);
  render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(setLocale, [], 'mirror must not fight healthy stored state');
});

function setupHarness(store) {
  const { react, rerender } = reactMock();
  const routerCalls = { push: [], replace: [], back: [] };
  const mocks = {
    react: react,
    'react-native': {
      View: component('View'), ScrollView: component('ScrollView'), TextInput: component('TextInput'),
    },
    'react-native-safe-area-context': { SafeAreaView: component('SafeArea') },
    'expo-router': {
      router: {
        push: (x) => routerCalls.push.push(x),
        replace: (x) => routerCalls.replace.push(x),
        back: () => routerCalls.back.push(1),
      },
      useLocalSearchParams: () => ({}),
      useFocusEffect: (fn) => fn(),
    },
    '../specwatt/motion': { MotionPressable: component('Pressable') },
    '../specwatt/device-visual': {
      DeviceVisual: component('DeviceVisual'),
      defaultDeviceConfig: () => ({}),
    },
    '../specwatt/illustrations': { validateIllustrationConfig: () => null },
    '../specwatt/photos': { importDevicePhoto: async () => null, pruneDevicePhotos: () => {} },
    '../specwatt/mobile-ui': { Toggle: component('Toggle') },
    '../specwatt/ui': { Copy: component('Copy'), CTA: component('CTA'), Panel: component('Panel') },
    '../specwatt/theme': { theme: themeMock, sty: styMock },
    '../specwatt/store': { useSpec: () => store },
    '../specwatt/i18n': i18n,
    '../specwatt/localization/default-draft': defaultDraftModule,
  };
  const exports = {};
  vm.runInNewContext(transpile('../src/app/setup.tsx'), {
    exports,
    require: (name) => {
      if (name in mocks) return mocks[name];
      throw new Error(`unexpected require: ${name}`);
    },
  });
  const render = () => { rerender(); return exports.default({}); };
  return { render, routerCalls };
}

const setupStore = (overrides = {}) => ({
  data: {
    locale: 'ky',
    source: 'none', // first run: the user opens setup before any demo exists
    channels: [
      { id: 'CH1', protected: false, assigned: null },
      { id: 'CH2', protected: false, assigned: null },
      { id: 'CH3', protected: true, assigned: null },
    ],
  },
  enterDemo: () => {},
  assign: () => {},
  ...overrides,
});

test('KY setup flow is fully Kyrgyz: overview, channels, assignment draft', () => {
  const enterDemoCalls = [];
  const store = setupStore({ enterDemo: () => enterDemoCalls.push(1) });
  const { render } = setupHarness(store);
  let tree = render();
  let text = treeText(tree);
  assert.ok(text.includes('Стендди туташтыруу'), 'KY setup title');
  assert.ok(!text.includes('Подключение стенда'), 'Russian setup title leaked under KY');
  const open = find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ky', 'openSimulation'));
  assert.ok(open, 'open-simulation CTA must use the dictionary');
  open.props.onPress();
  assert.equal(enterDemoCalls.length, 1, 'opening the simulation must enter demo from source none');
  tree = render();
  text = treeText(tree);
  assert.ok(text.includes('Стенддин каналдары'), 'KY channels title');
  assert.ok(!text.includes('Каналы стенда'), 'Russian channels title leaked under KY');
  const ch1 = find(tree, (n) => isType('Pressable')(n) && treeText(n).includes('CH1') && n.props.onPress);
  assert.ok(ch1, 'channel card must be pressable');
  ch1.props.onPress();
  tree = render();
  text = treeText(tree);
  assert.ok(text.includes('Түзмөктү жөндөө'), 'KY assignment title');
  assert.ok(!text.includes('Настроить прибор'), 'Russian assignment title leaked under KY');
});

test('KY assignment draft starts with a Kyrgyz default room name', () => {
  const store = setupStore();
  const { render } = setupHarness(store);
  let tree = render();
  find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ky', 'openSimulation')).props.onPress();
  tree = render();
  find(tree, (n) => isType('Pressable')(n) && treeText(n).includes('CH1') && n.props.onPress).props.onPress();
  tree = render();
  const inputs = findAll(tree, isType('TextInput'));
  const name = inputs.find((n) => n.props.accessibilityLabel === i18n.t('ky', 'deviceName'));
  const room = inputs.find((n) => n.props.accessibilityLabel === i18n.t('ky', 'room'));
  assert.ok(name, 'device name input needs an accessibility label');
  assert.ok(room, 'room input needs an accessibility label');
  assert.equal(room.props.value, 'Конок бөлмөсү', 'KY draft must not start with the Russian room name');
  assert.ok(!treeText(inputs).includes('Гостиная'), 'Russian default room leaked into KY setup');
});

test('empty assignment name announces a localized validation error', () => {
  const store = setupStore();
  const { render } = setupHarness(store);
  let tree = render();
  find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ky', 'openSimulation')).props.onPress();
  tree = render();
  find(tree, (n) => isType('Pressable')(n) && treeText(n).includes('CH1') && n.props.onPress).props.onPress();
  tree = render();
  find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ky', 'finish')).props.onPress();
  tree = render();
  const live = find(tree, (n) => isType('Copy')(n) && n.props.accessibilityLiveRegion === 'polite');
  assert.ok(live, 'validation error must be a live region');
  assert.ok(treeText(live).includes(i18n.t('ky', 'errName')));
});

test('setup back button leaves the screen from the overview step', () => {
  const store = setupStore();
  const { render, routerCalls } = setupHarness(store);
  const tree = render();
  const back = find(
    tree,
    (n) => isType('Pressable')(n) && treeText(n).includes('‹') && n.props.onPress,
  );
  assert.ok(back, 'overview back button must render');
  back.props.onPress();
  assert.equal(routerCalls.back.length, 1, 'overview back must leave via router.back');
});

function settingsHarness(store) {
  const { react, rerender } = reactMock();
  const routerCalls = { push: [], replace: [], back: [] };
  const mirrorCalls = { remember: [] };
  const mocks = {
    react: react,
    'react-native': {
      View: component('View'), TextInput: component('TextInput'),
      Share: { share: async () => ({}) },
    },
    'expo-router': {
      router: {
        push: (x) => routerCalls.push.push(x),
        replace: (x) => routerCalls.replace.push(x),
        canGoBack: () => true,
        back: () => routerCalls.back.push(1),
      },
    },
    '../specwatt/motion': { MotionPressable: component('Pressable') },
    '../specwatt/photos': { clearDevicePhotos: () => {} },
    '../specwatt/ui': { Copy: component('Copy'), CTA: component('CTA') },
    '../specwatt/theme': { theme: themeMock, sty: styMock },
    '../specwatt/store': { useSpec: () => store },
    '../specwatt/i18n': i18n,
    '../specwatt/localization/locale-mirror': {
      recallLocale: async () => null,
      rememberLocale: (locale) => mirrorCalls.remember.push(locale),
      applyLocale: (setLocale, locale) => { setLocale(locale); mirrorCalls.remember.push(locale); },
    },
    '../specwatt/mobile-ui': {
      // Settings must use the centralized dictionary; useWords here is drift.
      useWords: () => {
        throw new Error('settings.tsx must not use useWords');
      },
      Shell: component('Shell'), Header: component('Header'),
      Card: component('Card'), RowLink: component('RowLink'),
      s: { chip: {}, warning: {} },
    },
  };
  const exports = {};
  vm.runInNewContext(transpile('../src/screens/settings.tsx'), {
    exports,
    require: (name) => {
      if (name in mocks) return mocks[name];
      throw new Error(`unexpected require: ${name}`);
    },
  });
  const render = () => { rerender(); return exports.SettingsScreen({}); };
  return { render, routerCalls };
}

test('settings renders fully in Kyrgyz without per-screen word helpers', () => {
  const store = {
    data: { locale: 'ky', source: 'demo', peak: 7, manualMinutes: 30 },
    setLocale: () => {}, setPeak: () => {}, setManualMinutes: () => {}, leaveDemo: () => {},
  };
  const { render } = settingsHarness(store);
  const text = treeText(render());
  assert.ok(text.includes('Жөндөөлөр'), 'KY settings title');
  assert.ok(text.includes('Интерфейстин тили'), 'KY language section');
  assert.ok(!text.includes('Настройки'), 'Russian settings title leaked under KY');
  assert.ok(!text.includes('Язык интерфейса'), 'Russian language label leaked under KY');
});

test('language chips meet the 44dp press target and expose selected state', () => {
  const setLocale = [];
  const store = {
    data: { locale: 'ky', source: 'demo', peak: 7, manualMinutes: 30 },
    setLocale: (x) => setLocale.push(x), setPeak: () => {}, setManualMinutes: () => {}, leaveDemo: () => {},
  };
  const { render } = settingsHarness(store);
  const tree = render();
  const chips = findAll(tree, (n) => isType('Pressable')(n) && n.props.accessibilityRole === 'button');
  assert.equal(chips.length, 2);
  const kyChip = chips.find((c) => treeText(c).includes('Кыргызча'));
  assert.equal(kyChip.props.accessibilityState.selected, true);
  const heights = chips.map((c) =>
    (Array.isArray(c.props.style) ? c.props.style : [c.props.style]).some(
      (part) => part && part.minHeight >= 44,
    ),
  );
  assert.deepEqual(heights, [true, true], 'both chips need a >=44dp press target');
  const ruChip = chips.find((c) => treeText(c).includes('Русский'));
  ruChip.props.onPress();
  assert.deepEqual(setLocale, ['ru']);
});

test('RU→KY→RU switching in settings keeps values and announces results', () => {
  const calls = [];
  const store = {
    data: { locale: 'ru', source: 'demo', peak: 7, manualMinutes: 30 },
    setLocale: (x) => { store.data.locale = x; calls.push(['locale', x]); },
    setPeak: (v) => calls.push(['peak', v]),
    setManualMinutes: (v) => calls.push(['hold', v]),
    leaveDemo: () => calls.push(['leaveDemo']),
  };
  const { render } = settingsHarness(store);
  let tree = render();
  const chips = findAll(tree, (n) => isType('Pressable')(n) && n.props.accessibilityRole === 'button');
  chips.find((c) => treeText(c).includes('Кыргызча')).props.onPress();
  store.data.locale = 'ky';
  tree = render();
  assert.ok(treeText(tree).includes('Коопсуз координация'), 'KY coordination section');
  chips.find((c) => treeText(c).includes('Русский')).props.onPress();
  store.data.locale = 'ru';
  tree = render();
  assert.ok(treeText(tree).includes('Безопасная координация'), 'RU coordination section');
  const save = find(tree, (n) => isType('CTA')(n) && n.props.label === i18n.t('ru', 'saveLimits'));
  save.props.onPress();
  assert.deepEqual(calls.slice(-2), [['peak', 7], ['hold', 30]]);
});

test('settings back navigation uses router history when it exists', () => {
  const store = {
    data: { locale: 'ru', source: 'demo', peak: 7, manualMinutes: 30 },
    setLocale: () => {}, setPeak: () => {}, setManualMinutes: () => {}, leaveDemo: () => {},
  };
  const { render, routerCalls } = settingsHarness(store);
  const tree = render();
  const header = find(tree, isType('Header'));
  assert.ok(header, 'settings header must render');
  header.props.onPress();
  assert.equal(routerCalls.back.length, 1, 'back must go through router history');
});
