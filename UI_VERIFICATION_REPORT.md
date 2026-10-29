# SpecWATT — реализованные изменения, 28.10.2026

Проверенная база: `integration/unified-v7-20261027` / `e27fe00`. Рабочая ветка: `codex/specwatt-product-ui-20261028`, отдельный managed worktree. Продуктовые коммиты: `0305a7f`, `22aafda`, `bbd9b8f`, `7233f1a`, `76da8d0`, `1e8b532`, `d602678`. Полный ledger причин и доказательств — [UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md).

## Что изменено

- SVG по умолчанию для legacy/demo/restore. Старый `image` больше не является согласием на фотографию. Явный vector сохраняет конфигурацию; явное photo требует принадлежащего приложению файла, при ошибке — SVG. Политики URI, импорта, ENOSPC и очистки сохранены; пользовательское хранилище не сбрасывалось.
- Общая палитра, контраст, типографика, lineHeight, табличные цифры, отступы, 48dp области, видимый фокус. Контент и навигация выровнены. Проверены существующие Arimo wght 400–700 и Ө/ө/Ү/ү/Ң/ң.
- Home/Devices: картинки и текст в потоке, длинные названия растут, на узких экранах/при крупном шрифте одна колонка. Switch отделён от перехода в детали. Unknown/stale не выдаются за нулевую мощность или выключенный канал; CH3 только для наблюдения.
- Графики: адаптивная конечная шкала, понятные W/Wh, читаемые подписи без анизотропного растяжения, текстовое резюме, прокрутка при нехватке места. SVG-геометрия учитывает fontScale; компонентные проверки 1/1.5/2.
- Autopilot: честный статус, разрешения из двух управляемых каналов, предложение отделено от исполнения. Plan сохраняет смысл снижения пика без обещания экономии энергии.
- Onboarding объясняет продукт и режим без устройств; недоступный аккаунт визуально вторичен. Journal различает отсутствие истории и пустой фильтр. Catalog учитывает крупный шрифт и 48dp controls. Settings/Setup/Server используют исправленные общие компоненты и ширину.
- Reduce Motion управляет переходами root/detail/catalog и отменяет стартовую анимацию. Существующие отмена анимаций и исправленный callback-стиль MotionPressable сохранены.
- Обнаружен отдельный дефект базы в WEB: вызов сохранённого глобального `fetch` как метода клиента вызывал `Illegal invocation` до сети. Минимально исправлено через `fetch.bind(globalThis)`. Контракты, retry/timeout/auth semantics не менялись. RED→GREEN и реальный браузерный серверный сценарий подтверждают исправление.

## Проверки

Среда: Windows, Node 24.18.0, Python 3.13.14; Expo SDK 58 / RN 0.88. Зависимости установлены из существующего lockfile, package.json/lockfile не менялись.

| Команда / сценарий | Результат |
|---|---|
| baseline `npm test` | exit 0, 196/196, skipped 0 |
| final `npm test` | exit 0, 206/206, skipped 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm.cmd run export:web` | exit 0 |
| `npm run export:android` | exit 0 |
| root `python -m unittest discover -s security -v` | exit 0, 101/101 |
| backend `python -m unittest discover -s tests -v` | exit 0, 90/90 |
| backend `python scripts/smoke.py` | exit 0, реальный loopback HTTP и временная SQLite |
| `python security/scan_secrets.py` и `--history` | exit 0, clean |
| `git diff --check` | exit 0 |
| `scripts/ui-smoke.mjs` | exit 0: RU/KY onboarding, demo, один toggle без навигации, CH3, SVG ids, detail/back, фильтры, catalog→setup→save, reload, none; API из demo не вызывается |
| `scripts/ui-server-smoke.mjs` | exit 0: регистрация, симулятор, requested без ACK, явный step→acknowledged, расписания CH1/CH2, logout HTTP 204, demo unchanged |

В исходном исследовании отмечен flaky HTTP E2E; здесь полный baseline и последующие полные прогоны прошли. Причина исторического сбоя не установлена, backend и lifecycle теста не изменялись.

Честно зафиксированные промежуточные сбои: начальные regression RED; тесты старого onboarding были обновлены под новый текст/тип вторичного действия; браузерный harness сначала пытался открыть несуществующий `/server-schedules` (это встроенная панель `/server`), затем исправлен. У browser runtime отсутствовал bundled Chromium, использован установленный Edge. Один запуск через PowerShell npm.ps1 дал внутреннюю ошибку оболочки при export:web; повтор через npm.cmd реально завершился экспортом, exit 0. Серверный baseline выявил реальный fetch defect; исправление выделено отдельным коммитом. Chromium сообщает ERR_ABORTED для тела logout 204; реальный HTTP статус 204 и возврат к форме проверены.

## Визуальные доказательства

Всего: 86 before + 132 after + 4 server PNG. Raw PNG и SHA-256 manifests находятся в `mobile/specwatt-app/outputs/ui-qa/{before,after,server}`. Сравнение восьми исходных сценариев — 393×852, RU и KY; основные и дополнительные экраны — 320×700, 360×800, 393×852, 440×952. Дополнительно after содержит нижние части экранов на 320/440, missing/stale и длинное имя, empty filter. Время фикстуры фиксировано; реальные данные пользователя не использовались.

Исторические 8 WEB оригиналов и 6 дизайн-ориентиров сохранены из архива без изменения байтов; все 21 исходных файла совпали с SHA256-MANIFEST. Исторический desktop WEB не выдан за новый мобильный baseline.

## Границы результата

Android export проверяет bundling. Native emulator не найден; нативные fontScale 1.3/1.5, insets, TalkBack, системная клавиатура, native photo picker и производительность на Android не приняты. Компонентная проверка fontScale не заменяет нативный рендер. 60fps не заявляются. Скриншоты являются настоящим WEB-рендером, ImageGen и дорисовка не использовались.

Backend/security/firmware/схемы/API endpoints/CI/dependencies не изменены. Единственное transport-исправление — браузерный receiver в frontend. Сохранены CH3, demo/server separation, requested≠ACK, scoped GET retry, запрет mutation retry и uncertainty. Main, чужие worktree/файлы, физические устройства не затрагивались; публикации и merge не было.
