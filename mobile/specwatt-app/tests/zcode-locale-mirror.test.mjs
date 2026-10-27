import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { defaultDraft } from '../src/specwatt/localization/default-draft.ts';

const MIRROR_KEY = 'specwatt-locale-mirror-v1';

// Loads locale-mirror.ts with a controllable AsyncStorage fake. The module
// must keep working when storage itself is broken: the mirror is a recovery
// path for corrupted/legacy state and must never raise user-facing errors.
function mirrorHarness(storage) {
  const source = fs.readFileSync(
    new URL('../src/specwatt/localization/locale-mirror.ts', import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (name === '@react-native-async-storage/async-storage') return storage;
      throw new Error(`unexpected require: ${name}`);
    },
  });
  return exports;
}

function fakeStorage(table, { failRead = false, failWrite = false } = {}) {
  return {
    getItem: async (key) => {
      if (failRead) throw new Error('storage read failed');
      return key in table ? table[key] : null;
    },
    setItem: async (key, value) => {
      if (failWrite) throw new Error('storage write failed');
      table[key] = value;
    },
  };
}

test('mirror remembers the chosen locale and recalls it', async () => {
  const table = {};
  const mirror = mirrorHarness(fakeStorage(table));
  mirror.rememberLocale('ky');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(table[MIRROR_KEY], 'ky');
  assert.equal(await mirror.recallLocale(), 'ky');
});

test('corrupted or legacy mirror values are rejected, never guessed', async () => {
  for (const raw of ['RU', '"ky"', '', 'english', 'ru ky', 'null', 'undefined']) {
    const mirror = mirrorHarness(fakeStorage({ [MIRROR_KEY]: raw }));
    assert.equal(await mirror.recallLocale(), null, `value ${raw} must be ignored`);
  }
});

test('a failing read reports no locale instead of throwing', async () => {
  const mirror = mirrorHarness(fakeStorage({}, { failRead: true }));
  assert.equal(await mirror.recallLocale(), null);
});

test('a failing write is swallowed: mirror must not create user-visible errors', async () => {
  let attempted = false;
  const storage = {
    getItem: async () => null,
    setItem: async () => {
      attempted = true;
      throw new Error('storage write failed');
    },
  };
  const mirror = mirrorHarness(storage);
  assert.doesNotThrow(() => mirror.rememberLocale('ru'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempted, true, 'mirror write must still be attempted');
});

test('the real applyLocale policy updates the store and the mirror together', async () => {
  const table = {};
  const mirror = mirrorHarness(fakeStorage(table));
  const updates = [];
  mirror.applyLocale((locale) => updates.push(locale), 'ky');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(updates, ['ky'], 'store setter must receive the locale');
  assert.equal(table[MIRROR_KEY], 'ky', 'mirror must record the same choice');
});

test('default device draft starts from the locale-appropriate room name', () => {
  const ru = defaultDraft('ru');
  const ky = defaultDraft('ky');
  assert.equal(ru.room, 'Гостиная');
  assert.equal(ky.room, 'Конок бөлмөсү');
  for (const draft of [ru, ky]) {
    assert.equal(draft.name, '');
    assert.equal(draft.category, 'lamp');
    assert.equal(draft.image, 'lamp');
    assert.equal(draft.allowAuto, false);
  }
});
