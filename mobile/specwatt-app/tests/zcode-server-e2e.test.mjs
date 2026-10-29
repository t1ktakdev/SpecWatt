// End-to-end contract test: the real FastAPI+SQLite backend serves loopback
// HTTP in a throwaway OS-temp database; the client layer drives it through
// genuine contract requests. No hardware, no ADB, no simulator-as-hardware
// claims: the server itself reports hardware_transport=false.
import assert from 'node:assert/strict';
import net from 'node:net';
import test, { after } from 'node:test';
import { BrainClient, ApiError } from '../src/specwatt/api.ts';
import { blocksNewCommands } from '../src/specwatt/server-request-scope.ts';

import { startFastApi } from './support/fastapi-fixture.mjs';

// Synthetic fixture credential, identical to the allowlisted security-suite
// fixture (security/support.py); the throwaway loopback database is deleted
// after the run and never leaves 127.0.0.1.
const PASSWORD = 'correct-horse-battery';
const EMAIL = `owner-${process.pid}-${Date.now()}@e2e.test`;
const state = {};

let fixture = null;
let baseUrl = null;

function plainVault() {
  return {
    token: null,
    async get() {
      return this.token;
    },
    async set(_base, value) {
      this.token = value;
    },
    async clear() {
      this.token = null;
    },
    async clearMatching(base, token) {
      if (this.token === token) this.token = null;
    },
  };
}

function client(vault, options = {}) {
  return new BrainClient({ baseUrl, development: true, vault, ...options });
}

function closedPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
  if (!fixture) { fixture = await startFastApi(); baseUrl = fixture.baseUrl; }
  fixture.assertAlive();
  return true;
}

after(async () => { await fixture?.close(); });

test('real FastAPI loopback: register, create simulator, fresh snapshot with protected CH3', async (t) => {
  if (!(await startServer(t))) return;
  const vault = plainVault();
  const owner = client(vault);
  await owner.authenticate('register', EMAIL, PASSWORD);
  assert.ok(vault.token);
  assert.deepEqual(await owner.controllers(), []);
  const created = await owner.createSimulator('E2E СЃС‚РµРЅРґ');
  assert.equal(created.source, 'simulator');
  const snapshot = await owner.snapshot(created.id);
  assert.equal(snapshot.freshness, 'fresh');
  assert.equal(snapshot.channels.length, 3);
  const ch3 = snapshot.channels[2];
  assert.equal(ch3.id, 'CH3');
  assert.equal(ch3.protected, true);
  assert.equal(ch3.assigned.allow_auto, false);
  assert.equal(ch3.watts, 2.4);
  state.owner = owner;
  state.vault = vault;
  state.controllerId = created.id;
});

// Setup failures remain failures, with an explicit dependency explanation
// rather than undefined shared-state destructuring or skipped coverage.
function prereq(t) {
  if (!state.owner || !state.controllerId) {
    assert.fail('prerequisite setup test did not complete');
  }
  return true;
}

test('manual command lifecycle over real HTTP: requested first, only the simulator step acknowledges', async (t) => {
  if (!(await startServer(t))) return;
  if (!prereq(t)) return;
  const { owner, controllerId } = state;
  const command = await owner.command(controllerId, 'CH1', false, `e2e-off-${Date.now()}`);
  assert.equal(command.status, 'requested');
  const afterRequest = await owner.snapshot(controllerId);
  assert.equal(afterRequest.channels[0].watts, 1.8, 'a requested command must not move measurements');
  const stepped = await owner.step(controllerId);
  assert.equal(stepped.channels[0].watts, 0);
  const history = await owner.commands(controllerId);
  assert.equal(history[0].status, 'acknowledged');
  assert.equal(history[0].reason, 'simulator_confirmed');
});

test('per-channel consent over real HTTP; CH3 consent is refused', async (t) => {
  if (!(await startServer(t))) return;
  if (!prereq(t)) return;
  const { owner, controllerId } = state;
  const snapshot = await owner.snapshot(controllerId);
  await assert.rejects(
    () => owner.automationConsent(controllerId, snapshot.channels[2], true),
    (error) => error.code === 'protected_channel',
  );
  const consented = await owner.automationConsent(controllerId, snapshot.channels[1], true);
  assert.equal(consented.channels[1].assigned.allow_auto, true);
});

