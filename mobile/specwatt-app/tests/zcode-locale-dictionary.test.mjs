import test from 'node:test';
import assert from 'node:assert/strict';
import { t, strings } from '../src/specwatt/i18n.ts';
import * as model from '../src/specwatt/model.ts';

// Keys that intentionally carry the same text in both locales: endonyms
// (language names are written in their own language) and the shared brand
// noun "План". Anything else resolving identical RU/KY values is a
// translation gap, i.e. a silent fallback to Russian under KY.
const SAME_BY_DESIGN = new Set(['langRu', 'langKy', 'badgePlan']);

// Original v1 dictionary contract: existing consumers rely on these exact keys.
const ORIGINAL_RU = {
  welcome: 'Умная нагрузка.',
  tagline: 'Только разрешённые действия.',
  next: 'Продолжить',
  language: 'Язык интерфейса',
  mode: 'Как начнём?',
  demo: 'Посмотреть демо',
  real: 'Подключить контроллер',
  empty: 'Без устройств',
  choose: 'Выберите режим',
  unavailable: 'Реальное обнаружение ещё не подключено',
  try: 'Учебная симуляция',
  channels: 'Каналы стенда',
  assign: 'Назначить устройство',
  room: 'Помещение',
  image: 'Выбрать изображение',
  permissions: 'Разрешения',
  finish: 'Сохранить устройство',
  done: 'Устройство назначено',
  protected: 'Защищённый канал',
  noData: 'Нет измерений',
  home: 'Главная',
  devices: 'Устройства',
  back: 'Назад',
  simulation: 'Демо · модельные данные',
  save: 'Продолжить',
};

test('ru and ky dictionaries cover identical key sets with non-empty text', () => {
  const ru = Object.keys(strings.ru).sort();
  const ky = Object.keys(strings.ky).sort();
  assert.deepEqual(ky, ru, 'ky must define every ru key (no runtime fallback)');
  for (const key of ru) {
    assert.equal(typeof strings.ru[key], 'string', `ru.${key} must be a string`);
    assert.equal(typeof strings.ky[key], 'string', `ky.${key} must be a string`);
    assert.ok(strings.ru[key].trim().length > 0, `ru.${key} must not be empty`);
    assert.ok(strings.ky[key].trim().length > 0, `ky.${key} must not be empty`);
  }
});

test('ky never silently falls back to Russian wording', () => {
  for (const key of Object.keys(strings.ru)) {
    if (SAME_BY_DESIGN.has(key)) {
      assert.equal(strings.ky[key], strings.ru[key], `${key} is same-by-design`);
      continue;
    }
    assert.notEqual(
      strings.ky[key],
      strings.ru[key],
      `ky.${key} must be real Kyrgyz, not the Russian string`,
    );
  }
  assert.equal(t('ky', 'welcome'), 'Акылдуу жүктөм.');
  assert.equal(t('ru', 'welcome'), 'Умная нагрузка.');
});

test('original dictionary keys keep their published values (backward compatibility)', () => {
  for (const [key, value] of Object.entries(ORIGINAL_RU)) {
    assert.ok(key in strings.ru, `key ${key} must survive refactoring`);
    assert.equal(t('ru', key), value);
  }
  assert.equal(t('ky', 'back'), 'Артка');
  assert.equal(t('ky', 'protected'), 'Корголгон канал');
});

test('a missing key fails loudly instead of rendering a wrong-language string', () => {
  assert.throws(() => t('ru', '__no_such_key__'), /__no_such_key__/);
});

test('onboarding, setup and settings keys resolve for both locales', () => {
  const owned = [
    'standBadge', 'loading', 'welcomeTitle1', 'welcomeTitle2', 'welcomeSubtitle',
    'badgeLoad', 'badgeProtect', 'loginUnavailable', 'languageNote', 'langHint',
    'selected', 'pick', 'myEquipment', 'realSub', 'demoSub', 'modeHint',
    'authEntry', 'loginTitle', 'registerTitle', 'recoveryTitle', 'serverOffline',
    'offlineNote', 'email', 'password', 'passwordRepeat', 'errEmail',
    'errPassword', 'errPasswordMatch', 'errServerOffline', 'createAccount',
    'requestLetter', 'backToLogin', 'forgotPassword',
    'setupTitle', 'lowVoltageBadge', 'controllerChannels', 'discoveryNote',
    'whatAvailable', 'assignNote', 'ch3Note', 'configureCurrent',
    'openSimulation', 'virtualChannelsNote', 'unassigned', 'assignTune',
    'toHome', 'configureDevice', 'ch3AssignNote', 'supportedDeviceNote',
    'deviceName', 'namePlaceholder', 'categoryImages', 'svgCatalog',
    'importing', 'useOwnPhoto', 'illustrationNote', 'errPhoto', 'errName',
    'roomPlaceholder', 'defaultRoom', 'allowAuto', 'ch3Blocked', 'consentNote',
    'autoAllowed', 'autoDenied', 'anotherChannel', 'toDevices',
    'settingsTitle', 'localSpace', 'safeCoordination', 'peakW', 'peakA11y',
    'holdMinutes', 'holdA11y', 'saveLimits', 'errLimits', 'saved',
    'svgCatalogTitle', 'svgCatalogSub', 'controllerPerms', 'serverSimulator',
    'serverSimSub', 'exportDemo', 'exportSub', 'errExport', 'privacy',
    'privacySub', 'legalDraft', 'legal1', 'legal2', 'legal3', 'legalNote',
    'versionNote', 'clearDemo', 'clearConfirm', 'deleteDemo', 'cancel',
  ];
  for (const key of owned) {
    assert.ok(key in strings.ru, `missing ru.${key}`);
    assert.ok(key in strings.ky, `missing ky.${key}`);
  }
});

test('switching locale rapidly preserves user assignments and survives restart restore', () => {
  let s = model.demoState('ru');
  const before = JSON.stringify(s.channels.map((c) => c.assigned));
  s = model.reduceState(s, { type: 'locale', value: 'ky' }, 1);
  assert.equal(s.locale, 'ky');
  s = model.reduceState(s, { type: 'locale', value: 'ru' }, 2);
  s = model.reduceState(s, { type: 'locale', value: 'ky' }, 3);
  assert.equal(JSON.stringify(s.channels.map((c) => c.assigned)), before);
  assert.equal(model.restoreState(JSON.parse(JSON.stringify(s))).locale, 'ky');
});

test('corrupted storage restores safe defaults without crashing (documented gap)', () => {
  // Known defect handed to the integrator: corruption loses the chosen locale
  // because model.restoreState resets to the "ru" base. The locale mirror
  // (zcode-locale-mirror.test.mjs) is the recovery path in owned files.
  const restored = model.restoreState({ locale: 'de', source: 'demo' });
  assert.equal(restored.locale, 'ru');
  assert.equal(restored.source, 'none');
});
