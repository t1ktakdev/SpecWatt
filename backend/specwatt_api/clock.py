"""Injectable time source.

The whole server reads time through a Clock instead of calling
``time.time()`` directly. Production uses :class:`SystemClock`; tests and the
scheduler demo substitute a :class:`VirtualClock` so schedule execution,
staleness, manual holds and session expiry become deterministic and can be
advanced instantly. Rate limiting intentionally keeps using
``time.monotonic()`` and is unaffected by virtual time.
"""
import time
from typing import Protocol


class Clock(Protocol):
    def now(self) -> float:
        """Current server time as Unix epoch seconds (UTC)."""
        ...


class SystemClock:
    """Wall-clock time; identical to the previous direct ``time.time()`` calls."""

    def now(self) -> float:
        return time.time()


class VirtualClock:
    """Manually controlled time for deterministic tests and demos."""

    def __init__(self, start: float | None = None):
        self._now = time.time() if start is None else float(start)

    def now(self) -> float:
        return self._now

    def set(self, value: float) -> float:
        """Jump to an absolute epoch time and return it."""
        if value != value or value in (float('inf'), float('-inf')):
            raise ValueError('clock time must be a finite number')
        self._now = float(value)
        return self._now

    def advance(self, seconds: float) -> float:
        """Move the clock forward and return the new time."""
        if seconds != seconds or seconds in (float('inf'), float('-inf')) or seconds < 0:
            raise ValueError('clock can only advance by a finite non-negative amount')
        self._now += float(seconds)
        return self._now
