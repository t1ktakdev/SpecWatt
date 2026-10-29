# Review и red → green

## Существенные исправления

| Воспроизведение | Причина / изменение | Доказательство |
|---|---|---|
| Новый workspace отсутствует; новый тест падает | Один observable workspace + один LiveProvider, прежние vault/BrainClient/scope | `workspace-red.log`, `workspace-green.log`, текущие lifecycle-тесты |
| После создания выбран ID, но snapshot отсутствует | Creation lock блокировал собственный первый GET; разрешён внутренний reconcile | `create-lock-red.log` → `create-lock-green.log` |
| POST принят, последующий GET упал — запись теряется | Сохраняется именно возвращённая API запись requested перед GET; ACK не выдумывается | `accepted-record-red.log` → `accepted-record-green.log` |
| 125-й CORS preflight получает 429; браузер видит network_error | CORS теперь окружает limiter: OPTIONS не тратит API budget, 429 сохраняет exact origin | `cors-rate-red.log` → `cors-rate-green.log`, новый backend-тест |
| SVG вызывает React error-toast поверх навигации | Неподдерживаемый WEB boolean `accessible` заменён валидными ARIA/focusable props | `live-main-final.log` (неуспех) → `live-release-verification.log` (успех), console error checks |
| Подписи табов переносятся при WEB 1,5× на 320 px | По реальной высоте текста включается одна полная подпись + пять доступных иконок | `nav-zoom-red.log` → `nav-zoom-green.log`, снимки 320 text-1.5 |
| Быстрый background/foreground оставляет два таймера | Epoch запрещает старому GET планировать timer после нового цикла активности | `polling-red.log` → `polling-green.log` |
| Первый offline DEMO не открывает ещё не загруженный Home | Воспроизведено и на d636 export. Eager routes включены только для WEB | `first-run-baseline-repro.log`, `first-run-regression.log` → `first-run-eager-green.log` (18 сценариев) |

## Проверенные границы

- Logout очищает UI сразу; старый logout не очищает новый сеанс. Поздние snapshot/auth не коммитятся в другую генерацию. Смена выбранного ID обнуляет историю/команды/времена.
- При 401 серверные данные удаляются; DEMO не включается автоматически. Две реальные HTTP-учётные записи проверяют owner isolation для snapshot/events/measurements/commands.
- CH3 отбрасывается до POST и защищён backend. Stale/future/unknown не превращаются в 0 W; чтение snapshot не создаёт образец.
- Команда блокируется синхронной mutation lock. POST не повторяется. Реальный тест теряет ответ **после** `route.fetch()` и восстанавливает requested через GET, затем требует отдельного simulator ACK.
- Polling: фактический focus, активное приложение, 10 секунд после завершения GET, dedupe, AbortSignal и очистка на blur/background. Отдельный тест проверяет гонку таймеров.
- Журнал использует source/controller/sequence и реальный origin; серверные события не пишутся в DemoState/AsyncStorage. Snapshot/command controller ID валидируется при commit.
- Энергия проверена на 10 W × 0,5 h = 5 Wh, разрывах, дублях, неправильных временах и неполном наборе каналов. Между разрывами линии нет.
- Security tests изменены по месту переезда кода: они по-прежнему проверяют loopback URLs, отзыв и очистку, дополнительно делегирование из формы. Allowlist, audit baseline и backend safety policy не ослаблялись.

## Диагностика среды и harness

Первый `npm ci` завершился exit 1 из-за TLS certificate chain; успешная установка использовала `NODE_OPTIONS=--use-system-ca`, без отключения TLS. Первый двухвладельческий HTTP-harness ошибочно использовал общий browser vault для двух логинов; заменён отдельными **тестовыми** in-memory vault, приложение по-прежнему использует один vault.

Исходный `ui-smoke.mjs` один раз проверил URL сразу после `router.back()` и упал, хотя baseline-прогон прошёл. Добавлено ожидание ожидаемого URL, после которого исходный assert сохранён; проверенный DEMO-прогон exit 0. Это синхронизация теста, не изменение пользовательского перехода.

Статический `expo export --dev` привёл к full reload на lazy navigation и утрате memory-only WEB session; этот способ QA отклонён, логи сохранены. Серверная приёмка выполнена через обычный Expo dev server; production WEB export отдельно проверен DEMO/onboarding-тестами. Прогоны не выдаются за native Android.

## Визуальный review

Просмотрены contact sheets всех шести v7 references, шести серверных экранов, matched DEMO before/after и отдельный 320 px large-text экран. Сохранены Warm Graphite, Arimo, ширина 440, существующие SVG. Серверный Home использует компактный числовой приоритет вместо декоративческого gauge, Devices — явно подписанный запрос, Journal — переходы и корреляцию. После review исправлены SVG warning и перенос навигации.

Основные ограничения для следующего review: плотность длинного Journal, технический UTC-ввод Plan, редкие непереведённые коды и native acceptance. Независимый reviewer-agent не запускался по прямому запрету пользователя.
