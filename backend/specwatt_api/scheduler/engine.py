"""Pure, deterministic planning math for load scheduling.

No database or HTTP access lives here: callers pass plain dict rows (sqlite
``Row`` objects work too — they support mapping access). All times are Unix
epoch seconds, all powers are watts, all energies are watt-hours.

Forecast model (full rationale in docs/SCHEDULER_DESIGN.md):

* A channel's last measured power is held constant across the horizon
  (conservative: the standing load is never underestimated).
* An active ``on`` schedule makes its channel nominal (the ``CHANNELS``
  value) during ``[start_at, end_at]`` and returns it to the held baseline
  outside the window — for a currently-off channel this models a run that
  ends; for a currently-on channel it is conservative after the window.
* CH3 is protected and always on at its nominal 2.4 W. It appears in every
  projection but can never be planned or scheduled.

Measured values and forecast values carry separate ``basis`` tags, and energy
deltas are reported explicitly, so a peak reduction is never presented as a
guaranteed reduction of total energy.
"""
from dataclasses import dataclass

from ..base import CHANNELS, FRESH_SECONDS
from .models import MAX_HORIZON_SECONDS, MAX_SUGGESTIONS

BASIS_MEASURED = 'measured'
BASIS_FORECAST = 'forecast'
SOURCE_STATE = 'current_state'
SOURCE_SCHEDULE = 'schedule'
SOURCE_PLAN = 'plan'


@dataclass(frozen=True)
class Segment:
    """Half-open interval [start, end) at a constant power level."""
    start: float
    end: float
    watts: float
    basis: str
    source: str


def channel_forecast(channel, schedules_for_channel: list, plan: dict | None, origin: float) -> list[Segment]:
    """Step function of one channel's projected power from ``origin`` onwards.

    ``schedules_for_channel`` must contain only active (pending/running) ``on``
    schedules of this channel; they never overlap each other (creation
    forbids it), and a plan never overlaps one either when the engine is
    called from the API. Overlapping edges are still handled safely by
    clipping to the running cursor.
    """
    channel_id = channel['id']
    if channel['protected']:
        # CH3 is permanently on; neither schedules nor plans may touch it.
        return [Segment(origin, float('inf'), CHANNELS[channel_id], BASIS_MEASURED, SOURCE_STATE)]
    baseline = float(channel['watts'])
    edges = sorted((float(s['start_at']), float(s['end_at'])) for s in schedules_for_channel)
    if plan is not None and plan['channel_id'] == channel_id and plan['action'] == 'on':
        edges.append((float(plan['start_at']), float(plan['end_at'])))
        edges.sort()
    segments: list[Segment] = []
    cursor = origin
    for start, end in edges:
        start, end = max(start, origin), max(end, origin)
        if end <= cursor:
            continue
        if start > cursor:
            segments.append(Segment(cursor, start, baseline, BASIS_MEASURED, SOURCE_STATE))
        segments.append(Segment(max(start, cursor), end, CHANNELS[channel_id], BASIS_FORECAST, SOURCE_SCHEDULE))
        cursor = end
    segments.append(Segment(cursor, float('inf'), baseline, BASIS_MEASURED, SOURCE_STATE))
    return segments


def controller_forecast(channels: list, active_schedules: list, plan: dict | None,
                        origin: float, until: float) -> list[Segment]:
    """Total controller power over [origin, until] as sorted, non-overlapping segments.

    ``active_schedules`` holds every active (pending/running) ``on`` schedule
    of the controller; ``plan`` is the hypothetical schedule under evaluation
    or ``None`` for the pure current-state forecast.
    """
    per_channel = {c['id']: channel_forecast(
        c, [s for s in active_schedules if s['channel_id'] == c['id']], plan, origin) for c in channels}
    bounds = {origin, until}
    for segments in per_channel.values():
        for s in segments:
            if origin <= s.start <= until:
                bounds.add(s.start)
            if origin <= s.end <= until:
                bounds.add(s.end)
    ordered = sorted(bounds)
    merged: list[Segment] = []
    for start, end in zip(ordered, ordered[1:]):
        watts = 0.0
        for segments in per_channel.values():
            for s in segments:
                if s.start <= start < s.end:
                    watts += s.watts
                    break
        if merged and merged[-1].watts == watts:
            merged[-1] = Segment(merged[-1].start, end, watts, merged[-1].basis, merged[-1].source)
        else:
            merged.append(Segment(start, end, watts, BASIS_FORECAST, SOURCE_SCHEDULE))
    return merged


