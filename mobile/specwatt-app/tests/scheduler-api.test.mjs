import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, BrainClient } from '../src/specwatt/api.ts';
import { createSchedulerApi, parseSchedule, parseEvaluation, scheduleFromForm } from '../src/specwatt/scheduler-api.ts';

const input = { channel_id: 'CH1', action: 'on', start_at: 2000, duration_seconds: 60 };
const schedule = () => ({ id: 'schedule1', controller_id: 'controller1', channel_id: 'CH1',
  action: 'on', start_at: 2000, end_at: 2060, duration_seconds: 60, priority: 0,
  status: 'pending', phase: 'start', command_id: null, rejection_reason: null,
  note: '', created_at: 1000, updated_at: 1000, source: 'simulator' });
const evaluation = () => ({ feasible: true, verdict: 'feasible',
  checks: [{ code: 'protected_channel', ok: true }], projection: null, suggestions: [] });
const projection = () => ({ ...evaluation(), projection: {
  window: { start_at: 2000, end_at: 2060 },
  segments: [{ start_at: 2000, end_at: 2060, watts: 4.2, basis: 'forecast', source: 'schedule' }],
  projected_peak_watts: 4.2, projected_peak_at: 2000, peak_headroom_watts: 2.8,
  plan_energy_wh: .07, baseline_energy_wh: .04, delta_energy_wh: .03,
  device_energy_wh: .03, above_peak_duration_s: 0,
} });
const snapshot = () => ({ controller_id: 'controller1', name: 'Stand', source: 'simulator',
  measured_at: 2000, freshness: 'fresh', total_watts: 2.4, peak_watts: 7,
  channels: ['CH1', 'CH2', 'CH3'].map(id => ({ id, protected: id === 'CH3', watts: id === 'CH3' ? 2.4 : 0,
    last_known_watts: id === 'CH3' ? 2.4 : 0, freshness: 'fresh',
    assigned: { name: id, room: 'Stand', image: 'lamp', allow_auto: id !== 'CH3' } })) });

test('schedule parser rejects malformed, non-simulator and protected-channel records', () => {
  assert.equal(parseSchedule(schedule()).status, 'pending');
  for (const bad of [null, [], { ...schedule(), channel_id: 'CH3' },
    { ...schedule(), source: 'hardware' }, { ...schedule(), start_at: Infinity },
    { ...schedule(), status: 'invented' }, { ...schedule(), end_at: 1999 },
    { ...schedule(), duration_seconds: 1 }, { ...schedule(), note: 'x'.repeat(281) },
    { ...schedule(), priority: 0.5 }]) assert.throws(() => parseSchedule(bad), ApiError);
});

test('evaluation parser bounds nested arrays and rejects inconsistent verdicts', () => {
  assert.equal(parseEvaluation(evaluation()).feasible, true);
  for (const bad of [{ ...evaluation(), verdict: 'infeasible' },
    { ...evaluation(), checks: Array(33).fill({ code: 'ok', ok: true }) },
    { ...evaluation(), suggestions: Array(6).fill({ start_at: 1, end_at: 2, projected_peak_watts: 4.2 }) },
    { ...evaluation(), checks: [{ code: 'x', ok: 'yes' }] }])
    assert.throws(() => parseEvaluation(bad), ApiError);
});

test('projection parses real energy units and rejects non-finite or oversize nested data', () => {
  assert.equal(parseEvaluation(projection()).projection.device_energy_wh, .03);
  for (const changes of [{ device_energy_wh: NaN }, { projected_peak_watts: 100 },
    { segments: Array(513).fill(projection().projection.segments[0]) },
    { segments: [{ ...projection().projection.segments[0], basis: 'hardware' }] }])
    assert.throws(() => parseEvaluation({ ...projection(), projection: { ...projection().projection, ...changes } }), ApiError);
});

test('helper uses real JSON request/response boundary and escapes owner identifiers', async () => {
  const calls = [];
  const request = async (path, method = 'GET', body) => {
    const init = { method, body: body === undefined ? undefined : JSON.stringify(body) };
    calls.push([path, init]);
    const response = new Response(JSON.stringify(path.endsWith('/evaluate') ? evaluation() :
      method === 'POST' ? { schedule: schedule(), evaluation: evaluation() } : []));
    return response.json();
  };
  const api = createSchedulerApi(request);
  await api.list('a/b');
  await api.evaluate('controller1', input);
  assert.equal((await api.create('controller1', input)).schedule.id, 'schedule1');
  assert.equal(calls[0][0], '/v1/controllers/a%2Fb/schedules?limit=100');
  assert.deepEqual(JSON.parse(calls[2][1].body), input);
});

test('runtime input guard refuses CH3 and invalid work windows before any request', async () => {
  let calls = 0;
  const api = createSchedulerApi(async () => { calls++; return {}; });
  for (const bad of [{ ...input, channel_id: 'CH3' }, { ...input, duration_seconds: 0 },
    { ...input, start_at: NaN }, { ...input, duration_seconds: Infinity },
    { ...input, action: 'off' }, { ...input, priority: -1 }, { ...input, extra: true }])
    await assert.rejects(api.create('controller1', bad), ApiError);
  assert.equal(calls, 0);
});

