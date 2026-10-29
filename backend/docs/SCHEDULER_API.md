# Scheduler API — контракты и примеры

Авторизация и соглашения полностью наследуются от ядра (см. `backend/README.md`):
`Authorization: Bearer <access_token>`, время — Unix-секунды UTC, неизвестные
поля запросов отклоняются (422), все ответы помечены `source: 'simulator'`.
Полная машинная схема: [`openapi.json`](openapi.json) (генерируется
`python scripts/export_openapi.py`; публичные `/docs` и `/openapi.json` на
сервере намеренно отключены).

Машиночитаемые коды ошибок повторяют словарь ядра: `protected_channel`,
`stale_measurements`, `automation_not_allowed`, `manual_priority_active`,
`peak_exceeded`, `nominal_exceeds_peak`, `schedule_conflict`, `invalid_time_window`,
`schedule_not_modifiable`, `schedule_not_active`, `schedule_not_found`.

## Эндпоинты

| Метод и маршрут | Назначение |
| --- | --- |
| `POST /v1/controllers/{cid}/scheduler/evaluate` | проверка гипотетического плана без создания |
| `POST /v1/controllers/{cid}/schedules` | создание расписания (201) |
| `GET /v1/controllers/{cid}/schedules?status=&limit=` | список (статус из 6 значений, limit 1–200) |
| `GET /v1/controllers/{cid}/schedules/{sid}` | детали + связанная команда с историей переходов |
| `PATCH /v1/controllers/{cid}/schedules/{sid}` | изменение только в `pending` (start/duration/priority/note) |
| `POST /v1/controllers/{cid}/schedules/{sid}/cancel` | отмена (`pending`/`running`/`uncertain`) |
| `POST /v1/controllers/{cid}/scheduler/tick` | исполнить дозревшие расписания в текущее время часов |

## Создание

```http
POST /v1/controllers/{cid}/schedules
{"channel_id": "CH1", "action": "on", "start_at": 1793109600.0,
 "duration_seconds": 1800, "priority": 0, "note": "демо"}
```

`start_at` — строго в будущем и не дальше 7 суток; `action:'on'` требует
`duration_seconds` ≥ 1, `action:'off'` — запрещает его. Успех → 201:

```json
{
  "schedule": {"id": "b34e…", "controller_id": "…", "channel_id": "CH1",
               "action": "on", "start_at": 1793109600.0, "end_at": 1793111400.0,
               "duration_seconds": 1800.0, "priority": 0, "status": "pending",
               "phase": "start", "command_id": null, "rejection_reason": null,
               "note": "демо", "created_at": 1793109540.0, "updated_at": 1793109540.0,
               "source": "simulator"},
  "evaluation": {
    "feasible": true, "verdict": "feasible",
    "checks": [{"code": "protected_channel", "ok": true},
               {"code": "stale_measurements", "ok": true},
               {"code": "automation_not_allowed", "ok": true},
               {"code": "manual_priority_active", "ok": true},
               {"code": "window_in_past", "ok": true},
               {"code": "window_too_far", "ok": true},
               {"code": "schedule_conflict", "ok": true, "detail": {"schedule_ids": []}},
               {"code": "nominal_exceeds_peak", "ok": true,
                "detail": {"minimal_load_watts": 4.2, "peak_watts": 7.0}},
               {"code": "peak_exceeded", "ok": true,
                "detail": {"projected_peak_watts": 4.2, "peak_watts": 7.0}}],
    "projection": {
      "window": {"start_at": 1793109600.0, "end_at": 1793111400.0},
      "segments": [{"start_at": 1793109600.0, "end_at": 1793111400.0, "watts": 4.2,
                    "basis": "forecast", "source": "schedule"}],
      "projected_peak_watts": 4.2, "projected_peak_at": 1793109600.0,
      "peak_headroom_watts": 2.8,
      "plan_energy_wh": 2.1, "baseline_energy_wh": 1.2, "delta_energy_wh": 0.9,
      "device_energy_wh": 0.9, "above_peak_duration_s": 0.0},
    "suggestions": []}
}
```

