# SCHEDULER-ZCODE-MAX-HANDOFF — ZCode agent C (scheduler reliability), 2026-10-27

Ветка: `zcode/max-scheduler-reliability` (worktree `C:\Users\user\Documents\ChatGPT\SpecWATT-agent-worktrees\zcode-max-scheduler`).
BASE: `b5b1c72b9211488e185507bf37683a8ed3df6424` (= `origin/integration/unified-v7-20261027` на момент старта, расхождений нет).
HEAD: см. `git log` ниже. Draft PR: **https://github.com/t1ktakdev/SpecWatt/pull/4** (base `integration/unified-v7-20261027`, не main; merge не выполнялся).

## 1. Коммиты и изменённые файлы

| SHA | Сообщение |
| --- | --- |
| `2d11b7d` | fix(scheduler): isolate per-controller worker failures and terminate cancelled-command schedules |
| `c2c5e7e` | test(scheduler): concurrent worker passes on one database insert one phase |
| `ab2f24f` | test(scheduler): harden worker isolation test and add race + late-recovery pins |
| (этот коммит) | docs(scheduler): ZCode reliability handoff |

Файлы (только разрешённая зона владения):
* `backend/specwatt_api/scheduler/worker.py` — per-controller fault isolation в `run_worker_pass`.
* `backend/specwatt_api/scheduler/runner.py` — терминальная ветка `cancelled` → `command_cancelled` в `_advance`.
* `backend/tests/test_zcode_scheduler_faults.py` — НОВЫЙ файл, 19 детерминированных fault-injection тестов.
* `backend/docs/SCHEDULER_WORKER.md` — документация обоих поведений.
* `backend/docs/SCHEDULER-ZCODE-MAX-HANDOFF.md` — этот документ.

`app.py`, миграции/схема (v3), `base.py`, `clock.py`, `security/**`, `mobile/**`, `.github/**`, `openapi.json` — не изменялись (проверено `git diff b5b1c72 --stat`).

## 2. Что сделано (TDD: red → green)

**F1 (MEDIUM, worker).** Дефект: один «отравленный» контроллер (повреждённая строка, транзиентная ошибка SQLite, lock contention) прерывал весь `run_worker_pass` — остальные контроллеры голодали до следующего poll, состояние частично откатывалось только целиком по проходу. Доказано тестом `test_worker_pass_isolates_failing_controller_and_rolls_back`: на baseline исключение выходит наружу (RED), после фикса — rollback целиком по контроллеру, диагностика в журнале с id контроллера, здоровый контроллер обслуживается в том же проходе, повтор запускается на следующем poll (GREEN).

**F2 (MEDIUM, runner, defensive totality).** Дефект: `_advance` обрабатывал команду в статусе `cancelled` как `waiting_command` бесконечно. Через текущий API недостижимо (`cancel_schedule` атомарно отменяет и команду, и расписание), но статус-домен команд должен быть полным — любой будущий/прямой писатель, отменивший команду, оставил бы расписание висеть вечно. Доказано тестом `test_cancelled_terminates_linked_schedule` (RED: `waiting_command` ≠ `rejected`; GREEN: терминальный `command_cancelled`, новая команда не выдаётся, phase key остаётся поглощённым).

Остальные 15 тестов — behavior pins уже корректного поведения (регрессионная матрица), плюс 1 pin многопроцессной безопасности. Каждый pin прогнан на зелёном baseline; расхождений «тест expectations vs сервер» не обнаружено (3 первоначальных FAIL и 3 ERROR были багами тестовой обвязки, исправлены; серверное поведение подтверждено верным).

## 3. Тесты и exit codes (точные команды, cwd)

