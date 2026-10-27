"""Scheduler API routes.

Mounted by ``app.create_app`` with the app's own clock and ``user``
dependency, so schedules inherit the exact same bearer-session auth and
owner scoping as every other controller route. Endpoints are additive and
never change existing response shapes.
"""
from fastapi import Depends, HTTPException

from ..app import command_json, connect, event, owned, snapshot, transition
from . import engine, runner, store
from .models import (MAX_HORIZON_SECONDS, MIN_DURATION_SECONDS, ScheduleCreate,
                     ScheduleEvaluate, ScheduleStatus, ScheduleUpdate, plan_window)

_TERMINAL_STATUSES = {ScheduleStatus.COMPLETED.value, ScheduleStatus.CANCELLED.value,
                      ScheduleStatus.REJECTED.value}
_TIME_CODES = {'window_in_past', 'window_too_far'}


def register_scheduler_routes(app, path: str, clock, user_dependency):
    user = user_dependency

    def load_channels(db, cid):
        return db.execute('SELECT * FROM channels WHERE controller_id=? ORDER BY id', (cid,)).fetchall()

    def plan_of(payload) -> dict:
        start, end = plan_window(payload.action, payload.start_at, payload.duration_seconds)
        return {'channel_id': payload.channel_id, 'action': payload.action,
                'start_at': start, 'end_at': end, 'priority': getattr(payload, 'priority', 0)}

    def rejection_response(evaluation: dict):
        """Map engine checks to the API's 422/409 error vocabulary."""
        failing = [c['code'] for c in evaluation['checks'] if not c['ok']]
        if set(failing) & _TIME_CODES:
            return HTTPException(422, detail={'code': 'invalid_time_window', 'checks': failing,
                                              'evaluation': evaluation})
        return HTTPException(409, detail={'code': failing[0], 'evaluation': evaluation})

    @app.post('/v1/controllers/{cid}/scheduler/evaluate')
    def evaluate(cid: str, payload: ScheduleEvaluate, uid=Depends(user)):
        """Feasibility preview for a hypothetical plan; writes nothing."""
        with connect(path) as db:
            controller = owned(db, cid, uid)
            evaluation = engine.evaluate_plan(load_channels(db, cid), store.active_schedules(db, cid),
                                              controller, plan_of(payload), clock.now())
        return evaluation

    @app.post('/v1/controllers/{cid}/schedules', status_code=201)
    def create_schedule(cid: str, payload: ScheduleCreate, uid=Depends(user)):
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            controller = owned(db, cid, uid)
            plan = plan_of(payload)
            evaluation = engine.evaluate_plan(load_channels(db, cid), store.active_schedules(db, cid),
                                              controller, plan, clock.now())
            if not evaluation['feasible']:
                raise rejection_response(evaluation)
            row = store.create_schedule(db, cid, plan, clock.now(), note=payload.note)
            event(db, cid, 'schedule.created', plan['channel_id'], row['id'], None, clock.now())
            return {'schedule': store.schedule_json(row), 'evaluation': evaluation}

    @app.get('/v1/controllers/{cid}/schedules')
    def list_schedules(cid: str, status: str | None = None, limit: int = 100, uid=Depends(user)):
        if status is not None and status not in {s.value for s in ScheduleStatus}:
            raise HTTPException(422, detail={'code': 'invalid_status'})
        if not 1 <= limit <= 200:
            raise HTTPException(422, detail={'code': 'invalid_limit'})
        with connect(path) as db:
            owned(db, cid, uid)
            return [store.schedule_json(r) for r in store.list_schedules(db, cid, status, limit)]

    @app.get('/v1/controllers/{cid}/schedules/{schedule_id}')
    def get_schedule(cid: str, schedule_id: str, uid=Depends(user)):
        with connect(path) as db:
            owned(db, cid, uid)
            row = store.get_schedule(db, cid, schedule_id)
            if row is None:
                raise HTTPException(404, detail={'code': 'schedule_not_found'})
            result = {'schedule': store.schedule_json(row)}
            if row['command_id']:
                command = db.execute('SELECT * FROM commands WHERE id=? AND controller_id=?',
                                     (row['command_id'], cid)).fetchone()
                if command is not None:
                    result['command'] = command_json(command)
            return result

    @app.patch('/v1/controllers/{cid}/schedules/{schedule_id}')
    def modify_schedule(cid: str, schedule_id: str, payload: ScheduleUpdate, uid=Depends(user)):
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            controller = owned(db, cid, uid)
            row = store.get_schedule(db, cid, schedule_id)
            if row is None:
                raise HTTPException(404, detail={'code': 'schedule_not_found'})
            if row['status'] != ScheduleStatus.PENDING.value:
                raise HTTPException(409, detail={'code': 'schedule_not_modifiable'})
            if row['action'] == 'off' and payload.duration_seconds is not None:
                raise HTTPException(422, detail={'code': 'duration_not_allowed_for_off'})
            plan = store.plain(row)
            plan['priority'] = payload.priority if payload.priority is not None else row['priority']
            plan['start_at'] = payload.start_at if payload.start_at is not None else row['start_at']
            duration = payload.duration_seconds if payload.duration_seconds is not None else row['end_at'] - row['start_at']
            plan['end_at'] = plan['start_at'] + duration
            # Conflict validation must not match the schedule being moved.
            others = [s for s in store.active_schedules(db, cid) if s['id'] != schedule_id]
            evaluation = engine.evaluate_plan(load_channels(db, cid), others, controller, plan, clock.now())
            if not evaluation['feasible']:
                raise rejection_response(evaluation)
            fields = {'start_at': plan['start_at'], 'end_at': plan['end_at'], 'priority': plan['priority'],
                      'rejection_reason': None}
            if payload.note is not None:
                fields['note'] = payload.note
            store.update_schedule_fields(db, cid, schedule_id, fields, clock.now())
            event(db, cid, 'schedule.updated', plan['channel_id'], schedule_id, None, clock.now())
            return {'schedule': store.schedule_json(store.get_schedule(db, cid, schedule_id)),
                    'evaluation': evaluation}

    @app.post('/v1/controllers/{cid}/schedules/{schedule_id}/cancel')
    def cancel_schedule(cid: str, schedule_id: str, uid=Depends(user)):
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            owned(db, cid, uid)
            row = store.get_schedule(db, cid, schedule_id)
            if row is None:
                raise HTTPException(404, detail={'code': 'schedule_not_found'})
            if row['status'] in _TERMINAL_STATUSES:
                raise HTTPException(409, detail={'code': 'schedule_not_active'})
            now = clock.now()
            # A locally queued command has not been sent and can be retracted.
            # Sent/acknowledged commands retain their own lifecycle; cancellation
            # stops future phases and does not assert that the load is off.
            if row['command_id']:
                command = db.execute('SELECT * FROM commands WHERE id=? AND controller_id=?',
                                     (row['command_id'], cid)).fetchone()
                if command is not None and command['status'] == 'requested':
                    transition(db, command, 'cancelled', 'schedule_cancelled', now)
            # A schedule must never execute after cancellation: the runner
            # only dispatches from statuses this update leaves behind, and
            # both statements share this transaction.
            store.set_status(db, cid, schedule_id, ScheduleStatus.CANCELLED.value, now)
            event(db, cid, 'schedule.cancelled', row['channel_id'], schedule_id, None, now)
            return store.schedule_json(store.get_schedule(db, cid, schedule_id))

    @app.post('/v1/controllers/{cid}/scheduler/tick')
    def tick(cid: str, uid=Depends(user)):
        """Process due schedules at the current app-clock time.

        Every caller sees exactly one synchronous pass. The optional worker
        uses the same runner and transaction rules; it is disabled by default.
        """
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            controller = owned(db, cid, uid)
            now = clock.now()
            processed = runner.run_due_schedules(db, controller, now)
            return {'now': now, 'processed': processed,
                    'snapshot': snapshot(db, owned(db, cid, uid), now)}

    # Keep MIN_DURATION_SECONDS/MAX_HORIZON_SECONDS importable for consumers
    # that document the limits alongside this module.
    app.state.scheduler_limits = {'min_duration_seconds': MIN_DURATION_SECONDS,
                                  'max_horizon_seconds': MAX_HORIZON_SECONDS}
