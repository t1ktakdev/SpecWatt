# SpecWATT Live State + Warm Graphite: результат волны

Реализован основной серверный продуктовый путь, а не отдельный debug-экран. P0 и основной P1 работают через настоящий FastAPI; P2 включает строгую иерархию источника/свежести/значений, SVG-каналы, журнал, адаптивную навигацию и честную историю. Нативная Android-приёмка и hardware telemetry не заявляются.

Worktree: `D:/SpecWATT-live-ux-20261029`. Ветка: `feature/live-state-premium-ux-20261029`.
Принятая база подтверждена через `git ls-remote` и `git fetch`: `d6360aacfc6189f15aa982d266fdb09a60c7e5b4`, `integration/unified-v7-20261027`. `origin/main` при старте был `c04d55ad…`; он не использовался как база. SHA256 входного bundle проверен для всех 12 файлов.

Последний функциональный коммит до delivery-документов: `f713487bb85d055da16e81d9fc2a1f844e1c17f5`. Финальный HEAD с документами определяется `git rev-parse HEAD` и приведён в итоговом сообщении; полная история — `outputs/live-ux/commits.txt`.

## Работающие сценарии

1. Существующий onboarding RU/KY, offline DEMO, SVG, фото-механизм, локальные настройки и защита CH3 сохранены. Исправлен унаследованный WEB-дефект первого offline-перехода: lazy route больше не требует сеть.
2. Реальная регистрация/вход, owner-scoped список, честное пустое состояние, явное создание симулятора и выбор контроллера. Выбор открывает главную вкладку, а не отдельный `/server` dashboard.
3. Home/Devices/детали используют один snapshot, source, measured_at и время пользователя. Unknown/stale/future не показываются нулём. Polling — 10 секунд после GET, только focused/active, с dedupe и отменой.
4. CH1/CH2: один UUID request, requested отдельно от ACK. Явная кнопка симулятора подтверждает; API остаётся authoritative по пику, ownership и защите. CH3 не имеет управляющего элемента.
5. Journal получает настоящие события и команды, последовательности/переходы/время/корреляцию, фильтры и controller-scoped cursor. Server measurements не попадают в DEMO-store.
6. Offline, 401, потерянный ответ POST, неизвестный исход и восстановление через GET проверены на реальном loopback HTTP. Перезапуск FastAPI с той же временной БД сохраняет серверную историю.
7. Autopilot показывает настоящие разрешения, manual hold и peak. Plan переиспользует scheduler evaluate/create/cancel/tick. Нет фиктивного общего enabled или автоматического исполнения.
8. График показывает настоящие загруженные образцы симулятора и разрывы. Wh — оценка покрытых интервалов, а не потребление здания или экономия.

## Проверки и exit codes

Сырые stdout/stderr и неуспешные первые прогоны сохранены в `outputs/live-ux/logs/`. Машинный индекс — `outputs/live-ux/verification.json`.

| Команда/проверка | Exit | Результат |
|---|---:|---|
| `npm ci` с системным CA | 0 | locked dependencies; первый TLS-прогон exit 1 сохранён |
| `npm test` | 0 | 247/247, skipped 0; база 226/226 |
| `npm run typecheck` | 0 | TypeScript |
| `npm run lint` | 0 | без ошибок и предупреждений финального прогона |
| backend `unittest discover -s tests -q` | 0 | 91/91; база 90/90 |
| security `unittest discover -s security -q` | 0 | 104/104 |
| `python scripts/smoke.py` (cwd backend) | 0 | loopback HTTP, auth/scheduler/CH3/request/ACK |
| `scripts/live-ux-smoke.mjs` | 0 | реальные HTTP + WEB RU/KY × 320/393/440; 139 captures |
| `scripts/ui-smoke.mjs` | 0 | DEMO RU/KY, настройки/SVG/reload, CH3, нет API |
| `scripts/first-run-smoke.mjs` | 0 | 18 parcours, offline переход, язык/reload, keyboard, 48px, enlarged WEB text |
| `npm run export:web -- --max-workers 2` | 0 | production WEB export |
| `npm run export:android -- --max-workers 2` | 0 | Hermes bundle, **не native UI** |
| `python -m bandit -r backend/specwatt_api -ll -q` | 0 | одна существующая nosec warning, не finding |
| `python security/scan_secrets.py` | 0 | tracked current files |
| `python security/scan_secrets.py --history` | 0 | полная история |
| `npm audit --json` | **1** | 9 vulnerable package entries: 4 high, 5 low; 3 уникальные прямые advisory |
| существующий `check_npm_audit.py` | 0 | новых/усиленных advisory нет, baseline не изменён |
| `npx expo-doctor` | **1** | 19/20; 13 patch mismatches, без suppressions |
| `git diff --check` | 0 | без whitespace-ошибок |