def energy_wh(segments: list[Segment], window: tuple[float, float]) -> float:
    """Integral of power over the window in watt-hours (W·s / 3600)."""
    total_ws = 0.0
    for s in segments:
        start, end = max(s.start, window[0]), min(s.end, window[1])
        if start < end:
            total_ws += s.watts * (end - start)
    return total_ws / 3600.0


def peak_in_window(segments: list[Segment], window: tuple[float, float]) -> tuple[float, float | None]:
    """Return (peak watts, start of the first segment reaching the peak)."""
    peak, peak_at = 0.0, None
    for s in segments:
        start, end = max(s.start, window[0]), min(s.end, window[1])
        if start < end and s.watts > peak:
            peak, peak_at = s.watts, start
    return peak, peak_at


def duration_above(segments: list[Segment], window: tuple[float, float], threshold: float) -> float:
    """Total seconds inside the window with projected power above threshold."""
    total = 0.0
    for s in segments:
        start, end = max(s.start, window[0]), min(s.end, window[1])
        if start < end and s.watts > threshold:
            total += end - start
    return total


def load_in_window(segments: list[Segment], window: tuple[float, float]) -> list[dict]:
    """Segments clipped to the window, as plain JSON-ready dicts."""
    out = []
    for s in segments:
        start, end = max(s.start, window[0]), min(s.end, window[1])
        if start < end:
            out.append({'start_at': start, 'end_at': end, 'watts': round(s.watts, 6),
                        'basis': s.basis, 'source': s.source})
    return out


def overlaps(window_a: tuple[float, float], window_b: tuple[float, float]) -> bool:
    """Half-open overlap: a shared boundary instant is not a conflict."""
    return max(window_a[0], window_b[0]) < min(window_a[1], window_b[1])


