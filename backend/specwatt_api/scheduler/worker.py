"""Opt-in process-local scheduler polling; never simulates device responses.

The database transaction is the cross-process exclusion mechanism. Polling only
creates guarded requested commands. A simulator step/authoritative telemetry
must still be supplied explicitly by its owner.
"""
import asyncio
from contextlib import asynccontextmanager
import logging
import math
import threading

_LOG = logging.getLogger(__name__)


def run_worker_pass(path, clock):
    # Lazy imports keep app.create_app free to install our lifespan factory.
    from ..app import connect
    from .runner import run_due_schedules
    with connect(path) as db:
        controllers = [r['controller_id'] for r in db.execute(
            "SELECT DISTINCT controller_id FROM schedules "
            "WHERE status IN ('pending','running','uncertain')")]
    for cid in controllers:
        try:
            with connect(path) as db:
                db.execute('BEGIN IMMEDIATE')
                controller = db.execute('SELECT * FROM controllers WHERE id=?', (cid,)).fetchone()
                if controller is not None and controller['source'] == 'simulator':
                    run_due_schedules(db, controller, clock.now())
        except Exception:
            # One poisoned controller (damaged row, transient SQLite error,
            # lock contention) must not starve the others: its transaction is
            # rolled back whole and it is retried on the next poll.
            _LOG.exception('Scheduler pass failed for controller %s; rolled back, retried next poll', cid)


def scheduler_lifespan(path, clock, *, enabled=False, poll_seconds=1.0):
    """Return a FastAPI lifespan context; disabled unless explicitly enabled.

    Stop wakes the polling wait immediately, then joins the current database
    pass before shutdown completes. No detached thread survives app shutdown.
    Multiple app processes may poll the same SQLite database safely.
    """
    if not math.isfinite(poll_seconds) or not 0.05 <= poll_seconds <= 60:
        raise ValueError('scheduler poll interval must be between 0.05 and 60 seconds')

    @asynccontextmanager
    async def lifespan(app):
        if not enabled:
            yield
            return
        stop = threading.Event()

        def work():
            while not stop.is_set():
                try:
                    run_worker_pass(path, clock)
                except Exception:
                    _LOG.exception('Scheduler pass failed; retrying on next poll')
                stop.wait(poll_seconds)

        thread = threading.Thread(target=work, name='specwatt-scheduler', daemon=False)
        app.state.scheduler_worker = thread
        thread.start()
        try:
            yield
        finally:
            stop.set()
            # Shield the join so server cancellation cannot orphan the worker.
            joining = asyncio.create_task(asyncio.to_thread(thread.join))
            try:
                await asyncio.shield(joining)
            except asyncio.CancelledError:
                await joining
                raise

    return lifespan
