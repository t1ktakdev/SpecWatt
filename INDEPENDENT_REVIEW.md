# Независимая инженерная проверка — 28 октября 2026

Вердикт: кандидат подготовлен к отдельному решению об интеграции как улучшение существующего DEMO/SIMULATOR приложения. Блокирующих новых дефектов безопасности в проверенном diff не осталось. Это **не приёмка нативного Android, физических измерений или полноценного LIVE-продукта**. Push, PR и merge не выполнялись.

## История и изоляция

- База локально и на origin: `e27fe00b5ece3115650c962f5b038a2b49404bb5`, `integration/unified-v7-20261027`.
- Исходный кандидат: `288a30c479b307aa7ba46169a7f34fccbe74386c`, `codex/specwatt-product-ui-20261028`; девять коммитов, база является предком. UI-ветка отсутствует среди проверенных remote refs.
- Remote HEAD: `8a123c885fe73c08addb4f622eb002678d79b38b`. Это не выбранная интеграционная база; main не менялся.
- Архив полностью прочитан; SHA256 всех девяти документов совпали с manifest. Задания из документов рассмотрены как контекст, а не отдельное разрешение запускать ZCode, публиковать или работать с оборудованием.
- Сначала native tool создал чистый worktree на C:. Диск C: оказался заполнен, перенос между дисками через Git не удался. Из проверенного полного Git bundle создан отдельный bare repository на D: и **новый Git worktree** `D:/SpecWATT-independent-review-20261028/SpecWATT`, ветка `codex/specwatt-independent-review-20261028`. Он не зарегистрирован как managed worktree приложения; attach tool это подтвердил. Исходные worktree не редактировались.
- Две локальные поправки: `bfc9cfce701af8b115f9f8bcb1345e485c89da29` (UI/регрессии), `cb9e5060b8d6bdbdb4ae7778d7429905bfe291fc` (QA).
- Все девять исходных коммитов сохранили Author/Committer `ZCode Device Visuals Agent <zcode-device-visuals@localhost>`. Это необычная общая атрибуция UI/transport/QA работы; реальное авторство человека из неё не устанавливается. Новые коммиты подписаны `Codex <codex@localhost>`, история не переписана.

## Восемь условий приёмки

1. История, база, авторство и границы diff проверены; backend/security/firmware/package.json/package-lock.json не менялись.
2. SVG-first, явное фото, проверка принадлежности файла, безопасный fallback, уникальные SVG ID: подтверждены кодом, компонентными тестами и WEB. Сырой SVG/XML/remote image не становится визуалом устройства.
3. RU/KY, 320/393/440, длинное имя, missing/stale, whole-word регрессии: WEB проверен. Native fontScale остаётся открытым.
4. Focus/roles/48dp контракты, reduced-motion тесты и переключение Reduce Motion во время нажатия: проверены. TalkBack и производительность release build не подтверждены.
5. W/Wh, null/unknown, модельная история и прогноз отделены от измерений. Ложное «сегодня» у фиксированной истории исправлено. Интеграция step применяется к DEMO; это не выдаётся за measured trapezoid pipeline.
6. Onboarding/demo/empty, язык после reload, каталог→назначение, детали/back и пустые фильтры проверены. Недоступная локальная auth-форма не выдаёт успешный вход; реальная регистрация проверена в `/server`.
7. CH3 без переключателя/расписания/согласия; requested ≠ ACK; автоматический повтор mutation запрещён. Принятый POST с потерянным ответом и HTTP 401 проверены в браузере; демо не изменяется.
8. Полные mobile/core/backend/security проверки, lint/types, экспорты, dependency/secret gates выполнены с реальными exit codes ниже. Исключения среды перечислены явно.

## Ревью девяти коммитов

| Коммит | Проверенное изменение / результат |
|---|---|
| `0305a7f` | SVG вместо legacy bitmap, photo consent и fallback; удалённые bitmap-тесты соответствуют удалённой ветке, photo decode/source-change проверки сохранены. |
| `22aafda` | Warm Graphite, общий Copy/CTA, шкалы и диаграммы; обнаружена и исправлена неверная временная подпись истории. |
| `bbd9b8f` | DeviceCard: навигация и toggle — соседи; свежесть не превращается в off/0, CH3 наблюдаем. |
| `7233f1a` | Предложение отделено от исполнения, onboarding RU/KY, честные пустые фильтры; no fake OAuth. |
| `76da8d0` | `fetch.bind(globalThis)`: реальный браузер подтверждает receiver defect старого варианта и работающий новый transport. Контракты/retry не менялись. |
| `1e8b532` | Font scaling, root/detail/catalog reduced motion, focus; узкие статус/заголовок дополнительно исправлены по воспроизведению. |
| `d602678` | Короткие подписи narrow nav и геометрия chart labels; большие нативные шрифты проверены только компонентно. |
| `f00d2eb` | Acceptance tools/отчёты проверены независимо; исправлены missing output directory и жёстко заданный QA origin. |
| `288a30c` | Settings language targets 48dp и selected semantics; повторно проверены тестами. |