| Команда | cwd | Результат | Exit |
| --- | --- | --- | --- |
| `python -m unittest discover -s tests` (до изменений) | `backend/` | 71 test, OK | 0 |
| `python -m unittest tests.test_zcode_scheduler_faults` (RED, 2 теста) | `backend/` | 1 failure + 1 error (ожидаемые) | 1 |
| `python -m unittest tests.test_zcode_scheduler_faults` (после фиксов) | `backend/` | 17 tests, OK | 0 |
| `python -m unittest discover -s tests` (после фиксов) | `backend/` | 90 tests, OK (~53 c) | 0 |
| `python -m unittest tests.test_zcode_scheduler_faults` (после review-харденинга) | `backend/` | 19 tests, OK | 0 |
| mutant-проверка: усиленный isolation-тест против ослабленного worker-фикса | `backend/` | FAILED (ожидаемо, мутант убит) | 1 |
| `python scripts/smoke.py` | `backend/` | PASS (loopback HTTP, scheduler create/cancel/tick, CH3 rejection) | 0 |
| `python -m unittest discover -s security` | repo root | 100 tests, OK (~101 c) | 0 |
| `python -m bandit -r backend/specwatt_api -ll -q` | repo root | без findings; WARNING «nosec encountered (B608), but no failed test» на `scheduler/store.py:72` — доброкачественное, существовало до изменений | 0 |
| `python security/scan_secrets.py` | repo root | clean (tracked worktree files) | 0 |
| `git diff --check`, `git diff --cached --check` | worktree | чисто | 0 |

Примечание: PowerShell-обёртка может показывать предупреждения Python как ошибки потока; отчёт опирается только на фактические process return codes (все 0, кроме намеренного RED-прогона).

## 4. Регрессионная матрица → где покрыта

| Требование | Покрытие |
| --- | --- |
| Exact-once phase request (не hardware ack) | существующие `test_repeated_tick_never_duplicates_commands`, `test_restart_and_concurrent_ticks_insert_one_phase`; новые `test_staggered_windows_complete_exactly_once`, `test_concurrent_worker_passes_insert_one_phase` |
| Restart recovery (в т.ч. между requested и ack) | существующий `test_server_restart_recovers_pending_schedules`; новый `test_restart_between_requested_and_ack_completes_cycle` |
| Manual preemption | существующие `test_manual_priority_beats_the_scheduler` (+ create-time guard) |
| Cancelling pending / retract queued | существующие `test_cancelled_schedule_never_executes`, `test_cancel_retracts_requested_start_before_step`, `test_cancelling_running_schedule_stops_the_end_phase` |
| No ON after expiry (half-open окно) | существующие `test_window_missed_after_downtime`, `test_expired_half_open_window_does_not_turn_load_on`; новый `test_closing_off_dispatches_exactly_at_end_at` |
| Idempotency collisions | существующие `test_repeated_tick…` (replay), `test_legacy_rejected_phase_key…`; новый `test_squatted_phase_key_conflict_is_terminal_not_dangerous` |
| BOLA / CH3 denial | существующие `test_other_accounts_cannot_touch_foreign_schedules`, `test_ch3_cannot_be_scheduled_in_any_direction` (+ schema CHECK) |
| Stale/replay telemetry, SEC-002 | security-набор `test_telemetry_correlation.py`; новые `test_channels_only_telemetry_never_resolves_uncertain_schedule`, `test_late_correlation_outside_send_window_leaves_schedule_uncertain`, `test_end_phase_timeout_reconciled_match_completes`, `…mismatch_rejects` |
| Worker default disabled + clean shutdown | существующий `test_worker_lifespan_is_opt_in_and_joins_on_shutdown`; новый `test_worker_shutdown_joins_active_pass` |
| Concurrency tick/worker без дублей | существующий `test_restart_and_concurrent_ticks_insert_one_phase`; новый `test_concurrent_worker_passes_insert_one_phase` |
| Fault injection / damaged state | новые `test_worker_pass_isolates…`, `test_missing_command_row_rejects_schedule`, `test_future_dated_measurement_blocks_create_and_dispatch`, `test_stale_closing_off_rejects_and_load_stays_on_for_operator`, `test_cancelled_command_terminates_linked_schedule` |
| Clock rollback / leap day | новые `test_clock_rollback_after_dispatch_never_reissues_start`, `test_leap_day_window_runs_on_epoch_math` |

