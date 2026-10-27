import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiError,
  BrainClient,
  normalizeServerUrl,
  parseSnapshot,
} from '../src/specwatt/api.ts';
import {
  appendCommand,
  blocksNewCommands,
  createServerRequestScope,
  isAmbiguousMutationOutcome,
  isSnapshotFresh,
} from '../src/specwatt/server-request-scope.ts';
import { createSchedulerApi } from '../src/specwatt/scheduler-api.ts';

const baseUrl = 'http://localhost:8000';
function vaultWith(token = null) {
  return {
    token,
    async get() {
      return this.token;
    },
    async set(_base, value) {
      this.token = value;
    },
    async clear() {
      this.token = null;
    },
  };
}
function clientWith(fetcher, vault = vaultWith(), options = {}) {
  return new BrainClient({
    baseUrl,
    development: true,
    fetcher,
    vault,
    ...options,
  });
}
const controllersBody = JSON.stringify([
  { id: 'stand1', name: 'Stand', source: 'simulator' },
]);
function unauthorized() {
  return new Response(JSON.stringify({ detail: { code: 'invalid_session' } }), {
    status: 401,
  });
}

// --- D1: a delayed 401 from an obsolete session must never clear a newer session token.

test('401 with an obsolete token keeps the newer token stored (clearMatching vault)', async () => {
  const vault = vaultWith('old-token');
  const seen = [];
  vault.clearMatching = async (base, token) => {
    seen.push([base, token]);
    if (vault.token === token) vault.token = null;
  };
  const client = clientWith(async (_url, options) => {
    // A parallel login stored a fresh token while this request was in flight.
    vault.token = 'new-token';
    assert.equal(options.headers.Authorization, 'Bearer old-token');
    return unauthorized();
  }, vault);
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'invalid_session',
  );
  assert.equal(vault.token, 'new-token');
  assert.deepEqual(seen, [[baseUrl, 'old-token']]);
});

test('401 with an obsolete token keeps the newer token stored (legacy vault fallback)', async () => {
  const vault = vaultWith('old-token');
  const client = clientWith(async (_url, options) => {
    vault.token = 'new-token';
    assert.equal(options.headers.Authorization, 'Bearer old-token');
    return unauthorized();
  }, vault);
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'invalid_session',
  );
  assert.equal(vault.token, 'new-token');
});

test('401 for the token that is still current still clears the session', async () => {
  const vault = vaultWith('current-token');
  const client = clientWith(async () => unauthorized(), vault);
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'invalid_session',
  );
  assert.equal(vault.token, null);
});

test('a failed login attempt does not clear an existing session token', async () => {
  const vault = vaultWith('session-token');
  const client = clientWith(
    async () =>
      new Response(JSON.stringify({ detail: { code: 'invalid_credentials' } }), {
        status: 401,
      }),
    vault,
  );
  await assert.rejects(
    () => client.authenticate('login', 'owner@example.test', 'password-1234'),
    (error) => error.code === 'invalid_credentials',
  );
  assert.equal(vault.token, 'session-token');
});

test('a vault failure during 401 handling keeps the server error deterministic', async () => {
  const vault = vaultWith('tok');
  vault.clearMatching = async () => {
    throw new Error('keychain failure');
  };
  const client = clientWith(async () => unauthorized(), vault);
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'invalid_session',
  );
});

// --- D4: bounded automatic recovery retry, safe GET only.

test('safe GET retries once after a transient network failure and then succeeds', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('offline');
    return new Response(controllersBody, { status: 200 });
  }, vaultWith('token'), { retryDelayMs: 1 });
  const rows = await client.controllers();
  assert.equal(rows.length, 1);
  assert.equal(calls, 2);
});

test('safe GET retries once after a request timeout with a fresh token read', async () => {
  let calls = 0;
  const vault = vaultWith('token');
  const baseGet = vault.get;
  let reads = 0;
  vault.get = async (...args) => {
    reads += 1;
    return reads === 1 ? baseGet.call(vault, ...args) : 'rotated-token';
  };
  const client = clientWith(async (_url, options) => {
    calls += 1;
    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    }
    assert.equal(options.headers.Authorization, 'Bearer rotated-token');
    return new Response(controllersBody, { status: 200 });
  }, vault, { timeoutMs: 25, retryDelayMs: 1 });
  const rows = await client.controllers();
  assert.equal(rows.length, 1);
  assert.equal(calls, 2);
});