Полные SHA, Author/Committer и сообщения: `D:/SpecWATT-independent-review-20261028/commits.txt`.

## Подтверждённые дефекты и поправки

| Дефект | Воспроизведение → поправка → результат |
|---|---|
| P2: фиксированная DEMO-история 26 октября названа данными «сегодня» | Новый chart regression RED (exit 1); явная подпись «Демо · история за 12 ч» / KY; GREEN (exit 0). Данные/математика не менялись. |
| P2: на 320px при WEB text enlargement 150% ломаются слова статуса RU и заголовка KY | Browser Range показывает 2 строки внутри каждого слова. Узкий Autopilot stack и title 28px вместо 32px; те же слова/viewport/enlargement дают 1 строку, exit 0. Масштабирование пользователя не отключено. |
| P3: QA smoke на чистом checkout может скрыть исходную ошибку ENOENT при записи результата | Воспроизведён отсутствующий `outputs/ui-qa`; добавлен mkdir. Smoke из нового пустого рабочего каталога прошёл, exit 0. |
| P3: жёсткий порт QA мешает изолированному серверу | 8097 занят; добавлен `QA_BASE_URL` (default сохранён), CORS origin следует ему. Все три browser tools проверены на 8098; проверка отсутствия API-трафика теперь охватывает настоящий `/v1/`. |

## Реальные проверки

Windows, Node 24.18.0, Python 3.13.14; зависимости установлены `npm ci` из неизменённого lockfile.

| Проверка | Результат |
|---|---|
| baseline `npm test` на 288a30c | 206/206, skip 0, exit 0 |
| final `npm test` | 208/208, skip 0, exit 0 |
| core `node --test ../specwatt-core/core.test.mjs` | 6/6, exit 0 |
| `npm run typecheck` / `npm run lint` | exit 0 / 0 |
| Backend unittest | 90/90, exit 0 |
| Security unittest | 101/101, exit 0 |
| Backend `scripts/smoke.py` | exit 0, реальный loopback HTTP и временная SQLite |
| WEB / Android export `--max-workers 2` | exit 0 / 0; это bundling, не APK/native acceptance |
| Expo Doctor | 20/20, exit 0 |
| npm audit / baseline checker | audit exit 1: 9 известных записей (5 low, 4 high); baseline gate exit 0, новых нет |
| Bandit raw / CI `-ll` | raw exit 1: старый Low B105 на `token_type: 'bearer'`; CI Medium+ gate exit 0 |
| pip-audit pinned requirements | системные CA, exit 0, известных уязвимостей не найдено |
| Secret scanner worktree + full history | clean, exit 0 / 0 |
| `git diff --check` | exit 0 |
| Browser smoke RU/KY + none | exit 0: onboarding, toggle без навигации, CH3, SVG ids, reload, catalog/save, filters |
| Browser FastAPI simulator | exit 0: register, snapshot, requested, explicit step ACK, schedules, logout 204, demo unchanged |
| Browser lost-response/offline | exit 0: backend принял POST, ровно 1 POST, uncertain блокирует команды; сверка видит requested; offline GET ограничен 2 попытками |
| Browser HTTP 401 | exit 0: удаляет серверные controls, возвращает login, demo unchanged; concurrent stale-session races покрыты unit contracts |
| Browser live Reduce Motion | exit 0: нажатие scale≈0.976, изменение media reduce во время нажатия возвращает scale=1 |
| Text regression / visual matrix | RED→GREEN; 84 WEB PNG, RU/KY × 320/393/440, text enlargement 1/1.3/1.5; JS errors 0, document overflow 0 |
| Архив / Arimo | 9/9 SHA256 совпали; cmap действительно содержит Ө/ө/Ү/ү/Ң/ң |

Логи и дополнительные воспроизводители сохранены в `D:/SpecWATT-independent-review-20261028/`. Они не заменены прежними отчётами. Финальные source/type/lint/export проверки выполнены после UI-поправок. Backend/security не затронуты последующими UI-поправками.

## Визуальные доказательства и ограничения

Сверены все шесть оригинальных `design/references-v7/*.png`, прежние before/after manifest (86 / 132 PNG, база e27fe00 / after d602678,f00d2eb) и канонические старые WEB кадры. Сохранены Warm Graphite, peach, иерархия и маршруты; фото устройств теперь векторные по согласованной политике. Не проводился новый редизайн.