## Скриншоты и происхождение

- `outputs/live-ux/demo-before/`: 56 кадров immutable WEB export принятой базы; RU/KY, 320/360/393/440. Последние восемь detail-кадров сняты позже с того же **неизменённого baseline bundle**; source SHA остаётся d636, хотя общий capture-harness записывает текущий git HEAD. Это различие зафиксировано в provenance.
- `outputs/live-ux/demo-after/`: 56 matched DEMO кадров с тем же fixture/time/viewports. Они проверяют отсутствие регрессии существующей демонстрации.
- `outputs/live-ux/server-after/`: 139 кадров настоящего FastAPI-flow, default text и computed text ×1,3/×1,5, Reduce Motion. Manifest содержит SHA, размеры, source и SHA256. Нормальные server scenes, unknown, offline, expired session, schedule evaluate/create/cancel — отдельные кадры.
- `outputs/first-run/parcours/`: 90 кадров, 18 first-run сценариев × 5 состояний.
- `demo-regression.png`: matched DEMO до/после. `new-server-flow.png`: **разные источники** DEMO baseline / новый SERVER, сравнение функциональности, а не обещание одинаковых данных. `references-v7.png`: все шесть исходных эталонов.

WEB-снимки не подменяют Android-доказательства. Часть нового интерфейса намеренно проще демонстрации: неизвестные данные, пустая история и explicit request имеют приоритет над декоративными графиками и мгновенными переключателями.

## Коммиты и изменения

Все новые коммиты подписаны `OpenAI Codex <codex@openai.com>`. Чужое авторство и исходная история сохранены. Общая исходная Git identity восстановлена; дальнейшие delivery-коммиты используют `git -c user.name=… -c user.email=…`.

| SHA | Назначение |
|---|---|
| `105d7e00bea8af591725b7288473cf30de31c72d` | CORS/limiter browser correctness |
| `a57bb92f6eedc6e1201607b7a666210180b1a67e` | общий серверный workspace и основные вкладки |
| `1cc236109361f22b502a3592f4319d5ff266b377` | scheduler rules и история/Wh |
| `89bfe2e2f7417485d5fe104f3192c6bc52f9ded7` | offline/recovery и responsive regression |
| `fe6a0d66ec32c2b015b42f393c01faada3e5f159` | валидные SVG accessibility props |
| `bdbb507d14cb35246fe395c64095d57f7ca724fa` | навигация при переносе текста |
| `e3443cec7ab3a07fe72c4947d9882c8ee4240fe6` | защита от двойного polling timer |
| `f713487bb85d055da16e81d9fc2a1f844e1c17f5` | первый offline DEMO в WEB; ожидание URL в harness |

Основной diff: `live-workspace.ts` — session/selection/read/mutation state; `live-context.tsx` — один vault/client + focus/AppState; шесть route wrappers — явный выбор источника; `live-tabs.tsx` — серверные экраны; `api.ts` — строгие events/measurements и метаданные; `live-history.ts` — достоверная история; `server.tsx` — прежняя форма и owner selection, без отдельного дублирующего workspace; `server-schedules.tsx` — переиспользованный scheduler и локальное время. Добавлен один SDK-matched `expo-crypto` для UUID, без upgrade остальных dependencies.

Ограничения и следующий handoff перечислены в [KNOWN_GAPS.md](KNOWN_GAPS.md); воспроизведение — [RUNBOOK.md](RUNBOOK.md); причины исправлений и негативные границы — [DIFF_REVIEW.md](DIFF_REVIEW.md). Ветка пригодна для локального review и подготовки Draft PR. Ничего не опубликовано: push, PR creation, merge, deployment и hardware actions не выполнялись.
