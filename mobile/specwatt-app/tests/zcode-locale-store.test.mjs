import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../src/specwatt/model.ts';
import * as mirror from '../src/specwatt/localization/locale-mirror.ts';

const KEY = 'specwatt-mobile-v1';
const MIRROR = mirror.MIRROR_KEY;
const tick = async () => { await new Promise((resolve) => setImmediate(resolve)); };

test('serialized provider persists unfinished step and language together across remount', async () => {
  const h = mount();
  h.render(); await tick();
  let ctx = h.render();
  ctx.setFirstRunStep('insight'); ctx.setLocale('ky');
  h.render(); await tick();
  ctx = h.render(); ctx.setFirstRunStep('controller');
  h.render(); await tick();
  const next = mount(h.table); next.render(); await tick();
  const restored = next.render();
  assert.equal(restored.data.firstRunStep,'controller');
  assert.equal(restored.data.locale,'ky');
  assert.equal(restored.data.onboarded,false);
  assert.equal(restored.data.channels.length,0);
});

function mount(initial = {}, opts = {}) {
  const table = { ...initial };
  const writes = [];
  const slots = [];
  const effects = [];
  let cursor = 0;
  const storage = {
    async getItem(key) {
      if (key === KEY && opts.failPrimaryRead) throw Error('primary-read-failed');
      if (key === MIRROR && opts.failMirrorRead) throw Error('mirror-read-failed');
      return Object.hasOwn(table, key) ? table[key] : null;
    },
    async setItem(key, value) {
      if (key === KEY && opts.failPrimaryWrite) throw Error('primary-write-failed');
      writes.push([key, value]);
      table[key] = value;
    },
  };
  const react = {
    createContext: () => ({ Provider: Symbol('provider') }),
    useContext: () => null,
    useState(initialState) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initialState === 'function' ? initialState() : initialState };
      return [slots[i].value, (change) => {
        slots[i].value = typeof change === 'function' ? change(slots[i].value) : change;
      }];
    },
    useRef(initialRef) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: { current: initialRef } };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      const prev = slots[i]?.value;
      if (!prev || !deps?.every((value, j) => Object.is(prev[j], value))) {
        slots[i] = { value: deps };
        effects.push(fn);
      }
    },
    useMemo(fn) { return fn(); },
    createElement: (_type, props) => ({ props }),
  };
  const source = fs.readFileSync(new URL('../src/specwatt/store.tsx', import.meta.url), 'utf-8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(transpiled, {
    exports,
    require: (name) => {
      if (name === 'react') return react;
      if (name === '@react-native-async-storage/async-storage') return { default: storage, __esModule: true };
      if (name === './model') return model;
      if (name === './localization/locale-mirror') return mirror;
      throw Error('unexpected import: ' + name);
    },
  });
  function render() {
    cursor = 0;
    const tree = exports.SpecProvider({ children: null });
    const toRun = effects.splice(0);
    for (const fn of toRun) fn();
    return tree.props.value;
  }
  return { render, table, writes, storage };
}

test('healthy persisted locale wins over stale mirror without data loss', async () => {
  const state = model.demoState('ru');
  const h = mount({ [KEY]: JSON.stringify(state), [MIRROR]: 'ky' });
  h.render();
  await tick();
  const ctx = h.render();
  assert.equal(ctx.ready, true);
  assert.equal(ctx.data.locale, 'ru');
  assert.equal(ctx.data.source, 'demo');
  assert.equal(ctx.data.channels.length, 3);
  await tick();
  assert.equal(h.table[MIRROR], 'ru');
});

test('missing main state restores only locale, not remembered permissions', async () => {
  const h = mount({ [MIRROR]: 'ky' });
  h.render();
  await tick();
  const ctx = h.render();
  assert.equal(ctx.ready, true);
  assert.equal(ctx.data.locale, 'ky');
  assert.equal(ctx.data.source, 'none');
  assert.deepEqual(Array.from(ctx.data.channels), []);
});

test('corrupted JSON restores Kyrgyz while refusing unsafe demo state', async () => {
  const h = mount({ [KEY]: '{broken', [MIRROR]: 'ky' });
  h.render();
  await tick();
  const ctx = h.render();
  assert.equal(ctx.data.locale, 'ky');
  assert.equal(ctx.data.source, 'none');
  assert.equal(ctx.storageError, 'invalid-storage');
});

test('valid locale embedded in invalid demo state wins over old mirror', async () => {
  const h = mount({ [KEY]: JSON.stringify({ locale: 'ky', source: 'demo', onboarded: true, channels: [] }), [MIRROR]: 'ru' });
  h.render();
  await tick();
  const ctx = h.render();
  assert.equal(ctx.data.locale, 'ky');
  assert.equal(ctx.data.source, 'none');
  assert.equal(ctx.data.onboarded, false, 'corrupt data must not bypass onboarding');
  assert.equal(ctx.storageError, 'invalid-storage');
});

test('primary read failure falls back to isolated locale key', async () => {
  const h = mount({ [MIRROR]: 'ky' }, { failPrimaryRead: true });
  h.render();
  await tick();
  const ctx = h.render();
  assert.equal(ctx.data.locale, 'ky');
  assert.equal(ctx.storageError, 'read-error');
});

test('locale changes and state snapshots commit in a single serialized write sequence', async () => {
  const h = mount({});
  h.render();
  await tick();
  let ctx = h.render();
  ctx.setLocale('ky');
  ctx = h.render();
  ctx.setLocale('ru');
  ctx = h.render();
  ctx.setLocale('ky');
  h.render();
  for (let i=0;i<7;i++) await tick();
  const saved = JSON.parse(h.table[KEY]);
  assert.equal(saved.locale, 'ky');
  assert.equal(h.table[MIRROR], 'ky');
  for (let i=0;i<h.writes.length;i+=2) {
    assert.equal(h.writes[i][0], KEY, 'main store must be written first');
    assert.equal(h.writes[i+1][0], MIRROR, 'mirror must follow state in write queue');
  }
});

test('failed main write can still persist a safe locale recovery value', async () => {
  const h = mount({ [MIRROR]: 'ky' }, { failPrimaryWrite: true });
  h.render();
  await tick();
  const ctx = h.render();
  for(let i=0;i<4;i++) await tick();
  assert.equal(h.table[MIRROR], 'ky');
  assert.equal(h.render().storageError, 'write-error');
});
