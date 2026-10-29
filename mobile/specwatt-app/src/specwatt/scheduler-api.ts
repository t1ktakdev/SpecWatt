/** Authenticated server-simulator schedules; independent of offline demo state. */
import { ApiError, parseSnapshot } from './api.ts';
import type { ServerSnapshot } from './api.ts';

export type ScheduleInput = {
  channel_id: 'CH1' | 'CH2'; action: 'on' | 'off'; start_at: number;
  duration_seconds?: number; priority?: number; note?: string;
};
export type ServerSchedule = {
  id: string; controller_id: string; channel_id: 'CH1' | 'CH2';
  action: 'on' | 'off'; start_at: number; end_at: number; duration_seconds: number | null;
  priority: number; status: 'pending' | 'running' | 'completed' | 'cancelled' | 'rejected' | 'uncertain';
  phase: 'start' | 'end'; command_id: string | null; rejection_reason: string | null;
  note: string; created_at: number; updated_at: number; source: 'simulator';
};
export type ScheduleEvaluation = {
  feasible: boolean; verdict: 'feasible' | 'infeasible';
  checks: { code: string; ok: boolean }[];
  projection: null | {
    projected_peak_watts: number; plan_energy_wh: number; baseline_energy_wh: number;
    delta_energy_wh: number; device_energy_wh: number;
  };
  suggestions: { start_at: number; end_at: number; projected_peak_watts: number }[];
};
export type SchedulerRequest = (
  path: string, method?: 'GET' | 'POST', body?: unknown, signal?: AbortSignal,
) => Promise<unknown>;
type Obj = Record<string, unknown>;
const fail = (): never => { throw new ApiError('invalid_response'); };
function object(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Obj;
}
function text(value: unknown, max = 128, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > max) return fail();
  return value;
}
function num(value: unknown, min = 0, max = 8_640_000_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail();
  return value;
}
function one<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) return fail();
  return value as T;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail();
  return value;
}
function channel(value: unknown): 'CH1' | 'CH2' { return one(value, ['CH1', 'CH2']); }
function nullableText(value: unknown, max = 128) { return value === null ? null : text(value, max); }

export function parseSchedule(value: unknown): ServerSchedule {
  const r = object(value);
  if (r.source !== 'simulator') throw new ApiError('unsupported_source');
  const action = one(r.action, ['on', 'off']), start = num(r.start_at), end = num(r.end_at);
  const priority = num(r.priority, 0, 100);
  if (!Number.isInteger(priority) || (action === 'on' ? end <= start : end !== start)) return fail();
  const duration = r.duration_seconds === null ? null : num(r.duration_seconds, 1);
  if ((action === 'off' && duration !== null) ||
      (action === 'on' && (duration === null || Math.abs(duration - (end - start)) > .001))) return fail();
  return {
    id: text(r.id), controller_id: text(r.controller_id), channel_id: channel(r.channel_id),
    action, start_at: start, end_at: end, duration_seconds: duration, priority,
    status: one(r.status, ['pending', 'running', 'completed', 'cancelled', 'rejected', 'uncertain']),
    phase: one(r.phase, ['start', 'end']), command_id: nullableText(r.command_id),
    rejection_reason: nullableText(r.rejection_reason), note: text(r.note, 280, true),
    created_at: num(r.created_at), updated_at: num(r.updated_at), source: 'simulator',
  };
}

export function parseEvaluation(value: unknown): ScheduleEvaluation {
  const r = object(value);
  if (typeof r.feasible !== 'boolean' || r.verdict !== (r.feasible ? 'feasible' : 'infeasible')) return fail();
  const checks = array(r.checks, 32).map(raw => {
    const c = object(raw);
    if (typeof c.ok !== 'boolean') return fail();
    return { code: text(c.code, 80), ok: c.ok };
  });
  if (!checks.length || r.feasible !== checks.every(c => c.ok)) return fail();
  let projection: ScheduleEvaluation['projection'] = null;
  if (r.projection !== null) {
    const p = object(r.projection), window = object(p.window);
    const start = num(window.start_at), end = num(window.end_at);
    if (end <= start) return fail();
    for (const raw of array(p.segments, 512)) {
      const segment = object(raw);
      if (num(segment.end_at) <= num(segment.start_at)) return fail();
      num(segment.watts, 0, 8.4);
      one(segment.basis, ['measured', 'forecast']);
      one(segment.source, ['current_state', 'schedule', 'plan']);
    }
    if (p.projected_peak_at !== null) num(p.projected_peak_at);
    num(p.peak_headroom_watts, -8.4, 8.4);
    num(p.above_peak_duration_s);
    projection = {
      projected_peak_watts: num(p.projected_peak_watts, 0, 8.4),
      plan_energy_wh: num(p.plan_energy_wh), baseline_energy_wh: num(p.baseline_energy_wh),
      delta_energy_wh: num(p.delta_energy_wh, -8_640_000_000_000),
      device_energy_wh: num(p.device_energy_wh),
    };
  }
  const suggestions = array(r.suggestions, 5).map(raw => {
    const s = object(raw), start = num(s.start_at), end = num(s.end_at);
    if (end <= start) return fail();
    return { start_at: start, end_at: end, projected_peak_watts: num(s.projected_peak_watts, 0, 8.4) };
  });
  return { feasible: r.feasible, verdict: r.verdict as ScheduleEvaluation['verdict'], checks, projection, suggestions };
}