test('form requires explicit UTC and rejects normalized invalid calendar dates', () => {
  const form = { channel: 'CH1', action: 'on', start: '2026-10-28T14:00:00Z', minutes: '1,5' };
  assert.equal(scheduleFromForm(form).duration_seconds, 90);
  for (const start of ['2026-02-31T14:00:00Z', '2026-10-28T14:00', '2026-10-28T14:00:00+06:00'])
    assert.throws(() => scheduleFromForm({ ...form, start }), { code: 'invalid_schedule' });
  assert.equal(scheduleFromForm({ ...form, action: 'off', minutes: '' }).duration_seconds, undefined);
});

test('list rejects oversize, duplicated and cross-controller records', async () => {
  for (const value of [Array(101).fill(schedule()), [schedule(), schedule()],
    [{ ...schedule(), controller_id: 'other' }]])
    await assert.rejects(createSchedulerApi(async () => value).list('controller1'), ApiError);
});

test('cancel preserves server errors and never retries a mutation', async () => {
  let calls = 0;
  const api = createSchedulerApi(async () => { calls++; throw new ApiError('schedule_not_active'); });
  await assert.rejects(api.cancel('controller1', 'schedule1'), { code: 'schedule_not_active' });
  assert.equal(calls, 1);
});

test('cancel requires matching cancelled record, not an optimistic local change', async () => {
  const good = { ...schedule(), status: 'cancelled' };
  assert.equal((await createSchedulerApi(async () => good).cancel('controller1', 'schedule1')).status, 'cancelled');
  for (const bad of [schedule(), { ...good, id: 'other' }, { ...good, channel_id: 'CH3' }])
    await assert.rejects(createSchedulerApi(async () => bad).cancel('controller1', 'schedule1'), ApiError);
});

test('fractional durations survive epoch timestamp roundoff', async () => {
  const seconds = 1.2, start = 1793109600, end = start + seconds;
  const row = { ...schedule(), start_at: start, end_at: end, duration_seconds: end - start };
  const api = createSchedulerApi(async () => ({ schedule: row, evaluation: evaluation() }));
  assert.equal((await api.create('controller1', { ...input, start_at: start, duration_seconds: seconds })).schedule.id, row.id);
});

test('tick returns server time and requested phase without treating it as acknowledgement', async () => {
  const value = { now: 2000, processed: [{ schedule_id: 'schedule1', channel_id: 'CH1', action: 'on', phase: 'start', result: 'dispatched_start' }], snapshot: snapshot() };
  const result = await createSchedulerApi(async () => value).tick('controller1');
  assert.equal(result.now, 2000);
  assert.equal(result.processed[0].result, 'dispatched_start');
  assert.equal(result.snapshot.channels[0].watts, 0);
});

test('tick validates time, bounded results and protected channels', async () => {
  for (const bad of [{ now: NaN, processed: [], snapshot: {} },
    { now: 2000, processed: Array(201).fill({}), snapshot: {} },
    { now: 2000, processed: [{ schedule_id: 's', channel_id: 'CH3', action: 'on', phase: 'start', result: 'dispatched_start' }], snapshot: {} }])
    await assert.rejects(createSchedulerApi(async () => bad).tick('controller1'), ApiError);
});

test('BrainClient scheduler sends authenticated fetch requests and never steps the simulator', async () => {
  const calls = [];
  const client = new BrainClient({ baseUrl: 'http://localhost:8000', development: true,
    vault: { get: async () => 'owner-token', set: async () => {}, clear: async () => {} },
    fetcher: async (url, init) => {
      calls.push([url, init]);
      return new Response(JSON.stringify(url.endsWith('/evaluate') ? projection() :
        url.endsWith('/cancel') ? { ...schedule(), status: 'cancelled' } :
        init.method === 'POST' ? { schedule: schedule(), evaluation: projection() } : [schedule()]));
    } });
  const api = client.scheduler();
  assert.equal((await api.list('controller1')).length, 1);
  assert.equal((await api.evaluate('controller1', input)).feasible, true);
  await api.create('controller1', input);
  await api.cancel('controller1', 'schedule1');
  assert.equal(calls.length, 4);
  assert.ok(calls.every(([url, init]) => !url.includes('/simulator/') &&
    init.headers.Authorization === 'Bearer owner-token' && init.credentials === 'omit'));
  assert.equal(calls[2][0], 'http://localhost:8000/v1/controllers/controller1/schedules');
  assert.deepEqual(JSON.parse(calls[2][1].body), input);
  assert.equal(calls[3][1].method, 'POST');
});

test('BrainClient cancel error is parsed once; expired session clears vault', async () => {
  let calls = 0, cleared = 0;
  const client = new BrainClient({ baseUrl: 'http://localhost:8000', development: true,
    vault: { get: async () => 'token', set: async () => {}, clear: async () => { cleared++; } },
    fetcher: async () => { calls++; return new Response(JSON.stringify({ detail: { code: 'invalid_session' } }), { status: 401 }); } });
  await assert.rejects(client.scheduler().cancel('controller1', 'schedule1'), { code: 'invalid_session' });
  assert.equal(calls, 1);
  assert.equal(cleared, 1);
});
