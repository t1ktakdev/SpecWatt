"""Due-schedule execution (the tick).

The runner never sleeps and never spawns threads: each call to
``run_due_schedules`` is one synchronous pass over the controller's active
schedules at the app clock's current time, inside a caller-owned
``BEGIN IMMEDIATE`` transaction. Tests (and, later, an operator process)
advance the clock and call the tick endpoint explicitly, which keeps every
dispatch auditable and reproducible.

State machine (see docs/SCHEDULER_DESIGN.md):

    pending ──tick(start due)──▶ running(command=start) ──ack──▶ running(phase=end)
       │                            │                               │
       ├─ rejected (guard/missed)   ├─ timeout/transport ─▶ uncertain
       │                            ├─ rejected (guard) ──▶ rejected
       │                            └─ reconciled: match ─▶ as ack; else rejected
       └─ off action: ack ─▶ completed              end phase ack ─▶ completed

Every phase command is issued through the shared ``issue_command`` core, so
CH3 protection, consent, manual hold, freshness, peak limit and command
idempotency are enforced exactly as for interactive commands — the scheduler
has no way around them. Repeated ticks are safe: each phase derives a stable
idempotency key, and status transitions happen in the same transaction as the
command insert, so a schedule can never dispatch a phase twice.
"""
from ..app import event, issue_command
from . import store
from .models import MAX_LATE_OFF_SECONDS, ScheduleAction, ScheduleStatus

_ACTIVE = (ScheduleStatus.PENDING.value, ScheduleStatus.RUNNING.value, ScheduleStatus.UNCERTAIN.value)


def _phase_key(schedule_id: str, phase: str) -> str:
    """Stable idempotency key; matches the command key charset."""
    return f'schedule-{schedule_id}-{phase}'


def _record(schedule, result, **extra) -> dict:
    return {'schedule_id': schedule['id'], 'channel_id': schedule['channel_id'],
            'action': schedule['action'], 'phase': schedule['phase'], 'result': result, **extra}


def _dispatch_start(db, controller, schedule, now) -> dict:
    """Try to issue the start-phase command for a due pending schedule."""
    cid = controller['id']
    end_at = float(schedule['end_at'])
    if schedule['action'] == ScheduleAction.ON.value:
        if now > end_at:
            # The whole window passed while the schedule waited (e.g. server
            # downtime): acting now would violate the owner's intent.
            store.set_status(db, cid, schedule['id'], ScheduleStatus.REJECTED.value, now,
                             rejection_reason='window_missed')
            event(db, cid, 'schedule.rejected', schedule['channel_id'], schedule['id'],
                  'window_missed', now)
            return _record(schedule, 'rejected', reason='window_missed')
    elif now > float(schedule['start_at']) + MAX_LATE_OFF_SECONDS:
        store.set_status(db, cid, schedule['id'], ScheduleStatus.REJECTED.value, now,
                         rejection_reason='window_missed')
        event(db, cid, 'schedule.rejected', schedule['channel_id'], schedule['id'], 'window_missed', now)
        return _record(schedule, 'rejected', reason='window_missed')

    on = schedule['action'] == ScheduleAction.ON.value
    command, rejection = issue_command(db, controller, schedule['channel_id'], on, 'schedule',
                                       _phase_key(schedule['id'], 'start'), now)
    if rejection == 'command_in_flight':
        # Transient by definition (one command resolves eventually); retry on
        # a later tick instead of failing the schedule.
        return _record(schedule, 'deferred_command_in_flight')
    if rejection:
        store.set_status(db, cid, schedule['id'], ScheduleStatus.REJECTED.value, now,
                         rejection_reason=rejection)
        event(db, cid, 'schedule.rejected', schedule['channel_id'], schedule['id'], rejection, now)
        return _record(schedule, 'rejected', reason=rejection)
    store.set_status(db, cid, schedule['id'], ScheduleStatus.RUNNING.value, now,
                     command_id=command['id'])
    event(db, cid, 'schedule.dispatched', schedule['channel_id'], command['id'], 'start', now)
    return _record(schedule, 'dispatched_start', command_id=command['id'])


def _complete(db, controller, schedule, now) -> dict:
    store.set_status(db, controller['id'], schedule['id'], ScheduleStatus.COMPLETED.value, now)
    event(db, controller['id'], 'schedule.completed', schedule['channel_id'], schedule['id'], None, now)
    return _record(schedule, 'completed')