test('schedule evaluate, create, cancel and an explicit tick that never fabricates an acknowledgement', async (t) => {
  if (!(await startServer(t))) return;
  if (!prereq(t)) return;
  const { owner, controllerId } = state;
  const api = owner.scheduler();
  const soon = Math.floor(Date.now() / 1000) + 120;
  const input = { channel_id: 'CH2', action: 'on', start_at: soon, duration_seconds: 60 };
  const preview = await api.evaluate(controllerId, input);
  assert.equal(preview.feasible, true);
  const { schedule } = await api.create(controllerId, input);
  assert.equal(schedule.status, 'pending');
  const listed = await api.list(controllerId);
  assert.equal(listed[0].id, schedule.id);
  const cancelled = await api.cancel(controllerId, schedule.id);
  assert.equal(cancelled.status, 'cancelled');
  // A due window dispatches a command that stays `requested` until the
  // simulator explicitly steps it: the tick itself is not an acknowledgement.
  const dispatchInput = { channel_id: 'CH2', action: 'on', start_at: Math.floor(Date.now() / 1000) + 2, duration_seconds: 60 };
  const { schedule: due } = await api.create(controllerId, dispatchInput);
  // The runner refuses to dispatch from stale measurements (>30 s since the
  // last sample); refresh telemetry so this test does not inherit the clock
  // position of whatever ran before it.
  await owner.sample(controllerId, await owner.snapshot(controllerId));
  // Regression: original daemon fixture exited during a >5s quiet interval.
  // Keep real HTTP coverage and default file concurrency; do not shorten this.
  await wait(6100);
  fixture.assertAlive();
  const tick = await api.tick(controllerId);
  assert.ok(tick.processed.some((row) => row.schedule_id === due.id && row.result === 'dispatched_start'));
  const listedAfterTick = await api.list(controllerId);
  const dueRow = listedAfterTick.find((row) => row.id === due.id);
  const history = await owner.commands(controllerId);
  const dispatched = history.find((row) => row.id === dueRow?.command_id);
  assert.ok(dispatched);
  assert.equal(dispatched.status, 'requested');
  await api.cancel(controllerId, due.id);
  // A second create for an already-taken window is a deterministic 409 the
  // client must surface without any retry.
  const overlapInput = { channel_id: 'CH2', action: 'on', start_at: Math.floor(Date.now() / 1000) + 300, duration_seconds: 60 };
  await api.create(controllerId, overlapInput);
  let createCalls = 0;
  const ownerSpy = new BrainClient({
    baseUrl, development: true, vault: state.vault,
    fetcher: (url, init) => {
      createCalls += 1;
      return fetch(url, init);
    },
  });
  await assert.rejects(
    () => ownerSpy.scheduler().create(controllerId, overlapInput),
    (error) => error.code === 'schedule_conflict',
  );
  assert.equal(createCalls, 1);
  // Leave no active schedules or queued commands for the following tests.
  for (const row of (await api.list(controllerId)).filter((r) => ['pending', 'running'].includes(r.status)))
    await api.cancel(controllerId, row.id);
});

test('a server-side timeout outcome stays truthful and never blocks later manual commands', async (t) => {
  if (!(await startServer(t))) return;
  if (!prereq(t)) return;
  const { owner, controllerId } = state;
  const command = await owner.command(controllerId, 'CH1', true, `e2e-timeout-${Date.now()}`);
  assert.equal(command.status, 'requested');
  const stepped = await owner.step(controllerId, 'timeout');
  assert.equal(stepped.freshness, 'stale', 'an unresolved step leaves the controller uncertain');
  const history = await owner.commands(controllerId);
  assert.equal(history[0].status, 'timeout');
  assert.equal(blocksNewCommands(history[0].status), false);
  // Refreshing telemetry clears the uncertainty; the terminal timeout is not
  // an in-flight command, so the server accepts the next manual command.
  await owner.sample(controllerId, await owner.snapshot(controllerId));
  const retry = await owner.command(controllerId, 'CH1', true, `e2e-retry-${Date.now()}`);
  assert.equal(retry.status, 'requested');
});