Отказ → 409 (состояние) с `detail.code` и полной `evaluation`, либо 422
`invalid_time_window` для прошедшего/слишком далёкого старта. Пример
конфликта пика с подсказками:

```json
{"detail": {"code": "peak_exceeded", "evaluation": {"feasible": false,
  "suggestions": [{"start_at": 1793111400.0, "end_at": 1793113200.0,
                   "projected_peak_watts": 6.6}]}}}
```

## Preview

```http
POST /v1/controllers/{cid}/scheduler/evaluate
{"channel_id": "CH2", "action": "on", "start_at": 1793109600.0,
 "duration_seconds": 1800}
```

→ 200 с той же формой `evaluation` (ничего не создаёт).

## Изменение (только pending)

```http
PATCH /v1/controllers/{cid}/schedules/{sid}
{"start_at": 1793109660.0, "duration_seconds": 900, "priority": 3, "note": "пораньше"}
```

→ 200 `{schedule, evaluation}` (полная ревалидация, расписание само исключено
из проверки конфликтов). Ошибки: 404 `schedule_not_found`, 409
`schedule_not_modifiable` (не pending), 409/422 как при создании.

## Отмена

```http
POST /v1/controllers/{cid}/schedules/{sid}/cancel
```

→ 200 с расписанием в `cancelled`. Повторная отмена и отмена терминальных →
409 `schedule_not_active`. Расписание после отмены не исполняется; команда,
уже находящаяся in-flight, завершает собственный жизненный цикл ядра.

## Tick

```http
POST /v1/controllers/{cid}/scheduler/tick
```

→ 200:

```json
{"now": 1793109600.0,
 "processed": [{"schedule_id": "b34e…", "channel_id": "CH1", "action": "on",
                "phase": "start", "result": "dispatched_start",
                "command_id": "…"}],
 "snapshot": {"…полный снимок контроллера…"}}
```

Значения `result`: `dispatched_start`, `dispatched_end`, `start_confirmed`,
`completed`, `rejected` (+`reason`), `uncertain`, `waiting_command`
(+`command_status`), `deferred_command_in_flight`. Журнал — существующий
`GET .../events`: события `schedule.created|updated|cancelled|dispatched|
completed|rejected|uncertain` несут `channel_id`, `command_id`, `reason`.

## Список и детали

```http
GET /v1/controllers/{cid}/schedules?status=running&limit=100
GET /v1/controllers/{cid}/schedules/{sid}
```

Детали при наличии команды:

```json
{"schedule": {"…": "…"},
 "command": {"id": "…", "status": "acknowledged", "origin": "schedule",
             "transitions": [{"status": "requested", "at": 1793109600.0},
                             {"status": "sent", "at": 1793109600.0},
                             {"status": "acknowledged", "at": 1793109600.0}]}}
```

## Рекомендуемый цикл для фронтенда

1. `POST /scheduler/evaluate` — показать пользователю прогноз (пик, энергия,
   подсказки) до создания.
2. `POST /schedules` — создать; `status='pending'`, метрики уже в ответе.
3. `POST /scheduler/tick` — когда время дошло (или по кнопке/таймеру
   приложения); повторять, пока в `processed` есть
   `dispatched_*`/`deferred_command_in_flight`, затем `/simulator/step` как в
   ядре, затем tick для отслеживания статуса.
4. `GET /schedules/{sid}` — показать состояние и историю команды.
5. `status='uncertain'` — показать «результат неизвестен», дождаться
   телеметрии (reconciled), не предлагать автоматический повтор.

Числа в примерах: контроллер с CH1 (номинал 1.8 Вт, согласие включено), CH3 —
защищённые 2.4 Вт; пик 7.0 Вт; база 2026-10-27 14:00 UTC (`1793109600.0`).
