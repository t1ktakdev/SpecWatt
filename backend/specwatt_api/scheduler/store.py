"""Durable schedule storage on SQLite (schema version 2).

Schedules live in their own table added by the versioned migration in
``app.migrate``. All writes happen inside caller-managed transactions
(``BEGIN IMMEDIATE``), matching the core command pipeline. Statuses and their
meaning are documented in docs/SCHEDULER_DESIGN.md.
"""
import sqlite3
import uuid

from .models import ScheduleStatus

ACTIVE_STATUSES = ('pending', 'running', 'uncertain')
DISPATCHABLE_STATUSES = ('pending', 'running', 'uncertain')


def schedule_json(row) -> dict:
    """Public JSON shape; matches the documented API contract."""
    return {'id': row['id'], 'controller_id': row['controller_id'], 'channel_id': row['channel_id'],
            'action': row['action'], 'start_at': row['start_at'], 'end_at': row['end_at'],
            'duration_seconds': row['end_at'] - row['start_at'] if row['action'] == 'on' else None,
            'priority': row['priority'], 'status': row['status'], 'phase': row['phase'],
            'command_id': row['command_id'], 'rejection_reason': row['rejection_reason'],
            'note': row['note'], 'created_at': row['created_at'], 'updated_at': row['updated_at'],
            'source': 'simulator'}


def get_schedule(db: sqlite3.Connection, controller_id: str, schedule_id: str):
    return db.execute('SELECT * FROM schedules WHERE controller_id=? AND id=?',
                      (controller_id, schedule_id)).fetchone()


def list_schedules(db: sqlite3.Connection, controller_id: str, status: str | None = None,
                   limit: int = 100) -> list:
    if status is None:
        rows = db.execute('SELECT * FROM schedules WHERE controller_id=? ORDER BY start_at DESC LIMIT ?',
                          (controller_id, limit)).fetchall()
    else:
        rows = db.execute('SELECT * FROM schedules WHERE controller_id=? AND status=? ORDER BY start_at DESC LIMIT ?',
                          (controller_id, status, limit)).fetchall()
    return rows


def active_schedules(db: sqlite3.Connection, controller_id: str) -> list:
    """Every pending/running/uncertain schedule, ascending by start (deterministic)."""
    return db.execute('SELECT * FROM schedules WHERE controller_id=? AND status IN (?,?,?) '
                      'ORDER BY start_at, created_at', (controller_id, *ACTIVE_STATUSES)).fetchall()


def create_schedule(db: sqlite3.Connection, controller_id: str, plan: dict, now: float,
                    note: str = '') -> dict:
    schedule_id = str(uuid.uuid4())
    db.execute('INSERT INTO schedules(id,controller_id,channel_id,action,start_at,end_at,priority,'
               'status,phase,command_id,rejection_reason,note,created_at,updated_at) '
               'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
               (schedule_id, controller_id, plan['channel_id'], plan['action'], plan['start_at'],
                plan['end_at'], plan.get('priority', 0), ScheduleStatus.PENDING.value, 'start',
                None, None, note, now, now))
    return get_schedule(db, controller_id, schedule_id)


def update_schedule_fields(db: sqlite3.Connection, controller_id: str, schedule_id: str,
                           fields: dict, now: float):
    # SQL identifiers cannot be bound. Accept only these internal column names;
    # every value and owner/schedule identifier remains a bound parameter. This
    # finite allowlist is also the justification for the B608 exclusion below.
    allowed = {'start_at', 'end_at', 'priority', 'note', 'status', 'phase',
               'command_id', 'rejection_reason', 'updated_at'}
    if not fields or not set(fields).issubset(allowed):
        raise ValueError('Unsupported schedule update fields')
    assignments = ', '.join(f'{name}=?' for name in fields)
    db.execute(f'UPDATE schedules SET {assignments},updated_at=? WHERE controller_id=? AND id=?',  # nosec B608
               (*fields.values(), now, controller_id, schedule_id))


def set_status(db: sqlite3.Connection, controller_id: str, schedule_id: str, status: str,
               now: float, phase: str | None = None, command_id: str | None = None,
               rejection_reason: str | None = None):
    """Status transition helper; also writes the audit event via caller's db."""
    fields: dict = {'status': status, 'updated_at': now}
    if phase is not None:
        fields['phase'] = phase
    if command_id is not None:
        fields['command_id'] = command_id
    if rejection_reason is not None:
        fields['rejection_reason'] = rejection_reason
    update_schedule_fields(db, controller_id, schedule_id, fields, now)


def plain(row) -> dict:
    """sqlite3.Row -> plain dict (engine helpers expect mapping access)."""
    return {key: row[key] for key in row.keys()} if not isinstance(row, dict) else row