test('GET retry is capped at one extra attempt and then reports the failure', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    throw new TypeError('offline');
  }, vaultWith('token'), { retryDelayMs: 1 });
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'network_error',
  );
  assert.equal(calls, 2);
});

test('mutations are never retried automatically', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    throw new TypeError('offline');
  }, vaultWith('token'), { retryDelayMs: 1 });
  await assert.rejects(
    () => client.command('stand1', 'CH1', false, 'retry-guard-1'),
    (error) => error.code === 'network_error',
  );
  assert.equal(calls, 1);
});

test('deterministic server errors are not retried on safe GET', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return new Response('{"detail":{"code":"controller_not_found"}}', {
      status: 404,
    });
  }, vaultWith('token'), { retryDelayMs: 1 });
  await assert.rejects(
    () => client.snapshot('stand1'),
    (error) => error.code === 'controller_not_found',
  );
  assert.equal(calls, 1);
});

// --- D3: caller-side AbortController support.

test('caller abort cancels the in-flight request as request_cancelled without retry', async () => {
  const external = new AbortController();
  let calls = 0;
  const client = clientWith((_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      );
    });
  }, vaultWith('token'), { timeoutMs: 200, retryDelayMs: 1 });
  const pending = client.snapshot('stand1', { signal: external.signal });
  setTimeout(() => external.abort(), 20);
  await assert.rejects(
    () => pending,
    (error) => error.code === 'request_cancelled',
  );
  assert.equal(calls, 1);
});

test('an already-aborted caller signal never issues a request', async () => {
  const external = new AbortController();
  external.abort();
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return new Response(controllersBody, { status: 200 });
  }, vaultWith('token'));
  await assert.rejects(
    () => client.controllers({ signal: external.signal }),
    (error) => error.code === 'request_cancelled',
  );
  assert.equal(calls, 0);
});

// --- D2: terminal command outcomes must not block new manual commands forever.

test('only requested and sent commands block new manual commands', () => {
  for (const status of ['requested', 'sent'])
    assert.equal(blocksNewCommands(status), true, status);
  for (const status of [
    'acknowledged',
    'rejected',
    'cancelled',
    'timeout',
    'transport-error',
    'reconciled',
  ])
    assert.equal(blocksNewCommands(status), false, status);
});

// --- D6: freshness predicate matches the server rule (0 <= now - measured_at <= 30).

test('freshness requires fresh flag and a non-negative age within 30 seconds', () => {
  const snapshot = (freshness, measuredAt) => ({
    freshness,
    measured_at: measuredAt,
  });
  assert.equal(isSnapshotFresh(snapshot('fresh', 1000), 1029), true);
  assert.equal(isSnapshotFresh(snapshot('fresh', 1000), 1030), true);
  assert.equal(isSnapshotFresh(snapshot('fresh', 1000), 1031), false);
  assert.equal(isSnapshotFresh(snapshot('stale', 1000), 1005), false);
  assert.equal(isSnapshotFresh(null, 1005), false);
  // Server clock ahead of the device: a measurement from the "future" is not fresh.
  assert.equal(isSnapshotFresh(snapshot('fresh', 1010), 1005), false);
});

// --- Scope-owned in-flight cancellation.

test('scope aborts outstanding in-flight requests when the session changes', () => {
  const scope = createServerRequestScope();
  scope.activate({});
  const first = scope.begin();
  const second = scope.begin();
  assert.equal(first.signal.aborted, false);
  scope.activate({});
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  const afterRelogin = scope.begin();
  scope.invalidate();
  assert.equal(afterRelogin.signal.aborted, true);
});

test('done() unregisters a finished request so later session changes cannot abort it', () => {
  const scope = createServerRequestScope();
  scope.activate({});
  const flight = scope.begin();
  flight.done();
  flight.done(); // idempotent
  scope.invalidate();
  assert.equal(flight.signal.aborted, false);
});

// --- Scheduler read cancellation pass-through.

test('scheduler list forwards an abort signal and stays a GET', async () => {
  const seen = [];
  const api = createSchedulerApi(async (path, method, body, signal) => {
    seen.push({ path, method, body, signal });
    return [];
  });
  const controller = new AbortController();
  await api.list('controller1', controller.signal);
  assert.equal(seen[0].signal, controller.signal);
  assert.equal(seen[0].method, 'GET');
});

// --- Review-driven edge cases: 5xx/429 mapping, mutation timeout, parsing bounds.

