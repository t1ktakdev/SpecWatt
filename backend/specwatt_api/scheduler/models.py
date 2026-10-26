"""Data contracts for the server-side schedule engine.

All timestamps are Unix epoch seconds in UTC, matching the existing API
contract. Every response model carries ``source='simulator'`` like the rest of
the service. Input models inherit the strict ``Input`` base from ``base.py``
(unknown fields rejected, no type coercion).
"""
from enum import Enum
from typing import Literal

from pydantic import Field, field_validator, model_validator

from ..base import CHANNELS, Input

#: Schedules may not start further than this many seconds in the future.
MAX_HORIZON_SECONDS = 7 * 24 * 3600
#: Shortest runnable work window for an ``on`` schedule.
MIN_DURATION_SECONDS = 1
#: An ``off`` schedule older than this is marked ``window_missed`` instead of
#: being dispatched late. Turning a load off stays fail-safe: the closing
#: ``off`` phase of an ``on`` schedule has no lateness cutoff.
MAX_LATE_OFF_SECONDS = 3600
#: Bounded result sets for deterministic responses.
MAX_SUGGESTIONS = 5


class ScheduleStatus(str, Enum):
    PENDING = 'pending'          # ожидает окна выполнения
    RUNNING = 'running'          # команда запланированной фазы отправлена
    COMPLETED = 'completed'      # окно полностью исполнено и подтверждено
    CANCELLED = 'cancelled'      # отменено владельцем до/во время исполнения
    REJECTED = 'rejected'        # исполнение отклонено окончательно
    UNCERTAIN = 'uncertain'      # результат команды неоднозначен (timeout / transport-error)


class ScheduleCreate(Input):
    channel_id: str
    action: Literal['on', 'off']
    start_at: float = Field(allow_inf_nan=False)
    duration_seconds: float | None = Field(default=None, ge=MIN_DURATION_SECONDS, allow_inf_nan=False)
    priority: int = Field(default=0, ge=0, le=100)
    note: str = Field(default='', max_length=280)

    @field_validator('channel_id')
    @classmethod
    def supported_channel(cls, value):
        if value not in CHANNELS:
            raise ValueError('unsupported_channel')
        return value

    @model_validator(mode='after')
    def duration_rules(self):
        if self.action == 'on':
            if self.duration_seconds is None:
                raise ValueError('duration_required_for_on')
        elif self.duration_seconds is not None:
            raise ValueError('duration_not_allowed_for_off')
        return self


class ScheduleUpdate(Input):
    """Partial modification; only allowed while the schedule is still pending."""
    start_at: float | None = Field(default=None, allow_inf_nan=False)
    duration_seconds: float | None = Field(default=None, ge=MIN_DURATION_SECONDS, allow_inf_nan=False)
    priority: int | None = Field(default=None, ge=0, le=100)
    note: str | None = Field(default=None, max_length=280)


class ScheduleEvaluate(Input):
    """A hypothetical plan; evaluated without creating anything."""
    channel_id: str
    action: Literal['on', 'off']
    start_at: float = Field(allow_inf_nan=False)
    duration_seconds: float | None = Field(default=None, ge=MIN_DURATION_SECONDS, allow_inf_nan=False)
    priority: int = Field(default=0, ge=0, le=100)

    @field_validator('channel_id')
    @classmethod
    def supported_channel(cls, value):
        if value not in CHANNELS:
            raise ValueError('unsupported_channel')
        return value

    @model_validator(mode='after')
    def duration_rules(self):
        if self.action == 'on':
            if self.duration_seconds is None:
                raise ValueError('duration_required_for_on')
        elif self.duration_seconds is not None:
            raise ValueError('duration_not_allowed_for_off')
        return self


def plan_window(action: str, start_at: float, duration_seconds: float | None) -> tuple[float, float]:
    """Return the (start, end) of the plan; an ``off`` action is instantaneous."""
    if action == 'on':
        return start_at, start_at + float(duration_seconds)
    return start_at, start_at
