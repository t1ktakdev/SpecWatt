# Product finish: реализация и доказательства — 29.10.2026

## Результат и границы

Реально изменены исходники Expo/TypeScript и HTTP-фикстура; API-контракты и единое серверное пространство сохранены. Главная, устройства, detail, автопилот, план и журнал работают с authenticated FastAPI/SQLite simulator. DEMO остаётся отдельным локальным состоянием. Warm Graphite, Arimo и существующие DeviceVisual/SVG сохранены.

Это проверенный локальный WEB-кандидат и экспорт Android JS/assets. Нативный Android, APK, TalkBack и физическое оборудование **не проверены**. Нет заявления о готовом аппаратном продукте или production deployment.

## Git и входные материалы

- Исходный worktree: `D:\SpecWATT-live-ux-20261029`, ветка `feature/live-state-premium-ux-20261029`, исходный и сохранённый HEAD `e34c2189b2b7b3f9b468894557bf63ae4a0ee6fb`.
- Новый изолированный worktree создан native-инструментом Codex: `C:\Users\user\.codex\worktrees\specwatt-product-finish-20261029\SpecWATT`.
- Ветка: `codex/product-finish-20261029`. Родительская история сохранена, исходный worktree чистый.
- До изменений сохранён `D:\SpecWATT-before-product-finish-20261029.bundle`, SHA256 `F2387E9E876A7DC986E1C8EE9E47EAF610EC6B17B4FE2558D1EDDB2DA8710DEB`.
- Git remote HEAD проверен read-only: `main` → `c04d55ad2e92f48d357c93fe7e0c1da89f2ac090`. Разработка велась от локального кандидата пользователя, а не от remote main.
- Архив полностью распакован; прочитаны 00–10, исходники, README и независимый обзор. SHA256 всех 12 файлов из manifest совпал; результат `outputs/product-finish/input-integrity.json`.
- `main`, чужие ветки, ESP32 Stage 1, прошивка и физические устройства не менялись. Push, PR и merge не выполнялись.

Реализация:

| Полный SHA | Изменение |
|---|---|
| `806d866def21501609d0ef207de8b9736d5a26ff` | Жизненный цикл реальной FastAPI HTTP-фикстуры, явные ошибки старта, cleanup после закрытия процесса |
| `3118b56a2fecc76d89aa0cd207d93ecf8a78cb5d` | Продуктовые экраны, локальные расписания, safe preview, история/графики/фильтры, браузерные регрессии |

Автор новых коммитов — `Codex <codex@localhost>`. В унаследованной Git-конфигурации оказалось имя предыдущего агента: исправлены метаданные только двух собственных неопубликованных коммитов. Старые коммиты не переписаны. SHA исходных коммитов исполнения до исправления авторства: `1802f96ad8eca2155ddb9a12b7cd09dd025ff93b`, `57cf697dd4a162bda115510f2f8f1616d0a6400c`. Дерево продукта до/после этой коррекции одинаково: `485c6fd5e8210d967b46f2190e05d0494c045872`. Это объясняет возможные SHA этих коммитов в ранних screenshot manifest.

Дополнительный QA-коммит `9b67a40f4bf092ae5242305f20da2dcfa2a7677e` фиксирует одинаковое положение прокрутки для парных кадров и записывает положение source badge в manifest. Это изменение capture-harness; продуктовые исходники не менялись.

Финальный SHA документации, состояние Git и хэши итоговых архивов записаны после последнего коммита в локальном `outputs/product-finish/FINAL_STATE.json`.

## HTTP E2E: RED → диагностированное изменение → GREEN

Исходный стандартный параллельный запуск воспроизвёл дефект: **243/247, exit 1**, 4 `network_error`, 0 skip. Лог `baseline-default.log`. Несколько коротких диагностических запусков были зелёными; они не использовались как доказательство исправления.

При увеличении тихого интервала до 8 секунд исходный Python-процесс с daemon-потоком Uvicorn завершался **code 0, signal null** ещё до scheduler tick: 6 последующих HTTP-сценариев падали. В info-логе нет штатного завершения serving coroutine. С тем же интервалом Uvicorn в основном `asyncio.run(...)` выдержал сценарий, 247/247. Наблюдаемая причина находится в управлении сроком жизни тестового процесса; точный внутренний триггер Python/Windows/daemon-thread не выдаётся за доказанный backend-дефект.