def _reject(db, controller, schedule, reason, now) -> dict:
    store.set_status(db, controller['id'], schedule['id'], ScheduleStatus.REJECTED.value, now,
                     rejection_reason=reason)
    event(db, controller['id'], 'schedule.rejected', schedule['channel_id'], schedule['id'], reason, now)
    return _record(schedule, 'rejected', reason=reason)


def _go_uncertain(db, controller, schedule, now) -> dict:
    store.set_status(db, controller['id'], schedule['id'], ScheduleStatus.UNCERTAIN.value, now)
    event(db, controller['id'], 'schedule.uncertain', schedule['channel_id'], schedule['id'],
          schedule['command_id'], now)
    return _record(schedule, 'uncertain')


def _dispatch_end(db, controller, schedule, now) -> dict:
    """Fail-safe closing off. Late execution is intentional: a device that
    ran its window must not stay on because the tick came late. Only a
    transient in-flight command defers it; other rejections are terminal and
    audited (documented limitation: an operator must then reconcile)."""
    cid = controller['id']
    command, rejection = issue_command(db, controller, schedule['channel_id'], False, 'schedule',
                                       _phase_key(schedule['id'], 'end'), now)
    if rejection == 'command_in_flight':
        return _record(schedule, 'deferred_command_in_flight')
    if rejection:
        return _reject(db, controller, schedule, 'end_phase_' + rejection, now)
    store.set_status(db, cid, schedule['id'], ScheduleStatus.RUNNING.value, now,
                     phase='end', command_id=command['id'])
    event(db, cid, 'schedule.dispatched', schedule['channel_id'], command['id'], 'end', now)
    return _record(schedule, 'dispatched_end', command_id=command['id'])


def _advance(db, controller, schedule, now) -> dict:
    """Track the linked command and move running/uncertain schedules forward."""
    cid = controller['id']
    command = db.execute('SELECT * FROM commands WHERE id=? AND controller_id=?',
                         (schedule['command_id'], cid)).fetchone()
    if command is None:
        return _reject(db, controller, schedule, 'missing_command', now)
    status = command['status']
    if status in ('requested', 'sent'):
        return _record(schedule, 'waiting_command', command_status=status)
    if status in ('timeout', 'transport-error'):
        # Ambiguous result: never re-send on our own. A complete authoritative
        # telemetry sample (existing reconciliation flow) resolves it later.
        return _go_uncertain(db, controller, schedule, now)
    if status == 'rejected':
        return _reject(db, controller, schedule, 'command_' + (command['reason'] or 'rejected'), now)
    if status == 'reconciled':
        if command['reason'] != 'simulator_telemetry_matches_target':
            return _reject(db, controller, schedule, 'target_not_reached', now)
        status = 'acknowledged'  # target state confirmed by an authoritative sample
    if status != 'acknowledged':
        return _record(schedule, 'waiting_command', command_status=status)

    if schedule['phase'] == 'end':
        return _complete(db, controller, schedule, now)
    if schedule['action'] == ScheduleAction.OFF.value:
        return _complete(db, controller, schedule, now)
    if now < float(schedule['end_at']):
        # Start confirmed; closing off happens when the window ends.
        return _record(schedule, 'start_confirmed')
    return _dispatch_end(db, controller, schedule, now)


def run_due_schedules(db, controller, now) -> list[dict]:
    """One synchronous pass over active schedules at time ``now``.

    The caller must own a write transaction and pass the app clock's time.
    Returns one record per touched schedule, suitable for the tick response.
    """
    cid = controller['id']
    placeholders = ','.join('?' * len(_ACTIVE))
    rows = db.execute(f'SELECT * FROM schedules WHERE controller_id=? AND status IN ({placeholders}) '
                      'ORDER BY start_at, created_at', (cid, *_ACTIVE)).fetchall()
    processed: list[dict] = []
    for row in rows:
        schedule = store.plain(row)
        if schedule['status'] == ScheduleStatus.PENDING.value:
            if now < float(schedule['start_at']):
                continue
            processed.append(_dispatch_start(db, controller, schedule, now))
        else:
            processed.append(_advance(db, controller, schedule, now))
    return processed