def evaluate_plan(channels: list, active_schedules: list, controller, plan: dict, now: float) -> dict:
    """Full deterministic feasibility verdict and projection for one plan.

    Checks mirror the command guards (protected, consent, manual hold, stale,
    peak) plus time-window and same-channel conflict validation, so anything
    the engine accepts is still re-validated at dispatch time.
    """
    channel = next((c for c in channels if c['id'] == plan['channel_id']), None)
    if channel is None:
        return {'feasible': False, 'verdict': 'infeasible',
                'checks': [{'code': 'unsupported_channel', 'ok': False}],
                'projection': None, 'suggestions': []}
    window = (float(plan['start_at']), float(plan['end_at']))
    checks: list[dict] = []

    def check(code: str, ok: bool, **detail):
        checks.append({'code': code, 'ok': bool(ok), **({'detail': detail} if detail else {})})

    check('protected_channel', not channel['protected'])
    check('automation_not_allowed', plan['action'] == 'off' or bool(channel['allow_auto']))
    check('manual_priority_active', not (plan['action'] == 'on' and float(channel['manual_until']) > window[0]))
    check('window_in_past', window[0] > now)
    check('window_too_far', window[0] - now <= MAX_HORIZON_SECONDS)
    # An 'on' plan needs a power forecast: stale or uncertain measurements make
    # one groundless. Turning off needs no forecast and stays allowed.
    fresh = (not controller['uncertain']) and 0 <= now - controller['measured_at'] <= FRESH_SECONDS
    check('stale_measurements', plan['action'] == 'off' or fresh)
    conflicts = [s for s in active_schedules
                 if s['channel_id'] == plan['channel_id'] and overlaps(window, (s['start_at'], s['end_at']))]
    check('schedule_conflict', not conflicts, schedule_ids=sorted(s['id'] for s in conflicts))

    projection = None
    if plan['action'] == 'on':
        forecast = controller_forecast(channels, active_schedules, plan, now, window[1])
        baseline = controller_forecast(channels, active_schedules, None, now, window[1])
        peak, peak_at = peak_in_window(forecast, window)
        # Absolute floor: even with every controllable load off, the protected
        # channel plus this device's nominal power must fit under the limit.
        floor = sum(CHANNELS[c['id']] for c in channels if c['protected']) + CHANNELS[plan['channel_id']]
        check('nominal_exceeds_peak', round(floor, 1) <= float(controller['peak_watts']),
              minimal_load_watts=round(floor, 1), peak_watts=controller['peak_watts'])
        check('peak_exceeded', round(peak, 1) <= float(controller['peak_watts']),
              projected_peak_watts=round(peak, 1), peak_watts=controller['peak_watts'])
        plan_energy = energy_wh(forecast, window)
        baseline_energy = energy_wh(baseline, window)
        projection = {
            'window': {'start_at': window[0], 'end_at': window[1]},
            'segments': load_in_window(forecast, window),
            'projected_peak_watts': round(peak, 1),
            'projected_peak_at': peak_at,
            'peak_headroom_watts': round(float(controller['peak_watts']) - peak, 6),
            'plan_energy_wh': round(plan_energy, 6),
            'baseline_energy_wh': round(baseline_energy, 6),
            'delta_energy_wh': round(plan_energy - baseline_energy, 6),
            'device_energy_wh': round(CHANNELS[plan['channel_id']] * (window[1] - window[0]) / 3600.0, 6),
            'above_peak_duration_s': round(duration_above(forecast, window, float(controller['peak_watts'])), 6),
        }

    feasible = all(c['ok'] for c in checks)
    suggestions: list[dict] = []
    if not feasible and plan['action'] == 'on' and not channel['protected'] and channel['allow_auto']:
        blocking = {c['code'] for c in checks if not c['ok']}
        # Only load-shaped problems are solvable by moving the window in time.
        if blocking <= {'peak_exceeded', 'schedule_conflict'}:
            suggestions = find_slots(channels, active_schedules, controller, plan, now)
    return {'feasible': feasible, 'verdict': 'feasible' if feasible else 'infeasible',
            'checks': checks, 'projection': projection, 'suggestions': suggestions}


def find_slots(channels: list, active_schedules: list, controller, plan: dict, now: float) -> list[dict]:
    """Earliest admissible starts at or after the requested start, deterministically.

    Candidates are the requested start plus every instant where an existing
    schedule ends (projected load can only drop at those boundaries). Sorted
    ascending, validated with the same projection as ``evaluate_plan``,
    bounded to ``MAX_SUGGESTIONS``.
    """
    window_len = float(plan['end_at']) - float(plan['start_at'])
    horizon = now + MAX_HORIZON_SECONDS
    candidates = sorted({float(plan['start_at'])} |
                        {float(s['end_at']) for s in active_schedules if float(plan['start_at']) <= float(s['end_at']) <= horizon})
    slots: list[dict] = []
    for start in candidates:
        if start < now:
            continue
        candidate = {**plan, 'start_at': start, 'end_at': start + window_len}
        if any(s['channel_id'] == plan['channel_id'] and
               overlaps((candidate['start_at'], candidate['end_at']), (s['start_at'], s['end_at']))
               for s in active_schedules):
            continue
        forecast = controller_forecast(channels, active_schedules, candidate, now, candidate['end_at'])
        peak, _ = peak_in_window(forecast, (candidate['start_at'], candidate['end_at']))
        if round(peak, 1) <= float(controller['peak_watts']):
            slots.append({'start_at': candidate['start_at'], 'end_at': candidate['end_at'],
                          'projected_peak_watts': round(peak, 1)})
        if len(slots) >= MAX_SUGGESTIONS:
            break
    return slots