Изменение:

- основной процесс владеет serving coroutine; нет daemon-thread/join;
- временная уникальная директория и SQLite на каждую фикстуру; сокет порт 0 выбирает Python без гонки find/free;
- polling настоящего `/health`, ограниченный timeout, проверка `hardware_transport:false`;
- stderr/stdout ограничены диагностическим хвостом, фиксируются exit/signal;
- отсутствие Python/ошибка startup — ошибка теста, **не skip**; зависимый setup также fail;
- после kill ожидается `close`, затем удаляется только собственная временная директория;
- стандартный `npm test` и его параллелизм не изменены;
- регрессия содержит реальную паузу 6,1 с и проверку живого процесса;
- дополнительный HTTP-тест делает восемь одновременных owner-scoped чтений в одной фикстуре.

Итог: **254/254, exit 0, 0 skip** в двух последовательных стандартных запусках (`verified-test-1/2.log`). Два одновременно запущенных независимых HTTP E2E дали **10/10 + 10/10, оба exit 0** (`http-stress-1/2.log`). Никакой автоматической переотправки команд или подмены реального HTTP mock-данными не добавлено.

## Что изменилось в продукте

| Экран | Конкретное поведение |
|---|---|
| Главная | Компактная source badge, явный контроллер/свежесть, табличная типографика мощности, предел и запас, ясный переход к управлению. Unknown остаётся «—». Есть отдельная подсказка для устаревшего образца и ожидающего результата. |
| Устройства | Фильтры Все/Активные/Защищённые, curated SVG, состояние включён/выключен/нет данных. Строка устройства открывает detail; лишняя полноразмерная кнопка убрана. CH1/CH2 отправляют запрос, CH3 только наблюдается. |
| Detail | Корректный возврат к устройствам, происхождение и время образца, отдельная история именно выбранного канала, управление/разрешения, переход к Плану с выбранным CH1/CH2. |
| Автопилот | Реальное число разрешённых каналов из двух, текущий ручной приоритет и предел. Выдача разрешения — объяснение + явное подтверждение. CH3 исключён; выдуманного общего режима/AI нет. |
| План | Местный формат `ДД.ММ.ГГГГ ЧЧ:ММ`, timezone, быстрые 15 мин/час. Строгая проверка календаря/DST, UTC preview, сохранение именно проверенного ScheduleInput. Смена зоны блокирует подтверждение. Evaluate/create/cancel/tick по существующему API. |
| Журнал | Читаемые названия, местное время, технические идентификаторы и переходы раскрываются по желанию. Фильтры применяются к событиям и списку команд. На экране сначала 20 событий, затем «ещё 20»; bounded workspace 500 остаётся. |
| Подключение | Понятное объяснение симуляции, техническая инструкция в раскрываемом блоке, явно описано ограничение памяти WEB-сеанса и повторного выбора контроллера. |
| Навигация | Каждая новая route начинает ScrollView сверху. Проверка браузером ловит прежнее открытие вкладки с середины. |

Новые controls используют существующий MotionPressable: спокойная press-анимация, focus outline, haptics по платформе и Reduce Motion. Существующая пружина имеет overshootClamping. Не добавлялись зависимости и новые визуальные бренды.

Графики разделяют мгновенную мощность W и оценку Wh на покрытых интервалах. Разрывы >60 с не соединяются. Истинный наблюдаемый пик отделён от минимальной высоты шкалы: полностью выключенный канал имеет пик **0**, а не 1 Вт. Тест 10W × 0,5h = 5Wh сохранён; новые тесты проверяют расчёт отдельного канала.

## Безопасность и корректность

Сохранены owner-scoped API, token vault, session/logout race protection, request scope и bounded cursors. Код продуктовой доработки не меняет backend, API transport или firmware. POST остаётся однократным; неизвестный исход явно отличается от requested и ACK. Только явный шаг симулятора подтверждает команду. Мощность не меняется от намерения пользователя. Refresh не создаёт новый образец.

CH3 не получает переключателя, разрешения автоматизации или расписания. Выдача разрешения CH2 без подтверждения не выполняет PATCH — проверяется браузером. DEMO не получает серверный контроллер/историю; переключение источника очищает серверное пространство.

