import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIRROR_KEY, parseLocale, localeFromStoredState,
  recallLocale, rememberLocale, applyLocale,
} from '../src/specwatt/localization/locale-mirror.ts';
import { defaultDraft } from '../src/specwatt/localization/default-draft.ts';

function fakeStorage(table, { failRead = false, failWrite = false } = {}) {
  return {
    getItem: async (key) => {
      if (failRead) throw new Error('read-error');
      return key in table ? table[key] : null;
    },
    setItem: async (key, value) => {
      if (failWrite) throw new Error('write-error');
      table[key] = value;
    },
  };
}

test('mirror only accepts strict ru/ky, not JSON or unsafe input', async () => {
  for (const raw of ['RU', '"ky"', '', 'english', 'ru ky', 'null', 'undefined']) {
    assert.equal(await recallLocale(fakeStorage({ [MIRROR_KEY]: raw })), null);
  }
  assert.equal(parseLocale('ky'), 'ky');
  assert.equal(parseLocale('ru'), 'ru');
  assert.equal(parseLocale({ toString() { throw Error('coerce'); } }), null);
});

test('reading and writing mirror with injected storage works', async () => {
  const table = {};
  const storage = fakeStorage(table);
  await rememberLocale(storage, 'ky');
  assert.equal(table[MIRROR_KEY], 'ky');
  assert.equal(await recallLocale(storage), 'ky');
});

test('failed mirror read/write remain nonfatal', async () => {
  assert.equal(await recallLocale(fakeStorage({}, { failRead: true })), null);
  await assert.doesNotReject(rememberLocale(fakeStorage({}, { failWrite: true }), 'ky'));
});

test('locale from corrupt state is independent from dangerous channel contents', () => {
  assert.equal(localeFromStoredState({ locale: 'ky', source: 'demo', channels: [{ protected: false }] }), 'ky');
  assert.equal(localeFromStoredState({ locale: 'de', source: 'demo' }), null);
  assert.equal(localeFromStoredState(null), null);
  assert.equal(localeFromStoredState([]), null);
});

test('screen calls the store setter, it never writes to another AsyncStorage directly', () => {
  const updates = [];
  applyLocale((v) => updates.push(v), 'ky');
  assert.deepEqual(updates, ['ky']);
});

test('locale-appropriate device default does not enable automatic control', () => {
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
