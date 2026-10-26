"""Local-only foundation. No physical controller transport is implemented here."""
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from typing import Literal
import uuid
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field, field_validator

from .base import CHANNELS, FRESH_SECONDS, Input
from .clock import SystemClock

SESSION_SECONDS = 86400


class Credentials(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128, repr=False)

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        value = value.strip().casefold()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('invalid_email')
        return value


class ControllerInput(Input):
    name: str = Field(min_length=1, max_length=80)

    @field_validator('name')
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError('empty_name')
        return value.strip()


class Assignment(Input):
    name: str = Field(min_length=1, max_length=80)
    room: str = Field(max_length=80)
    image: Literal['lamp', 'led-strip', 'fan', 'charger', 'socket', 'appliance']
    allow_auto: bool

    @field_validator('name')
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError('empty_name')
        return value.strip()


class CommandInput(Input):
    channel_id: Literal['CH1', 'CH2', 'CH3']
    on: bool
    origin: Literal['manual', 'autopilot', 'schedule'] = 'manual'
    idempotency_key: str = Field(min_length=8, max_length=128, pattern=r'^[a-zA-Z0-9_-]+$')


class StepInput(Input):
    outcome: Literal['acknowledged', 'timeout', 'transport-error'] = 'acknowledged'


class TelemetryInput(Input):
    channels: dict[str, float]

    @field_validator('channels')
    @classmethod
    def supported_values(cls, values):
        if set(values) != set(CHANNELS):
            raise ValueError('complete_channel_snapshot_required')
        for channel, watts in values.items():
            allowed = (CHANNELS[channel],) if channel == 'CH3' else (0.0, CHANNELS[channel])
            if watts not in allowed:
                raise ValueError('simulator_only_supports_nominal_or_zero_power')
        return values


class SettingsInput(Input):
    peak_watts: float = Field(ge=2.4, le=8.4, allow_inf_nan=False)
    manual_priority_minutes: int = Field(ge=1, le=120)


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    # OWASP's 32 MiB scrypt profile. Include work factors for future migrations.
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3,
                            dklen=32, maxmem=64 * 1024 * 1024)
    return 'scrypt$32768$8$3$' + salt + '$' + digest.hex()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@contextmanager
def connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()


