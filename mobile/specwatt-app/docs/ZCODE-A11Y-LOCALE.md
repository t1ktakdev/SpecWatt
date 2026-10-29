# ZCode Mission A — RU/KY Localization & Accessibility: Handoff

Автор: ZCode agent (GLM-5.3-Flash), миссия AGENT-A-RU-KY-ACCESSIBILITY.
Дата: 2026-10-27/28 (локальное время UTC+6). Статус: готово к интеграции, Draft PR.

## 1. Git-база и коммиты

| Параметр | Значение |
|---|---|
| Ожидаемая база | `b5b1c72b9211488e185507bf37683a8ed3df6424` (origin/integration/unified-v7-20261027) |
| Remote head при старте (проверен `git ls-remote`) | `b5b1c72b9211488e185507bf37683a8ed3df6424` — совпадает, работа начата |
| Worktree | `C:\Users\user\Documents\ChatGPT\SpecWATT-agent-worktrees\zcode-max-l10n-accessibility` (создан `git worktree add -b zcode/max-l10n-accessibility … b5b1c72` из `C:\Users\user\Documents\ChatGPT\SpecWATT`) |
| Checkpoint-репо | `C:\Users\user\Documents\ChatGPT\SpecWATT` — НЕ модифицировался (только как источник worktree) |
| `.codex` worktree | `C:\Users\user\.codex\worktrees\specwatt-integration\SpecWATT` — НЕ трогался |

Коммиты в ветке `zcode/max-l10n-accessibility` (автор — настроенная идентичность окружения `ZCode Scheduler Reliability Agent <zcode-scheduler@localhost>`, подмена авторства не выполнялась):

| SHA | Тема |
|---|---|
| `0b92ba9a758364c10137b100bea7cadad3dbede9` | feat(mobile): complete typed RU/KY dictionary with loud missing-key guard |
| `557977e181893997af35d0d93bf58a7ebd2b6622` | feat(mobile): migrate onboarding, setup and settings to the dictionary with accessibility states |
| `b37926b8c7514f80a36a67a2eaa6a06eed693b36` | test(mobile): add locale dictionary, mirror and screen regression tests |
| *(этот коммит)* | docs(mobile): ZCODE-A11Y-LOCALE handoff |

## 2. Границы файлов (проверено `git diff --stat` против b5b1c72)

Изменены ТОЛЬКО разрешённые файлы:
- `mobile/specwatt-app/src/specwatt/i18n.ts` (переписан: полный словарь)
- `mobile/specwatt-app/src/specwatt/localization/locale-mirror.ts` (новый)
- `mobile/specwatt-app/src/specwatt/localization/default-draft.ts` (новый)
- `mobile/specwatt-app/src/app/index.tsx`, `src/app/setup.tsx`, `src/screens/settings.tsx`
- `mobile/specwatt-app/tests/zcode-locale-*.test.mjs` (3 новых файла — разрешено пунктом 7 миссии)
- `mobile/specwatt-app/docs/ZCODE-A11Y-LOCALE.md` (новый)

