# Scheduler execution and worker

Schedules and commands are durable SQLite records. An optional process-local
worker polls them through the same guarded runner as the owner-authenticated
tick endpoint. It is disabled by default. The app factory supplies its database
path and clock to `scheduler_lifespan(path, clock, enabled=..., poll_seconds=1)`.
Allowed polling intervals are 0.05–60 seconds. Shutdown wakes the polling wait
and joins the current database pass before completing. Failed passes are logged
and retried on the next poll; the transaction rolls back partial changes.

Each controller pass holds `BEGIN IMMEDIATE`. Multiple workers and explicit
ticks can share a database: command creation and phase transitions are atomic,
and each schedule phase has a stable command key. A busy controller defers
without consuming that key. This is once-only command-record creation, not
proof of physical delivery. No physical relay transport exists here.
An old phase key already holding a rejected command remains immutable: the
schedule is rejected explicitly with `previous_phase_rejected_*` (prefixed by
`end_phase_` for closing commands). The owner must create a new schedule;
historic rejected records are never deleted or silently reissued.

The worker only issues `requested` commands. It never acknowledges them,
refreshes telemetry, bypasses stale/consent/manual/peak guards, or advances a
virtual clock. An owner must explicitly run the simulator step and provide
telemetry. Consequently real-time polling alone does not complete simulator
schedules. Stale closing-off commands are rejected under the existing safety
contract; the worker does not invent an off exception.

Cancellation atomically retracts a linked `requested` command, since it has not
been sent. A `sent`, acknowledged, or ambiguous command keeps its own lifecycle.
Cancelling a running schedule prevents subsequent phases, including its closing
off. It does not promise that an already-started load is off; use a separate
explicit owner command to change its state. The simulator step selects only
requested commands, so retracted commands cannot execute later.

On windows are half-open: `[start_at, end_at)`. A pending start first processed
at or after `end_at` is rejected as `window_missed`. An already-started window's
closing phase remains eligible after its end, subject to all normal guards.
Wall-clock rollback can make telemetry stale; it does not cause a phase to be
issued twice. Virtual time remains an explicit test/demo input.