function snapshotFixture(channelOrder = ['CH1', 'CH2', 'CH3']) {
  const watts = { CH1: 1.8, CH2: 0, CH3: 2.4 };
  return {
    controller_id: 'stand1',
    name: 'Stand',
    source: 'simulator',
    measured_at: 1000,
    telemetry_sequence: 3,
    freshness: 'fresh',
    peak_watts: 7,
    total_watts: 4.2,
    channels: channelOrder.map((id) => ({
      id,
      protected: id === 'CH3',
      watts: watts[id],
      last_known_watts: watts[id],
      freshness: 'fresh',
      assigned: { name: id, room: 'Stand', image: 'lamp', allow_auto: id !== 'CH3' },
    })),
  };
}

test('JSON 5xx maps to the server code and is never retried', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return new Response('{"detail":{"code":"server_busy"}}', { status: 503 });
  }, vaultWith('token'), { retryDelayMs: 1 });
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'server_busy',
  );
  assert.equal(calls, 1);
});

test('a non-JSON 5xx from a proxy reports the HTTP status, not a broken contract', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return new Response('<html>bad gateway</html>', { status: 502 });
  }, vaultWith('token'), { retryDelayMs: 1 });
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'http_502',
  );
  assert.equal(calls, 1);
});

test('429 rate limiting is deterministic and never retried', async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return new Response('{"detail":{"code":"rate_limited"}}', { status: 429 });
  }, vaultWith('token'), { retryDelayMs: 1 });
  await assert.rejects(
    () => client.controllers(),
    (error) => error.code === 'rate_limited',
  );
  assert.equal(calls, 1);
});

test('a mutation timing out reports request_timeout after exactly one attempt', async () => {
  let calls = 0;
  const client = clientWith((_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  }, vaultWith('token'), { timeoutMs: 20, retryDelayMs: 1 });
  await assert.rejects(
    () => client.command('stand1', 'CH1', true, 'timeout-key-01'),
    (error) => error.code === 'request_timeout',
  );
  assert.equal(calls, 1);
});

test('snapshot parsing is order-agnostic and bounds the channel set', () => {
  const reordered = parseSnapshot(snapshotFixture(['CH2', 'CH1', 'CH3']));
  assert.deepEqual(reordered.channels.map((ch) => ch.id), ['CH2', 'CH1', 'CH3']);
  assert.equal(reordered.total_watts, 4.2);
  for (const bad of [
    snapshotFixture(['CH1', 'CH2']),
    snapshotFixture(['CH1', 'CH2', 'CH3', 'CH4']),
    { ...snapshotFixture(), total_watts: null },
  ])
    assert.throws(() => parseSnapshot(bad), ApiError);
});

test('command history parsing rejects invented statuses, unknown channels and oversize lists', async () => {
  const command = (overrides = {}) => ({
    id: 'c1', controller_id: 'stand1', channel_id: 'CH1', on: true,
    status: 'acknowledged', reason: null, source: 'simulator',
    transitions: [{ status: 'acknowledged', at: 1000 }], ...overrides,
  });
  const history = [command()];
  const responding = (body) => clientWith(async () => new Response(JSON.stringify(body), { status: 200 }), vaultWith('token'));
  assert.equal((await responding(history).commands('stand1')).length, 1);
  for (const bad of [
    [command({ status: 'invented' })],
    [command({ channel_id: 'CH9' })],
    Array.from({ length: 101 }, (_, i) => command({ id: `c${i}` })),
  ])
    await assert.rejects(() => responding(bad).commands('stand1'), ApiError);
});

test('ambiguous mutation outcomes are unified across both server screens', () => {
  for (const code of [
    'request_timeout', 'network_error', 'invalid_response', 'unsupported_source',
    'operation_failed', 'request_cancelled', 'http_500', 'http_503',
  ])
    assert.equal(isAmbiguousMutationOutcome(code), true, code);
  for (const code of [
    'protected_channel', 'peak_exceeded', 'command_in_flight', 'idempotency_conflict',
    'rate_limited', 'http_404', 'invalid_session', 'schedule_conflict',
  ])
    assert.equal(isAmbiguousMutationOutcome(code), false, code);
});

test('appendCommand deduplicates a command a concurrent refresh already persisted', () => {
  const first = { id: 'c1' };
  const second = { id: 'c2' };
  assert.deepEqual(appendCommand([], first), [first]);
  assert.deepEqual(appendCommand([second], first), [first, second]);
  const withFirst = [first, second];
  assert.equal(appendCommand(withFirst, { ...first }), withFirst);
});