Запрещённые файлы (store.tsx, model.ts, _layout.tsx, mobile-ui.tsx, motion.tsx, theme.ts, ui.tsx, api.ts, app.json, package*.json, backend/**, .github/**, security/**) — не тронуты; `git status --porcelain` после коммитов чистый.

## 3. Что реализовано

### 3.1 Централизованный типизированный словарь (i18n.ts)
- 25 исходных ключей сохранены с точными значениями (контрат-тест пиннит их), добавлено ~95 новых ключей для всех строк onboarding/setup/settings.
- `ky: Record<keyof typeof ru, string>` — отсутствие кыргызского ключа = ошибка компиляции. Тихий fallback на русский после выбора KY невозможен; `t()` бросает исключение, если ключа нет (громкий отказ, защищает и JS-вызывающих).
- `strings` экспортируется для тестов. `import type { Locale } from "./store"` — type-only, поэтому i18n.ts импортируется в node --test без загрузки store.tsx.
- Тест-allowlist «одинаковых по дизайну» значений (`langRu`, `langKy`, `badgePlan`) ловит любые случайные совпадения RU=KY как регрессию перевода.

### 3.2 Зеркало языка (localization/locale-mirror.ts)
Дефект (root cause в запретных файлах): при повреждённом/нечитаемом AsyncStorage `model.restoreState` возвращает `emptyState()` с `locale:"ru"` — выбранный язык молча сбрасывается. Репродьюсер: тест `corrupted storage restores safe defaults` (zcode-locale-dictionary.test.mjs).

Решение в своей зоне: одно-ключевое зеркало `specwatt-locale-mirror-v1`:
- `applyLocale(setLocale, locale)` — единая политика смены языка (store + зеркало);
- запись fire-and-forget (ошибка записи не создаёт пользовательскую ошибку);
- чтение ТОЛЬКО когда store сообщил `storageError === "read-error"` (index.tsx) и только на onboarding (не читаемое состояние = source none/onboarded false) —healthy-состояние переопределить невозможно; тесты закрепляют оба направления.

### 3.3 Экраны (index/setup/settings)
- Убраны локальные `hint()/words()` и `useWords()` из settings; убран захардкоженный русский массив бейджей `["Нагрузка","Защита","План"]` (реальный баг: KY-пользователь видел русские слова) и русский дефолт помещения «Гостиная» в KY-сценарии (теперь `defaultDraft(locale)` → «Конок бөлмөсү»).
- Accessibility: карточки выбора языка и режимов — `accessibilityRole/Label/Hint/State(selected)`; поля логина — `accessibilityLabel`; ошибки валидации — `accessibilityLiveRegion="polite"` (Copy пробрасывает TextProps — проверено ревью); карточки onboarding `height` → `minHeight` (нет обрезки длинного KY/крупного шрифта; при scale 1.0 визуально идентично); чипы языка в settings — press target ≥44 dp (s.chip имел 39).
- Дизайн Warm Graphite/Arimo/токены не менялись; демо-маркировка («Демо · модельные данные», SERVER · OFFLINE + локализованный текст) и защита CH3 (тексты, disabled Toggle) сохранены.

### 3.4 KY-переводы
Унаследованная терминология сохранена (түзмөк/канал/чоку/артыкчылык/жүктөм). После ревью улучшены: «Аты милдеттүү» (был омоним «лошади»), «Түзмөктөр жок», «Сүрөттү импорттоо мүмкүн болбоду», modeHint и ch3AssignNote переведены по смыслу RU без потерь («переключение» → «күйгүзүү»). RU-значения при этом не менялись ни разу.

## 4. Журнал команд (команды из mobile/specwatt-app, если не указано иное; время локальное UTC+6)

| # | Команда | Время | Exit | Результат |
|---|---|---|---|---|
| 1 | `npm install --no-audit --no-fund` | 2026-10-27 ~23:45 | 0 | зависимости установлены |
| 2 | `npm test` (baseline до правок) | ~23:50 | 0 | 81 pass / 0 fail |
| 3 | `npm run typecheck` (baseline) | ~23:51 | 0 | чисто |
| 4 | `npm run lint` (baseline) | ~23:51 | 0 | 0 problems |
| 5 | `node --experimental-strip-types --test tests/zcode-locale-*.test.mjs` (RED до реализации) | ~23:58 | 1 | 3 файла fail (модуль localization/ отсутствует, i18n.ts был не импортируем в node: value-import `./store`; ожидаемый TDD-RED) |
| 6 | та же команда после реализации (GREEN) | 2026-10-28 ~00:10 | 0 | 23 pass → 26 pass после фиксов ревью |
| 7 | `npm run lint` (после фикса react-hooks/exhaustive-deps: зависимости добавлены в effect recovery) | 00:2x | 0 | 0 problems, 0 warnings |
| 8 | `npm test` (полный) | 00:27:27 | 0 | **107 pass / 0 fail** |
| 9 | `npm run typecheck` | 00:27:28 | 0 | чисто |
| 10 | `npm run lint` | 00:27:31 | 0 | чисто |
| 11 | `node --test tests/zcode-locale-*.test.mjs` | 00:27:34 | 0 | 26 pass / 0 fail |
| 12 | `npx expo-doctor` (report-only) | ~00:20 | **1** | 1 failed check: «6 packages out of date» (зависимости SDK; package*.json вне моей зоны — передано интегратору, pre-existing) |
| 13 | `python security/scan_secrets.py` (из корня) | ~00:24 | 0 | SECRET SCAN: clean (tracked worktree files) |
| 14 | `npm audit --json` → `python security/check_npm_audit.py <json>` | ~00:26 | raw audit **1**; baseline gate **0** | «no new advisories (4 known advisories remain baselined)»; @expo/code-signing-certificates advisory RESOLVED с момента базлайна — базу можно обновить (вне моей зоны) |
| 15 | `git diff --check` и `git diff --cached --check` перед каждым коммитом | 00:2x | 0 | пробельных ошибок нет |

## 5. Code review (subagents)

Запущены два read-only ревьюера (Explore, только чтение/запуск тестов, без коммитов):
1. **Архитектура/безопасность** — вердикт APPROVE. Подтверждены: контракт `t()` и 25 исходных ключей побайтово; только разрешённые файлы; нет секретов/console; нет псевдо-успехов; CH3 и демо-маркировка сохранены; зеркало не «второй store» (один ключ, запись только на явную смену, чтение только при read-error); O(1) `t()`, словарь module-level; strict TS.
2. **Тесты/сценарии** — вердикт APPROVE. Подтверждено: 81 старый тест не изменён и проходит; сценарии поведенческие (RU→KY→RU с сохранением значений, восстановление KY при битом storage, отказ мусора в зеркале, анти-дрейф useWords через бросающий мок). KY-терминология единообразна.

Принятые исправления после ревью (внесены в коммиты): юнит-тест реального `applyLocale`; естественность 5 KY-строк; лейбл кнопки в тесте через словарь; тесты back-навигации settings/setup; комментарий-инвариант у recovery. Отклонено с обоснованием: предложение убрать widening-каст в `t()` — widening нужен громкому runtime-guard для не-TS вызовов (call sites остаются compile-safe); рост чипов settings на 5px при scale 1.0 — намеренное требование миссии «кнопки 44–48 dp».

## 6. MCP/инструменты: использовано фактически

| Инструмент | Статус |
|---|---|
| Bash/Git, Read/Write/Edit, node --test | использованы |
| Subagents (2× read-only Explore) | использованы (см. §5) |
| Skills ZCode | прочитаны через Skill tool: specwatt-project-guardrails, using-git-worktrees, systematic-debugging, test-driven-development, expo-native-ui, expo-design-system, expo-router, requesting-code-review, receiving-code-review, verification-before-completion, specwatt-merge-gate, finishing-a-development-branch |
| android-emulator plugin (preflight) | проверен: **эмулятор недоступен** (нет emulator binary/AVD/Gradle, 0 устройств) → нативная визуальная QA не выполнялась |
| expo-docs MCP / Figma MCP / Context7 | не использовались: Figma OAuth не подтверждён; для задачи точных внешних примеров не потребовалось; SDK 58-специфика взята из локального кода и skills |
| Browser/физический телефон | не использовались (Expo Go/QR на телефон запрещены миссией) |

## 7. Критерии готовности: что доказано и что НЕТ

Доказано (node --test, реальные исходники экранов через transpile-harness — provenance: functional component tests):
- RU и KY onboarding (welcome → язык → режим → offline-формы) и setup полностью на выбранном языке; в KY нет русских утечек (негативные ассерты на конкретные RU-строки).
- Выбор языка сохраняется: модель-тест `restoreState(locale)` + при read-error восстановление из зеркала; быстрые RU→KY→RU не сбрасывают назначения приборов (модель-тест).
- Скринридер-семантика: role/label/hint/selected state у карточек и чипов, labels полей ввода, live regions ошибок (проверены пропсы; реальное озвучивание TalkBack не проверялось).
- CH3: переводы защиты, disabled Toggle, отсутствие путей обхода — ревью подтвердило.

НЕ доказано / emulator-only (честно, среда недоступна):
- Визуальная acceptance на Android (fontScale 1.0/1.3/1.5, 320×700 и 440×952 dp, перенос длинного KY, клавиатура, TalkBack-озвучивание, reduced-motion на устройстве). Flutter-скриншотов и web-QA не делалось; никаких Android-visual заявлений не делается.
- Реальный AsyncStorage/перезапуск процесса (тесты на fake storage).

## 8. Инвентарь для интегратора: ключи 6 основных экранов и серверного workspace

Экраны `dashboard.tsx`, `device.tsx`, `automation.tsx`, `journal.tsx`, `catalog.tsx`, `server.tsx` (+ `server-schedules.tsx`) НЕ редактировались. Их текущая локализация — инлайн `useWords()(ru,ky)`; числа call-сайтов `w(...)`: dashboard 27, device 25, automation 36, journal 18, catalog 21, server 79, server-schedules 53. Общий chrome (Shell/BottomNav/Header/Toggle) уже двуязычен внутри mobile-ui.tsx и не требует действий.

Предлагаемая миграция (безопасная, аналогичная моей): в каждом экране `const locale = data.locale` (или `useLocale()`-хук) и `t(locale, key)`; строки собрать в словарь. Независимые группы ключей, которые нужно добавить (имена — предложение):

- dashboard: `totalNow`, `totalEnergy`, `peakLimit`, `channelsStatus`, `demoHistoryTitle`, `staleWarning`, `emptyChannelsTitle/Sub`, `connectCta`
- device: `deviceTitle`, `channelBadge`, `powerNow`, `manualHold`, `onOffCta`, `protectedNotice`, `freshnessFresh/Stale/Missing`, `photoHint`
- automation: `autopilotTitle`, `enableAuto`, `peakInput*` (переиспользовать `peakW/peakA11y/errLimits`), `manualMinutes*` (`holdMinutes/holdA11y`), `planCard*` (`applyPlan`, `rejectPlan`, `planBlocked`, `noWindow`, `noImprovement`, `permissionNeeded`, `manualPriority`, `alreadyRunning`, `staleData`)
- journal: `journalTitle`, `eventCode.<code>` для 16 кодов EventCode (demo-start…invalid-input), `emptyJournal`, `exportJournal`
- catalog: `catalogTitle`, `searchPlaceholder`, `category.<id>` (119 категорий — генерировать программно из каталога), `constructorHint`, `saveIllustration`
- server: `serverTitle`, `connectForm` (url/token/connect), `authStates` (requesting/sent/ack/rejected/timeout/uncertain/reconciled — по статусной модели команд), `scopes`, `scheduleList*`, `telemetryFresh/Stale`, `offlineNotice` — критично: тексты статусов команд не должны объявлять доставку без ack
- server-schedules: `scheduleTitle`, `windowEarliest/Latest`, `durationMinutes`, `createSchedule`, `conflictNotice`, `workerState`

Готовые к переиспользованию ключи словаря уже есть: `home, devices, back, next, language, simulation, protected, room, finish, done, assign, channels, settingsTitle, saveLimits, errLimits, peakW, peakA11y, holdMinutes, holdA11y, allowAuto, ch3Blocked, svgCatalog*`.

## 9. Предложенные патчи для запретных файлов (интегратору)

1. **model.ts / restoreState — не терять язык при частичной порче данных.** Сейчас любое невалидное поле сбрасывает и locale. Предложение: вынести валидацию locale наверх и сохранять её при деградации состояния:
```ts
// proposed, NOT applied (файл вне моей зоны)
const base = emptyState();
if (record(raw) && (raw.locale === "ru" || raw.locale === "ky"))
  base.locale = raw.locale as Locale;   // язык выживает, даже если channels/events повреждены
if (!record(raw) || !["none","demo"].includes(raw.source as string)) return base;
```
2. **store.tsx — альтернатива зеркалу.** После переноса в store: при `read-error` звать `recallLocale()` (или принять mirror-патч как есть — он уже работает из index.tsx). Второй store не создаётся; зеркало можно будет удалить, если (1) принят.
3. **expo-doctor «6 packages out of date»** — обновить через `npx expo install --check` (package.json вне зоны миссии); baseline `security/baselines/npm-audit-baseline.json` можно обновить: @expo/code-signing-certificates advisory закрыт.

## 10. Ограничения и незакрытые задачи

- Нет Android-эмулятора/устройства → нет скриншотов, TalkBack-проверки, fontScale/320dp визуальной acceptance (§7). Рекомендуется прогнать `specwatt-native-visual-qa` после поднятия AVD.
- SERVER · OFFLINE — английский статус-маркер оставлен намеренно (бренд-метка; рядом локализованный текст «Сервер пока не подключён»).
- Дефолтное помещение черновика фиксируется языком на момент создания черновика (было захардкожено по-русски; не регрессия).
- Web-QA (expo export:web) не выполнялась — среда браузера не подключалась; все тесты — node --test functional.
- CI GitHub Actions в этой ветке не запускался до открытия PR; статус будет виден в Draft PR.