Все тесты детерминированы: VirtualClock, ни одного `sleep`, нет зависимости от порядка неупорядоченных выборок.

## 5. Code review

* **Security/architecture** (read-only субагент): вердикт **SHIP**, 0 Critical / 0 Important. Подтверждены: `except Exception` не ловит `BaseException` (KeyboardInterrupt/SystemExit проходят); runner полон по статус-домену и не может выдать команду дважды (терминальный статус исключён из `_ACTIVE`, phase key поглощён UNIQUE-ограничением); BOLA/CH3/consent/manual/freshness/SEC-002 не тронуты; мобильный парсер `scheduler-api.ts` принимает `rejected`+`reason='command_cancelled'` (17 символов < 128) без изменений контракта; SQL-инъекций в diff нет.
* Миноры ревью (зафиксированы, правки не требуются): (1) блок чтения списка контроллеров в `run_worker_pass` вне per-controller guard — падение ловится внешним циклом lifespan и не может быть отравлено одним контроллером; (2) прямая отмена уже `sent`-команды сторонним писателем оставляет состояние нагрузки операторски-неоднозначным — тот же уровень доверия, что и сама прямая запись в БД, аудит есть; (3) пре-создание сторонним писателем same-intent команды под phase key в статусе `cancelled` даёт один неточный тик `dispatched_start`, после чего новая ветка cleanly завершает расписание — самовосстановление вместо зависания.
* **Test/scenario review** (read-only субагент): вердикт — production diff **ship** (оба новых фикс-теста проваливаются при полном откате фиксов), но isolation-тест требовал укрепления. Принятые findings (коммит `ab2f24f`):
  - F1 (Medium): порядок контроллеров в `SELECT DISTINCT` не упорядочен — ослабленный фикс (один try/except на весь цикл) проходил бы тест ~50% прогонов. Усиление: оба контроллера выполняют реальный dispatch и лишь затем бросают fault → ослабленный вариант никогда не обслужит оба контроллера за проход. **Проверено мутантом**: тест против ослабленного варианта падает детерминированно, против реального фикса — зелёный.
  - F2 (Medium-Low): fault на входе в `run_due_schedules` делал rollback-assertion вакуальным (отсутствие записи неотличимо от «не писал»). Теперь partial write реально происходит и откатывается.
  - F3 (Low): тест future-dated сэмпла больше не привязан к порядку engine-проверок — ассерт по множеству failing-checks.
  - F5 (Low): тест cancelled-команды дополнительно ассертит audit-событие `schedule.rejected`.
  - F4 (Low): wall-clock верхние границы (Event.wait 5 c) — приняты как есть, не «фиксились» снами.
  - F6 (Info): на sql()-хелпере добавлен комментарий о намеренном обходе FK.
  - Добавлены 2 предложенных теста: **tick-vs-worker гонка** (исходо-независимые инварианты: ≤1 dispatched_start, ровно 1 команда, расписание running) и **разрешение неопределённости после истечения окна → немедленный fail-safe close** (адаптация предложения ревьюера: описанный им сценарий «late ack» недостижим через API — correlation-окно 30 c после send блокирует поздний reconcile; реализован достижимый вариант с reconcile внутри окна и закрытием после end_at).

## 6. Performance (изолированные измерения, только временные SQLite)