## Проверки и настоящие exit codes

Все команды выполнены в новом worktree. Полные cwd/argv/exit/duration находятся в `outputs/product-finish/*.result.json`, длинные stdout/stderr — в соседних `.log`. Первые красные/диагностические логи сохранены, не перезаписаны зелёными.

| Проверка | Exit | Результат |
|---|---:|---|
| Исходный параллельный набор | 1 | 243/247, 4 ошибки, 0 skip |
| Финальный `npm test`, запуск 1 | 0 | 254/254, 0 skip |
| Финальный `npm test`, запуск 2 | 0 | 254/254, 0 skip |
| Одновременные независимые HTTP E2E | 0 / 0 | 10/10 + 10/10, реальные loopback FastAPI/SQLite |
| `npm run typecheck` | 0 | TypeScript |
| `npm run lint` | 0 | ESLint |
| backend unittest | 0 | 91/91 |
| security unittest | 0 | 104/104 |
| `python scripts/smoke.py` | 0 | HTTP smoke |
| Bandit `-ll -q` | 0 | нет находок уровня проверки |
| scan_secrets worktree / history | 0 / 0 | clean |
| WEB export / Android JS export | 0 / 0 | bundles/assets; не APK |
| Expo Doctor | **1** | **19/20**, **14** пакетов не совпадают с ожидаемыми patch-версиями |
| raw `npm audit --json` | **1** | **9** package entries: **4 HIGH, 5 LOW** |
| существующий npm audit baseline gate | 0 | новых advisory нет; старые не устранены |
| `git diff ... --check` | 0 | whitespace checks |

Исправлены два замечания отдельного code review: смена зоны между evaluate/create и ложный пик 1 Вт при нулевых отсчётах. RED/GREEN для локального времени и диапазона графика сохранены (`local-time-red/green.log`, `peak-red/green.log`). После изменения подключения существующий component-harness потребовал добавить mock нового Details; все прежние assertions сохранены.

## Визуальная и функциональная приёмка

Финальная матрица: **142 WEB captures, exit 0**, RU/KY × 320/393/440, горизонтальное переполнение 0. Стабилизированная повторная съёмка содержит те же проверки и явные source bounds; её итог — `ui-accepted.log`.

Матрица, изображения, screenshot metadata и результаты — `outputs/product-finish/accepted-web/`. Основной сценарий работает через реальную временную FastAPI/SQLite БД с двумя независимыми владельцами. Для HTTP 429 и потери ответа POST используется явно обозначенная browser fault injection; это не доказательство реального физического сбоя.

Проверяются RU/KY, 320/393/440 × высота 852, обычный текст и CSS-увеличение 1,3/1,5, prefers-reduced-motion, отсутствие горизонтального переполнения, touch targets/focus. **CSS text scale не является native fontScale; WEB focus не является TalkBack-проверкой.**

Настоящие действия: регистрация, создание контроллера, вкладки/detail, CH3 без команды, requested до ACK, явный step, журнал, выдача разрешения с подтверждением, evaluate/create/cancel, устаревание после реальных 30 с, 429, остановка/возврат сервера, потерянный ответ POST с одной отправкой и GET reconciliation, отозванный токен 401 и очистка данных владельца, возврат в DEMO. Смена timezone после оценки блокирует создание.

Базовый «до» снят непосредственно в этой сессии до продуктовых правок: RU/393, тот же реальный сценарий и номиналы источника, `outputs/product-finish/before/`. Сравнение имеет одинаковые viewport/source/scenario; фактические acquisition timestamps и случайные controller UUID отличаются. Это **не** pixel-perfect diff с замороженными часами. В отдельных прежних кадрах заметен дефект сохранённой прокрутки, исправленный теперь.

Сравнение: [визуальный лист](visual-comparison.png), [подробное сравнение экранов](visual-states.png). Все исходные кадры, хэши, locale/fontScale/viewport и тестовые checks сохранены в evidence-архиве.

Статический контраст по sRGB: основной текст 13,85:1, muted 7,52:1, accent 8,14:1 на surface; ink на peach 8,67:1; muted на raised 6,76:1. Это расчёт основных пар, не полная сертификация accessibility.