def migrate(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        version = db.execute('PRAGMA user_version').fetchone()[0]
        if version > 2:
            raise RuntimeError('Database schema is newer than this server')
        db.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL, created_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                expires_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS controllers (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
                name TEXT NOT NULL, source TEXT NOT NULL CHECK(source='simulator'),
                measured_at REAL NOT NULL, uncertain INTEGER NOT NULL DEFAULT 0,
                peak_watts REAL NOT NULL DEFAULT 7,
                manual_priority_minutes INTEGER NOT NULL DEFAULT 30);
            CREATE TABLE IF NOT EXISTS channels (
                controller_id TEXT NOT NULL REFERENCES controllers(id),
                id TEXT NOT NULL CHECK(id IN ('CH1','CH2','CH3')),
                protected INTEGER NOT NULL, name TEXT NOT NULL, room TEXT NOT NULL,
                image TEXT NOT NULL, allow_auto INTEGER NOT NULL DEFAULT 0,
                watts REAL NOT NULL CHECK(watts>=0), manual_until REAL NOT NULL DEFAULT 0,
                PRIMARY KEY(controller_id,id),
                CHECK(id!='CH3' OR (protected=1 AND allow_auto=0 AND watts=2.4)));
            CREATE TABLE IF NOT EXISTS commands (
                id TEXT PRIMARY KEY, controller_id TEXT NOT NULL REFERENCES controllers(id),
                channel_id TEXT NOT NULL, target_on INTEGER NOT NULL, origin TEXT NOT NULL,
                idempotency_key TEXT NOT NULL, status TEXT NOT NULL, reason TEXT,
                created_at REAL NOT NULL, transitions TEXT NOT NULL,
                UNIQUE(controller_id,idempotency_key));
            CREATE TABLE IF NOT EXISTS events (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                controller_id TEXT NOT NULL REFERENCES controllers(id),
                kind TEXT NOT NULL, channel_id TEXT, command_id TEXT,
                reason TEXT, created_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS measurements (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                controller_id TEXT NOT NULL REFERENCES controllers(id),
                measured_at REAL NOT NULL, channels TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                controller_id TEXT NOT NULL REFERENCES controllers(id),
                channel_id TEXT NOT NULL CHECK(channel_id IN ('CH1','CH2','CH3')),
                action TEXT NOT NULL CHECK(action IN ('on','off')),
                start_at REAL NOT NULL, end_at REAL NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL CHECK(status IN
                    ('pending','running','completed','cancelled','rejected','uncertain')),
                phase TEXT NOT NULL DEFAULT 'start' CHECK(phase IN ('start','end')),
                command_id TEXT REFERENCES commands(id),
                rejection_reason TEXT, note TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL, updated_at REAL NOT NULL,
                CHECK(action!='on' OR end_at>start_at),
                UNIQUE(controller_id,id));
            CREATE INDEX IF NOT EXISTS events_controller ON events(controller_id, sequence);
            CREATE INDEX IF NOT EXISTS commands_controller ON commands(controller_id, created_at);
            CREATE INDEX IF NOT EXISTS schedules_due ON schedules(controller_id, status, start_at);
            PRAGMA user_version=2;
        ''')


def event(db, cid, kind, channel=None, command=None, reason=None, now=0.0):
    """Audit event at an explicit time; callers pass the app clock's now()."""
    db.execute('INSERT INTO events(controller_id,kind,channel_id,command_id,reason,created_at) VALUES (?,?,?,?,?,?)',
               (cid, kind, channel, command, reason, now))


def owned(db, cid, uid):
    row = db.execute('SELECT * FROM controllers WHERE id=? AND owner_id=?', (cid, uid)).fetchone()
    if row is None:
        raise HTTPException(404, detail={'code': 'controller_not_found'})
    return row


def command_json(row):
    return {'id': row['id'], 'controller_id': row['controller_id'], 'channel_id': row['channel_id'],
            'on': bool(row['target_on']), 'origin': row['origin'], 'source': 'simulator',
            'idempotency_key': row['idempotency_key'], 'status': row['status'], 'reason': row['reason'],
            'created_at': row['created_at'], 'transitions': json.loads(row['transitions'])}


def transition(db, command, status, reason=None, now=0.0):
    history = json.loads(db.execute('SELECT transitions FROM commands WHERE id=?', (command['id'],)).fetchone()[0])
    history.append({'status': status, 'at': now})
    db.execute('UPDATE commands SET status=?,reason=?,transitions=? WHERE id=?',
               (status, reason, json.dumps(history), command['id']))
    event(db, command['controller_id'], 'command.' + status, command['channel_id'], command['id'], reason, now)


def snapshot(db, controller, now):
    fresh = (not controller['uncertain']) and 0 <= now - controller['measured_at'] <= FRESH_SECONDS
    rows = db.execute('SELECT * FROM channels WHERE controller_id=? ORDER BY id', (controller['id'],)).fetchall()
    return {'controller_id': controller['id'], 'name': controller['name'], 'source': 'simulator',
            'measured_at': controller['measured_at'], 'freshness': 'fresh' if fresh else 'stale',
            'peak_watts': controller['peak_watts'], 'manual_priority_minutes': controller['manual_priority_minutes'],
            'total_watts': round(sum(row['watts'] for row in rows), 1) if fresh else None,
            'channels': [{'id': row['id'], 'protected': bool(row['protected']), 'watts': row['watts'] if fresh else None,
                          'last_known_watts': row['watts'], 'freshness': 'fresh' if fresh else 'stale',
                          'manual_until': row['manual_until'], 'assigned': {'name': row['name'], 'room': row['room'],
                          'image': row['image'], 'allow_auto': bool(row['allow_auto'])}} for row in rows]}


def save_measurement(db, cid, now):
    values = {r['id']: r['watts'] for r in db.execute('SELECT id,watts FROM channels WHERE controller_id=?', (cid,))}
    db.execute('UPDATE controllers SET measured_at=?,uncertain=0 WHERE id=?', (now, cid))
    db.execute('INSERT INTO measurements(controller_id,measured_at,channels) VALUES (?,?,?)', (cid, now, json.dumps(values)))


def command_rejection(db, controller, channel, origin, on, now):
    if channel['id'] == 'CH3' or channel['protected']:
        return 'protected_channel'
    if controller['uncertain'] or not 0 <= now - controller['measured_at'] <= FRESH_SECONDS:
        return 'stale_measurements'
    if origin != 'manual' and not channel['allow_auto']:
        return 'automation_not_allowed'
    if origin != 'manual' and channel['manual_until'] > now:
        return 'manual_priority_active'
    if db.execute("SELECT 1 FROM commands WHERE controller_id=? AND status IN ('requested','sent') LIMIT 1",
                  (controller['id'],)).fetchone():
        return 'command_in_flight'
    if on:
        current = db.execute('SELECT SUM(watts) FROM channels WHERE controller_id=?', (controller['id'],)).fetchone()[0]
        if round(current - channel['watts'] + CHANNELS[channel['id']], 1) > controller['peak_watts']:
            return 'peak_exceeded'
    return None


def issue_command(db, controller, channel_id, on, origin, idempotency_key, now):
    """Single guarded command-creation core shared by the HTTP endpoint and
    the scheduler runner. The caller owns the surrounding transaction.

    Returns ``(command, rejection)``. ``rejection`` is None both for a fresh
    accepted command and for an idempotent replay of the same key with the
    same intent; ``'idempotency_conflict'`` marks a key reuse with different
    intent. Rejected commands are still stored and audited before returning.
    """
    cid = controller['id']
    previous = db.execute('SELECT * FROM commands WHERE controller_id=? AND idempotency_key=?',
                          (cid, idempotency_key)).fetchone()
    if previous:
        if (previous['channel_id'], bool(previous['target_on']), previous['origin']) != (channel_id, bool(on), origin):
            return command_json(previous), 'idempotency_conflict'
        return command_json(previous), None
    channel = db.execute('SELECT * FROM channels WHERE controller_id=? AND id=?', (cid, channel_id)).fetchone()
    rejection = command_rejection(db, controller, channel, origin, bool(on), now)
    cmd_id = str(uuid.uuid4())
    status = 'rejected' if rejection else 'requested'
    db.execute('INSERT INTO commands VALUES (?,?,?,?,?,?,?,?,?,?)',
               (cmd_id, cid, channel_id, int(bool(on)), origin, idempotency_key, status, rejection, now,
                json.dumps([{'status': status, 'at': now}])))
    event(db, cid, 'command.' + status, channel_id, cmd_id, rejection, now)
    return command_json(db.execute('SELECT * FROM commands WHERE id=?', (cmd_id,)).fetchone()), rejection


def create_app(database_path: str | Path | None = None, clock=None) -> FastAPI:
    # Every timestamp the server writes or compares comes from this clock.
    # Production passes nothing (wall clock); tests substitute a VirtualClock.
    clock = clock or SystemClock()
    path = str(database_path or os.environ.get('SPECWATT_DB', str(Path(__file__).resolve().parents[1] / 'data' / 'specwatt.sqlite3')))
    migrate(path)
    app = FastAPI(title='SpecWATT Brain — local simulator', version='0.1.0', docs_url=None, redoc_url=None, openapi_url=None)
    app.state.database_path = path
    origins = [value.strip() for value in os.environ.get('SPECWATT_CORS_ORIGINS', '').split(',') if value.strip()]
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password
                or '*' in origin or origin != f'{parsed.scheme}://{parsed.netloc}'):
            raise ValueError('SPECWATT_CORS_ORIGINS must list exact HTTP(S) origins without paths or wildcards')
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                           allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Authorization', 'Content-Type'])
    limiter = {}
    limit_lock = threading.Lock()
    bearer = HTTPBearer(auto_error=False)
    # Precompute once to avoid skipping expensive verification for missing users.
    dummy_hash = password_hash(secrets.token_urlsafe(32))

    @app.middleware('http')
    async def local_limits(request: Request, call_next):
        client = request.client.host if request.client else 'unknown'
        auth = request.url.path in ('/v1/auth/login', '/v1/auth/register')
        key = (client, 'auth' if auth else 'api')
        now = time.monotonic()
        with limit_lock:
            if len(limiter) > 2048:
                for old in list(limiter):
                    if now - limiter[old][0] >= 60:
                        del limiter[old]
                if len(limiter) > 2048:
                    return JSONResponse({'detail': {'code': 'server_busy'}}, status_code=503)
            start, count = limiter.get(key, (now, 0))
            if now - start >= 60:
                start, count = now, 0
            if count >= (10 if auth else 120):
                return JSONResponse({'detail': {'code': 'rate_limited'}}, status_code=429, headers={'Retry-After': '60'})
            limiter[key] = (start, count + 1)
        # Limit before collecting the body; no arbitrary-size JSON gets parsed.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 16384:
                return JSONResponse({'detail': {'code': 'body_too_large'}}, status_code=413)
        request._body = bytes(body)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, exc):
        # Pydantic's default error body includes rejected input, including passwords.
        return JSONResponse({'detail': [{'loc': e['loc'], 'type': e['type'], 'msg': 'Invalid input'} for e in exc.errors()]}, status_code=422)

    def user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if credentials is None or credentials.scheme.lower() != 'bearer':
            raise HTTPException(401, detail={'code': 'authentication_required'}, headers={'WWW-Authenticate': 'Bearer'})
        with connect(path) as db:
            row = db.execute('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?',
                             (token_hash(credentials.credentials), clock.now())).fetchone()
        if row is None:
            raise HTTPException(401, detail={'code': 'invalid_session'}, headers={'WWW-Authenticate': 'Bearer'})
        return row['user_id']

    def issue_session(db, uid):
        token = secrets.token_urlsafe(32)
        expires = clock.now() + SESSION_SECONDS
        db.execute('DELETE FROM sessions WHERE expires_at<=?', (clock.now(),))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (token_hash(token), uid, expires))
        return {'access_token': token, 'token_type': 'bearer', 'expires_at': expires, 'user_id': uid}

    @app.get('/health')
    def health():
        return {'status': 'ok', 'service': 'specwatt-brain', 'hardware_transport': False}

    @app.post('/v1/auth/register', status_code=201)
    def register(payload: Credentials):
        uid = str(uuid.uuid4())
        hashed = password_hash(payload.password)
        try:
            with connect(path) as db:
                db.execute('INSERT INTO users VALUES (?,?,?,?)', (uid, payload.email, hashed, clock.now()))
                return issue_session(db, uid)
        except sqlite3.IntegrityError:
            raise HTTPException(409, detail={'code': 'registration_unavailable'}) from None

    @app.post('/v1/auth/login')
    def login(payload: Credentials):
        with connect(path) as db:
            row = db.execute('SELECT id,password_hash FROM users WHERE email=?', (payload.email,)).fetchone()
            stored = row['password_hash'] if row else dummy_hash
            candidate = password_hash(payload.password, stored.split('$')[4])
            if not hmac.compare_digest(candidate, stored) or row is None:
                raise HTTPException(401, detail={'code': 'invalid_credentials'})
            return issue_session(db, row['id'])

    @app.post('/v1/auth/logout', status_code=204)
    def logout(credentials: HTTPAuthorizationCredentials = Depends(bearer), _uid=Depends(user)):
        with connect(path) as db:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash(credentials.credentials),))
        return Response(status_code=204)

    @app.get('/v1/controllers')
    def controllers(uid=Depends(user)):
        with connect(path) as db:
            return [dict(r) for r in db.execute('SELECT id,name,source FROM controllers WHERE owner_id=? ORDER BY id', (uid,))]

    @app.post('/v1/controllers/simulator', status_code=201)
    def create_controller(payload: ControllerInput, uid=Depends(user)):
        cid = str(uuid.uuid4())
        with connect(path) as db:
            db.execute('INSERT INTO controllers(id,owner_id,name,source,measured_at) VALUES (?,?,?,?,?)',
                       (cid, uid, payload.name, 'simulator', clock.now()))
            for channel, name, image, watts in [('CH1', 'Светильник', 'lamp', 1.8), ('CH2', 'LED-лента', 'led-strip', 0.0), ('CH3', 'Вентилятор', 'fan', 2.4)]:
                db.execute('INSERT INTO channels(controller_id,id,protected,name,room,image,watts) VALUES (?,?,?,?,?,?,?)',
                           (cid, channel, int(channel == 'CH3'), name, 'Учебный стенд', image, watts))
            save_measurement(db, cid, clock.now())
            event(db, cid, 'simulator.created', now=clock.now())
        return {'id': cid, 'name': payload.name, 'source': 'simulator'}

    @app.get('/v1/controllers/{cid}/snapshot')
    def get_snapshot(cid: str, uid=Depends(user)):
        with connect(path) as db:
            return snapshot(db, owned(db, cid, uid), clock.now())

    @app.patch('/v1/controllers/{cid}/settings')
    def settings(cid: str, payload: SettingsInput, uid=Depends(user)):
        with connect(path) as db:
            owned(db, cid, uid)
            db.execute('UPDATE controllers SET peak_watts=?,manual_priority_minutes=? WHERE id=?',
                       (payload.peak_watts, payload.manual_priority_minutes, cid))
            event(db, cid, 'settings.updated', now=clock.now())
            return snapshot(db, owned(db, cid, uid), clock.now())

    @app.patch('/v1/controllers/{cid}/channels/{channel_id}/assignment')
    def assignment(cid: str, channel_id: Literal['CH1', 'CH2', 'CH3'], payload: Assignment, uid=Depends(user)):
        with connect(path) as db:
            owned(db, cid, uid)
            if channel_id == 'CH3' and payload.allow_auto:
                raise HTTPException(409, detail={'code': 'protected_channel'})
            db.execute('UPDATE channels SET name=?,room=?,image=?,allow_auto=? WHERE controller_id=? AND id=?',
                       (payload.name, payload.room.strip(), payload.image, int(payload.allow_auto), cid, channel_id))
            event(db, cid, 'assignment.updated', channel_id, now=clock.now())
            return snapshot(db, owned(db, cid, uid), clock.now())

    @app.post('/v1/controllers/{cid}/commands')
    def request_command(cid: str, payload: CommandInput, uid=Depends(user)):
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            controller = owned(db, cid, uid)
            command, rejection = issue_command(db, controller, payload.channel_id, payload.on, payload.origin,
                                               payload.idempotency_key, clock.now())
        if rejection == 'idempotency_conflict':
            raise HTTPException(409, detail={'code': 'idempotency_conflict'})
        if rejection:
            raise HTTPException(409, detail={'code': rejection, 'command': command})
        return command

    @app.get('/v1/controllers/{cid}/commands/{command_id}')
    def get_command(cid: str, command_id: str, uid=Depends(user)):
        with connect(path) as db:
            owned(db, cid, uid)
            row = db.execute('SELECT * FROM commands WHERE id=? AND controller_id=?', (command_id, cid)).fetchone()
            if row is None:
                raise HTTPException(404, detail={'code': 'command_not_found'})
            return command_json(row)

    @app.get('/v1/controllers/{cid}/commands')
    def get_commands(cid: str, limit: int = 100, uid=Depends(user)):
        if not 1 <= limit <= 200:
            raise HTTPException(422, detail={'code': 'invalid_limit'})
        with connect(path) as db:
            owned(db, cid, uid)
            return [command_json(r) for r in db.execute('SELECT * FROM commands WHERE controller_id=? ORDER BY created_at DESC LIMIT ?', (cid, limit))]

    @app.post('/v1/controllers/{cid}/simulator/step')
    def simulator_step(cid: str, payload: StepInput, uid=Depends(user)):
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            controller = owned(db, cid, uid)
            commands = db.execute("SELECT * FROM commands WHERE controller_id=? AND status='requested' ORDER BY created_at", (cid,)).fetchall()
            now = clock.now()
            for command in commands:
                channel = db.execute('SELECT * FROM channels WHERE controller_id=? AND id=?', (cid, command['channel_id'])).fetchone()
                # Re-check permissions, CH3, stale state and peak at dispatch time.
                reason = None
                if channel['id'] == 'CH3' or channel['protected']:
                    reason = 'protected_channel'
                elif controller['uncertain'] or not 0 <= now - controller['measured_at'] <= FRESH_SECONDS:
                    reason = 'stale_measurements'
                elif command['origin'] != 'manual' and not channel['allow_auto']:
                    reason = 'automation_not_allowed'
                elif command['origin'] != 'manual' and channel['manual_until'] > now:
                    reason = 'manual_priority_active'
                elif command['target_on']:
                    total = db.execute('SELECT SUM(watts) FROM channels WHERE controller_id=?', (cid,)).fetchone()[0]
                    if round(total - channel['watts'] + CHANNELS[channel['id']], 1) > controller['peak_watts']:
                        reason = 'peak_exceeded'
                if reason:
                    transition(db, command, 'rejected', reason, now)
                    continue
                transition(db, command, 'sent', now=now)
                if payload.outcome == 'acknowledged':
                    db.execute('UPDATE channels SET watts=?,manual_until=? WHERE controller_id=? AND id=?',
                               (CHANNELS[channel['id']] if command['target_on'] else 0.0,
                                now + controller['manual_priority_minutes'] * 60 if command['origin'] == 'manual' else channel['manual_until'], cid, channel['id']))
                    save_measurement(db, cid, now)
                    transition(db, command, 'acknowledged', 'simulator_confirmed', now)
                else:
                    db.execute('UPDATE controllers SET uncertain=1 WHERE id=?', (cid,))
                    transition(db, command, payload.outcome, 'simulator_injected_failure', now)
            return {'processed': len(commands), 'source': 'simulator', 'snapshot': snapshot(db, owned(db, cid, uid), now)}

    @app.post('/v1/controllers/{cid}/simulator/telemetry')
    def telemetry(cid: str, payload: TelemetryInput, uid=Depends(user)):
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            controller = owned(db, cid, uid)
            now = clock.now()
            for channel, watts in payload.channels.items():
                db.execute('UPDATE channels SET watts=? WHERE controller_id=? AND id=?', (watts, cid, channel))
            save_measurement(db, cid, now)
            pending = db.execute("SELECT * FROM commands WHERE controller_id=? AND status IN ('timeout','transport-error')", (cid,)).fetchall()
            for command in pending:
                observed_on = payload.channels[command['channel_id']] > 0
                # A complete authoritative sample resolves uncertainty even
                # when the requested target was not reached. Neither outcome
                # is an acknowledgement of command delivery.
                reason = 'simulator_telemetry_matches_target' if observed_on == bool(command['target_on']) else 'target_not_reached'
                transition(db, command, 'reconciled', reason, now)
                if command['origin'] == 'manual':
                    # Preserve the user's hold after an ambiguous result;
                    # old reconciliation must not create a brand-new hold.
                    hold_until = command['created_at'] + controller['manual_priority_minutes'] * 60
                    db.execute('UPDATE channels SET manual_until=MAX(manual_until,?) WHERE controller_id=? AND id=?',
                               (hold_until, cid, command['channel_id']))
            event(db, cid, 'telemetry.simulated', now=now)
            return snapshot(db, owned(db, cid, uid), now)

    @app.get('/v1/controllers/{cid}/measurements')
    def measurements(cid: str, after: int = 0, limit: int = 100, uid=Depends(user)):
        if after < 0 or not 1 <= limit <= 200:
            raise HTTPException(422, detail={'code': 'invalid_pagination'})
        with connect(path) as db:
            owned(db, cid, uid)
            return [{'sequence': r['sequence'], 'measured_at': r['measured_at'], 'channels': json.loads(r['channels']), 'source': 'simulator'}
                    for r in db.execute('SELECT * FROM measurements WHERE controller_id=? AND sequence>? ORDER BY sequence LIMIT ?', (cid, after, limit))]

    @app.get('/v1/controllers/{cid}/events')
    def events(cid: str, after: int = 0, limit: int = 100, uid=Depends(user)):
        if after < 0 or not 1 <= limit <= 200:
            raise HTTPException(422, detail={'code': 'invalid_pagination'})
        with connect(path) as db:
            owned(db, cid, uid)
            return [{**dict(r), 'source': 'simulator'} for r in db.execute('SELECT * FROM events WHERE controller_id=? AND sequence>? ORDER BY sequence LIMIT ?', (cid, after, limit))]

    # Imported here on purpose: the scheduler package imports helpers from
    # this module, so the router can only be wired once this factory exists.
    from .scheduler.router import register_scheduler_routes
    register_scheduler_routes(app, path=path, clock=clock, user_dependency=user)

    return app