function inputBody(input: ScheduleInput, evaluate = false): ScheduleInput {
  const r = object(input);
  if (!['CH1', 'CH2'].includes(r.channel_id as string)) throw new ApiError('protected_channel');
  const allowed = ['channel_id', 'action', 'start_at', 'duration_seconds', 'priority', ...(evaluate ? [] : ['note'])];
  if (Object.keys(r).some(k => !allowed.includes(k))) throw new ApiError('invalid_schedule');
  if (!['on', 'off'].includes(r.action as string) || typeof r.start_at !== 'number' ||
      !Number.isFinite(r.start_at) || r.start_at <= 0 || r.start_at > 8_640_000_000_000 ||
      (r.action === 'on' ? typeof r.duration_seconds !== 'number' || !Number.isFinite(r.duration_seconds) ||
        r.duration_seconds < 1 || r.duration_seconds > 604800 : r.duration_seconds !== undefined) ||
      (r.priority !== undefined && (!Number.isInteger(r.priority) || (r.priority as number) < 0 || (r.priority as number) > 100)) ||
      (r.note !== undefined && (typeof r.note !== 'string' || r.note.length > 280)))
    throw new ApiError('invalid_schedule');
  return { channel_id: input.channel_id, action: input.action, start_at: input.start_at,
    ...(input.duration_seconds === undefined ? {} : { duration_seconds: input.duration_seconds }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.note === undefined ? {} : { note: input.note }) };
}

/** Calendar validation belongs before preview so normalized invalid dates cannot change intent. */
export function scheduleFromForm(form: {
  channel: 'CH1' | 'CH2'; action: 'on' | 'off'; start: string; minutes: string;
}): ScheduleInput {
  const start = form.start.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(start)) throw new ApiError('invalid_schedule');
  const seconds = Date.parse(start) / 1000;
  const canonical = start.length === 17 ? start.slice(0, -1) + ':00Z' : start;
  if (!Number.isFinite(seconds) || new Date(seconds * 1000).toISOString().replace('.000Z', 'Z') !== canonical)
    throw new ApiError('invalid_schedule');
  const minutes = form.minutes.trim();
  if (form.action === 'on' && !/^\d+(?:[.,]\d+)?$/.test(minutes)) throw new ApiError('invalid_schedule');
  return inputBody({ channel_id: form.channel, action: form.action, start_at: seconds,
    ...(form.action === 'on' ? { duration_seconds: Number(minutes.replace(',', '.')) * 60 } : {}) });
}
const path = (id: string) => '/v1/controllers/' + encodeURIComponent(text(id));
function ownedSchedule(value: unknown, cid: string) {
  const result = parseSchedule(value);
  if (result.controller_id !== cid) return fail();
  return result;
}
export function createSchedulerApi(request: SchedulerRequest) {
  return {
    async list(cid: string, signal?: AbortSignal): Promise<ServerSchedule[]> {
      const rows = array(await request(path(cid) + '/schedules?limit=100', 'GET', undefined, signal), 100)
        .map(raw => ownedSchedule(raw, cid));
      if (new Set(rows.map(r => r.id)).size !== rows.length) return fail();
      return rows;
    },
    async evaluate(cid: string, input: ScheduleInput): Promise<ScheduleEvaluation> {
      return parseEvaluation(await request(path(cid) + '/scheduler/evaluate', 'POST', inputBody(input, true)));
    },
    async create(cid: string, input: ScheduleInput) {
      const result = object(await request(path(cid) + '/schedules', 'POST', inputBody(input)));
      const schedule = ownedSchedule(result.schedule, cid), evaluation = parseEvaluation(result.evaluation);
      if (schedule.status !== 'pending' || !evaluation.feasible || schedule.channel_id !== input.channel_id ||
          schedule.action !== input.action || schedule.start_at !== input.start_at ||
          (input.action === 'on' && Math.abs((schedule.duration_seconds ?? 0) - (input.duration_seconds ?? 0)) > .001)) return fail();
      return { schedule, evaluation };
    },
    async cancel(cid: string, sid: string): Promise<ServerSchedule> {
      const schedule = ownedSchedule(await request(path(cid) + '/schedules/' + encodeURIComponent(text(sid)) + '/cancel', 'POST'), cid);
      if (schedule.id !== sid || schedule.status !== 'cancelled') return fail();
      return schedule;
    },
    async tick(cid: string): Promise<{ now: number; processed: { schedule_id: string; result: string }[]; snapshot: ServerSnapshot }> {
      const result = object(await request(path(cid) + '/scheduler/tick', 'POST'));
      const now = num(result.now);
      const processed = array(result.processed, 200).map(raw => {
        const r = object(raw);
        channel(r.channel_id); one(r.action, ['on', 'off']); one(r.phase, ['start', 'end']);
        const outcome = one(r.result, ['rejected', 'dispatched_start', 'dispatched_end', 'completed',
          'uncertain', 'waiting_command', 'start_confirmed', 'deferred_command_in_flight']);
        if (r.reason !== undefined) text(r.reason);
        return { schedule_id: text(r.schedule_id), result: outcome };
      });
      const snapshot = parseSnapshot(result.snapshot);
      if (snapshot.controller_id !== cid) return fail();
      return { now, processed, snapshot };
    },
  };
}
export type SchedulerApi = ReturnType<typeof createSchedulerApi>;
