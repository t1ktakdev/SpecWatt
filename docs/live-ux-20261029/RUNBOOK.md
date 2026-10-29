# Запуск и проверка Live UX

Ветка: `feature/live-state-premium-ux-20261029`. Worktree: `D:/SpecWATT-live-ux-20261029`.
База: `d6360aacfc6189f15aa982d266fdb09a60c7e5b4`. Нужны Node 24+, Python с зависимостями `backend/requirements-dev.txt`.

## Обычный запуск

В первом PowerShell, из `backend`:

```powershell
$env:SPECWATT_DB = "$env:TEMP/specwatt-review-$([guid]::NewGuid()).sqlite3"
$env:SPECWATT_CORS_ORIGINS = 'http://localhost:8120'
$env:SPECWATT_SCHEDULER_ENABLED = '0'
python -m uvicorn specwatt_api.app:create_app --factory --host 127.0.0.1 --port 8000
```

Во втором, из `mobile/specwatt-app`:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm ci
npx expo start --web --host localhost --port 8120 --max-workers 2
```

Открыть `http://localhost:8120`. Пройти существующий onboarding или открыть `/server`. Указать `http://127.0.0.1:8000`, зарегистрировать **временный** аккаунт (пароль 12–128 символов). Создать именованный серверный симулятор явной кнопкой. Приложение откроет Home с источником «СЕРВЕР · СИМУЛЯЦИЯ».

В Devices запросить выключение CH1: состояние остаётся `requested`, показания не меняются. Нажать отдельную кнопку «Симулировать подтверждение»: только теперь появляется `acknowledged`, общая мощность становится 2,4 Вт. Journal показывает серверные события и переходы. CH3 никогда не предлагает управление. Через 30 секунд измерение устаревает; GET его не обновляет. Для нового синтетического образца есть отдельная явно подписанная кнопка.

Autopilot показывает разрешения, серверный предел и ручной приоритет. Для CH2 явно разрешить автоматизацию. В Plan выбрать CH2, ввести будущее время UTC, проверить окно, отдельно подтвердить создание; отмена тоже требует явного подтверждения. Tick — только операторский шаг симулятора; worker выключен.

Кнопка DEMO возвращает полностью локальную модель. Выход очищает серверное пространство немедленно и вызывает отзыв сессии. В WEB токен живёт только в памяти: полный reload требует входа заново. Для повторных браузерных проверок не использовать реальные учётные данные.

## Автоматическая приёмка

```powershell
# Из mobile/specwatt-app; Expo dev server уже запущен на localhost:8120.
$env:PLAYWRIGHT_MODULE = 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:QA_BASE_URL = 'http://localhost:8120'
node --experimental-strip-types scripts/live-ux-smoke.mjs
npm test
npm run typecheck
npm run lint
npm run export:web -- --max-workers 2
npm run export:android -- --max-workers 2
```

`live-ux-smoke.mjs` сам запускает loopback FastAPI с отдельной временной SQLite, создаёт временных владельцев, проверяет HTTP/WEB, останавливает свой процесс и удаляет свою БД. Каждый сценарий матрицы получает отдельное окно rate limiting; лимиты backend не отключаются. Можно сузить диагностику через `QA_LOCALES=ru` и `QA_WIDTHS=393`.

Для проверки WEB-экспорта запустить `node scripts/serve-export.mjs dist-web-v6 8122`, задать `QA_BASE_URL=http://127.0.0.1:8122`, выполнить `scripts/ui-smoke.mjs` и `scripts/first-run-smoke.mjs`. Production export принимает серверные соединения через HTTPS; loopback HTTP проверяется в dev-сборке. `--dev` static export в этой среде оказался непригоден для сессионного сценария из-за reload при lazy navigation; используйте обычный Expo dev server.

Материалы и сырые логи: `outputs/live-ux/`. Основная приёмка — WEB Edge Chromium; Android export — только проверка JS/Hermes bundle. Физические устройства, ADB и прошивка не нужны и не используются.