test('BOLA isolation: another account cannot read or command someone elseвЂ™s controller', async (t) => {
  if (!(await startServer(t))) return;
  if (!prereq(t)) return;
  const stranger = client(plainVault());
  await stranger.authenticate('register', `stranger-${process.pid}@e2e.test`, PASSWORD);
  assert.deepEqual(await stranger.controllers(), []);
  await assert.rejects(
    () => stranger.snapshot(state.controllerId),
    (error) => error.code === 'controller_not_found',
  );
  await assert.rejects(
    () => stranger.command(state.controllerId, 'CH1', true, `bola-${Date.now()}`),
    (error) => error.code === 'controller_not_found',
  );
});

test('a 401 for a revoked old token cannot clear a newer session in the shared vault', async (t) => {
  if (!(await startServer(t))) return;
  if (!prereq(t)) return;
  const { owner, vault, controllerId } = state;
  const oldToken = vault.token;
  // Rotate the session exactly like a re-login on the same screen would.
  await owner.authenticate('login', EMAIL, PASSWORD);
  assert.notEqual(vault.token, oldToken);
  // Revoke the old session on the server, then let an obsolete client
  // instance (still holding the old token) hit a real 401.
  const logout = await fetch(baseUrl + '/v1/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${oldToken}` },
  });
  assert.equal(logout.status, 204);
  const obsolete = client({
    get: async () => oldToken,
    set: (...args) => vault.set(...args),
    clear: (...args) => vault.clear(...args),
    clearMatching: vault.clearMatching.bind(vault),
  });
  await assert.rejects(
    () => obsolete.controllers(),
    (error) => error.code === 'invalid_session',
  );
  assert.equal(vault.token !== null && vault.token !== oldToken, true);
  const survivor = client(vault);
  const rows = await survivor.controllers();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, controllerId);
});

test('an invalid token is rejected by the server and cleared from the vault', async (t) => {
  if (!(await startServer(t))) return;
  const vault = plainVault();
  vault.token = 'x'.repeat(40);
  const bad = client(vault);
  await assert.rejects(
    () => bad.controllers(),
    (error) => error.code === 'invalid_session',
  );
  assert.equal(vault.token, null);
});

test('offline port: safe GET retried once over real transport, mutation never retried, then recovery', async (t) => {
  if (!(await startServer(t))) return;
  const dead = await closedPort();
  let attempts = 0;
  const counting = (_url, init) => {
    attempts += 1;
    return fetch(_url, init);
  };
  const offlineVault = plainVault();
  offlineVault.token = 'offline-stale-token';
  const offline = client(offlineVault, {
    baseUrl: `http://127.0.0.1:${dead}`,
    fetcher: counting,
    timeoutMs: 2000,
    retryDelayMs: 50,
  });
  await assert.rejects(
    () => offline.controllers(),
    (error) => error.code === 'network_error',
  );
  assert.equal(attempts, 2, 'a safe GET recovers with exactly one extra attempt');
  attempts = 0;
  await assert.rejects(
    () => offline.command('stand1', 'CH1', true, `offline-${Date.now()}`),
    (error) => error.code === 'network_error',
  );
  assert.equal(attempts, 1, 'a mutation is never repeated automatically');
  const reconnected = client(state.vault);
  const rows = await reconnected.controllers();
  assert.equal(rows.length, 1);
});

test('the same HTTP fixture serves concurrent independent reads without losing its lifetime',async()=>{
 await startServer();
 const snapshots=await Promise.all(Array.from({length:8},()=>state.owner.snapshot(state.controllerId)));
 fixture.assertAlive();
 assert.equal(snapshots.length,8);
 for(const snapshot of snapshots){assert.equal(snapshot.source,'simulator');assert.equal(snapshot.channels[2].protected,true);}
});