## Ограничения, которые остаются

- Нативный Android, TalkBack, native font scaling, системная клавиатура, фото-picker, corrupt-file/ENOSPC на устройстве не проверены: emulator не найден в PATH/обычной SDK-папке. Физический телефон не использовался. Совместимость Expo Go на телефоне не заявляется.
- Expo Doctor и 9 npm audit entries остаются открытыми; baseline и suppressions не менялись. Обновление SDK/dependencies требует отдельного контролируемого изменения.
- Перевод KY функционально проверен, редактура носителем языка остаётся желательной.
- Это simulator. Нет физических INA219/ESP32 измерений, production auth/email recovery, фонового аппаратного управления, тарифа/экономии/AI прогнозов.
- WEB-сеанс только в памяти; URL/selection не восстанавливаются после перезагрузки. Ограничение явно объяснено в UI.
- Журнал ограничен и отображает события порциями; полноценная виртуализация длинной общей ленты — дальнейшая оптимизация.
- Автоматическая фоновая генерация телеметрии не включалась. Состояние естественно устаревает; образец создаётся явно.

## Оценка приложения пользователем

См. [RUNBOOK.md](RUNBOOK.md): точные команды, адрес предпросмотра и пятиминутная цепочка с реальными кнопками. API работает только на loopback. Для тестового аккаунта задайте временные данные сами; реальных учётных данных в репозиторий или отчёт не добавлялось.

## Использованные инженерные источники

- Установленные `specwatt-product-quality`, Expo overview, диагностика/TDD/review/verification Superpowers; обязательные ограничения сверены с запросом пользователя.
- [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) — versioned API reference. Новые native зависимости не устанавливались.
- [Node test concurrency](https://nodejs.org/api/cli.html#--test-concurrency) — файловый параллелизм тестов сохранён.
- [Vercel React Native rules](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-native-skills) — source-of-truth state, bounded list rendering, transform/opacity feedback; не использовались как повод менять архитектуру.
- Установленный Context7 MCP: resolve-library-id и query-docs для `/react/react-native`; проверены Pressable accessibilityState/disabled и Reduce Motion lifecycle. Первые вызовы имели сетевую/ID ошибку; успешный запрос с системным CA сохранён в `context7-verified.log`. TLS-проверка не отключалась.

Сводная матрица: [ACCEPTANCE.csv](ACCEPTANCE.csv). Открытые native/dependency/performance пункты отмечены явно.

## Точный список изменённых исходников и тестов

- `mobile/specwatt-app/scripts/live-ux-smoke.mjs`
- `mobile/specwatt-app/src/screens/live-controls.tsx`
- `mobile/specwatt-app/src/screens/live-tabs.tsx`
- `mobile/specwatt-app/src/screens/server-schedules.tsx`
- `mobile/specwatt-app/src/screens/server.tsx`
- `mobile/specwatt-app/src/specwatt/live-history.ts`
- `mobile/specwatt-app/src/specwatt/mobile-ui.tsx`
- `mobile/specwatt-app/src/specwatt/schedule-time.ts`
- `mobile/specwatt-app/tests/first-run-server-form.test.mjs`
- `mobile/specwatt-app/tests/http-fixture.test.mjs`
- `mobile/specwatt-app/tests/live-history.test.mjs`
- `mobile/specwatt-app/tests/power-chart-range.test.mjs`
- `mobile/specwatt-app/tests/schedule-time.test.mjs`
- `mobile/specwatt-app/tests/support/fastapi-fixture.mjs`
- `mobile/specwatt-app/tests/zcode-server-e2e.test.mjs`

Документация этой итерации: `docs/product-finish-20261029/{EXECUTION.md,REPORT.md,RUNBOOK.md,ACCEPTANCE.csv,visual-comparison.png,visual-states.png}`. Все остальные доказательства находятся в ignored `outputs/product-finish/` и отдельном evidence ZIP.

Примечание к QA-логам: первоначальная повторная съёмка `ui-accepted-interrupted.log` остановлена (exit 1) после обнаружения ожидания source badge на экране входа, где badge отсутствует. В capture-harness добавлена проверка наличия перед boundingBox. Лог сохранён; финальный `ui-accepted.log` относится к исправленному harness.