* `_command_in_flight` scan (текущий индекс `commands(controller_id, created_at)`): **1.37 мс** на 20 000 терминальных строк; **20.3 мс** на 100 000 строк. С гипотетическим индексом `(controller_id, status)`: 0.037 мс / 0.108 мс.
* Полный HTTP tick при 20k исторических команд: медиана ~9 мс (индекс значимой разницы не даёт на этом объёме).
* Discovery-запрос воркера по 10k строк schedules: 0.62 мс/проход (с индексом `(status, controller_id)`: 0.05 мс).
* Вывод: на учебных объёмах (≤20k) узкое место отсутствует; scan становится заметным только на ~100k команд (один dispatch-попытка за tick). Bounded-поведения подтверждены: один dispatch за проход на контроллер, фиксированный цикл poll 0.05–60 c, `BEGIN IMMEDIATE` c busy-timeout 10 c, join при shutdown.

## 7. Patch proposals вне зоны владения (интегратору, НЕ применено)

1. **Индексы** (schema v4, отдельная миграция — схема не моя зона): `CREATE INDEX IF NOT EXISTS commands_status ON commands(controller_id, status);` и опционально `CREATE INDEX IF NOT EXISTS schedules_status ON schedules(status, controller_id);` — оправданы только при росте истории команд до ~100k (см. §6). Без них поведение корректно.
2. Дефектов в `app.py`, требующих патча, не найдено: guard-конвейер `issue_command`/`command_rejection`, SEC-002 correlation и транзакционные границы выдержали все fault-сценарии. Повторно подтверждённое документированное ограничение (не дефект): устаревшие измерения к моменту закрывающего `off` дают терминальный `end_phase_stale_measurements` и нагрузка остаётся включённой до ручной операции оператора (философия «нет догадок о состоянии», зафиксирована тестом).

## 8. Rejected alternatives

* **Ретрай транзиентных guard-отказов (stale/peak) в runner.** Отклонено: idempotency key фазы уже поглощён сохранённой rejected-командой; авторазнал бы нарушил контракт «rejected-записи не переигрываются» и потребовал бы schema-изменение. Поведение документировано (новое явное расписание).
* **Переписать `_command_in_flight` под короткий scan.** Отклонено: любая формулировка с сортировкой по `created_at` не даёт верхнего ограничения худшего случая (in-flight может быть старым); корректность важнее микросекунд, вопрос решается индексом (§7).
* **Отмена in-flight `sent`-команды при cancel.** Отклонено (соответствует существующему контракту): отправленную команду отозвать нельзя, cancel не должен маскировать продолжающуюся нагрузку.
* **Автоматический fabricate-ack в worker.** Запрещено заданием и дизайном: worker выдаёт только `requested`-команды; разрешение неоднозначностей — только через авторитетную телеметрию владельца.

## 9. Окружение / доступность инструментов

* Skills: загружены `specwatt-project-guardrails`, `using-git-worktrees`, `systematic-debugging`, `test-driven-development`, `executing-plans`, `receiving-code-review`, `verification-before-completion`, `specwatt-merge-gate`, `finishing-a-development-branch`. Отдельные SDD-скрипты воркспейса в проекте отсутствуют — процесс вёлся по заданию миссии с ledger-обязанностями этого документа.
* MCP (Context7 / Expo Docs / Figma): в этой backend-задаче не использовались — UI/Figma-контекст не затронут (визуальной части у задачи нет, backend-only).
* Субагенты: два read-only (Explore) ревьюера, единственный writer — основной агент; дочерним агентам запись/коммиты/переключение веток не передавались.
* Git identity коммитов: `ZCode Scheduler Reliability Agent <zcode-scheduler@localhost>` (локальная конфигурация worktree, глобальная identity владельца не использовалась).

## 10. Известные ограничения передачи

* Draft PR создан из CLI `gh`; CI-статусы PR на момент создания не оценивались (нет доступа к результатам Actions из окружения — проверка при merge-гейте).
* npm/pip advisories не пересматривались (изменений зависимостей нет; baseline-перенос advisories — известное состояние из merge-gate).
* Native/эмуляторные проверки к этой задаче неприменимы (backend-only); веб-превью не использовалось.