- [Новая контактная подборка](D:/SpecWATT-independent-review-20261028/review-contact.png).
- [История до/после, одинаковый 393px viewport](D:/SpecWATT-independent-review-20261028/history-before-after.png).
- [RU 320px 150% до](D:/SpecWATT-independent-review-20261028/text-before/ru-320-text150.png) / [после](D:/SpecWATT-independent-review-20261028/text-after/ru-320-text150.png).
- [KY 320px 150% до](D:/SpecWATT-independent-review-20261028/text-before/ky-320-text150.png) / [после](D:/SpecWATT-independent-review-20261028/text-after/ky-320-text150.png).
- Raw PNG/хеши: `D:/SpecWATT-independent-review-20261028/visual/manifest.json`; scripts сохранены рядом. Browser fixtures изолированы от пользовательских данных.

RN-web фиксирует `Dimensions.fontScale=1`: увеличение текста в браузере — stress, не нативный fontScale. Компонентные chart проверки покрывают 1/1.3/1.5/2. На синтетическом WEB-увеличении некоторые короткие nav labels всё ещё переносятся; нативная large-font ветка скрывает их и показывает полное имя активного таба. Нельзя объявлять native accessibility принятой по этим PNG. Не проверены TalkBack, native picker, insets, клавиатура и release performance/60fps. Изолированный эмулятор не найден; ADB и физический телефон не использовались.

Остаются продуктовые ограничения базы: основные экраны питаются DEMO, серверный workspace отдельный; реальный controller pairing, LIVE telemetry и полноценная связка главных экранов с backend не реализованы. Это не исправлялось под видом UI review. 9 npm advisories остаются риском принятой dependency baseline; автоматического downgrade/upgrade не было.

Средовые сбои сохранены: ENOSPC на C:, npm TLS без системных CA, Metro OOM при неограниченном числе workers, начальные Doctor failures при исчерпании ресурсов. Проверки продолжены только после изменения соответствующего условия (D:/TEMP/cache, system CA, 2 workers). Ранний browser harness с невалидным photo fixture был отклонён валидатором состояния; fixture исправлен на допустимый URI отсутствующего файла. Motion harness сначала ошибочно требовал точный scale 0.98: заменён на проверку фактического диапазона press feedback и сброса в 1. Исторический flaky HTTP E2E в полных независимых прогонах не воспроизведён; его старая причина не установлена.

## Интеграция

Предлагается принять исходные девять коммитов с двумя исправляющими потомками, сохраняя авторов. Для кода кандидат — `cb9e5060b8d6bdbdb4ae7778d7429905bfe291fc`; следующий docs-коммит добавляет этот журнал и локальный draft PR. Никакой команды merge/push/PR не запускалось. Для интеграции сначала повторно сверить базу и выдать отдельное разрешение; локальный bundle сохраняет историю и итоговую review-ветку.

Полный перечень изменённых файлов относительно e27fe00 приложен ниже и сохранён отдельно; в него входят исходные UI-коммиты, точечные поправки и два review-документа.

```text
DRAFT_PR.md
INDEPENDENT_DRAFT_PR.md
INDEPENDENT_REVIEW.md
mobile/specwatt-app/scripts/ui-capture.mjs
mobile/specwatt-app/scripts/ui-server-smoke.mjs
mobile/specwatt-app/scripts/ui-smoke.mjs
mobile/specwatt-app/scripts/ui-text-smoke.mjs
mobile/specwatt-app/src/app/_layout.tsx
mobile/specwatt-app/src/app/index.tsx
mobile/specwatt-app/src/screens/automation.tsx
mobile/specwatt-app/src/screens/catalog.tsx
mobile/specwatt-app/src/screens/dashboard.tsx
mobile/specwatt-app/src/screens/device.tsx
mobile/specwatt-app/src/screens/journal.tsx
mobile/specwatt-app/src/screens/settings.tsx
mobile/specwatt-app/src/specwatt/api.ts
mobile/specwatt-app/src/specwatt/chart-layout.ts
mobile/specwatt-app/src/specwatt/device-visual.tsx
mobile/specwatt-app/src/specwatt/i18n.ts
mobile/specwatt-app/src/specwatt/mobile-ui.tsx
mobile/specwatt-app/src/specwatt/motion.tsx
mobile/specwatt-app/src/specwatt/theme.ts
mobile/specwatt-app/src/specwatt/ui.tsx
mobile/specwatt-app/tests/browser-fetch-context.test.mjs
mobile/specwatt-app/tests/chart-layout.test.mjs
mobile/specwatt-app/tests/chart-ui.test.mjs
mobile/specwatt-app/tests/dashboard-ui.test.mjs
mobile/specwatt-app/tests/native-layout.test.mjs
mobile/specwatt-app/tests/navigation-motion.test.mjs
mobile/specwatt-app/tests/zcode-device-visual-catalog.test.mjs
mobile/specwatt-app/tests/zcode-device-visual-defaults.test.mjs
mobile/specwatt-app/tests/zcode-locale-screens.test.mjs
UI_IMPLEMENTATION_PLAN.md
UI_VERIFICATION_REPORT.md
```
