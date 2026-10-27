import assert from 'node:assert/strict';
import test from 'node:test';
import { createServerRequestScope, isSessionFailure } from '../src/specwatt/server-request-scope.ts';

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('out-of-order A response cannot overwrite selection B', async () => {
  const scope = createServerRequestScope(), connection = {}, session = scope.activate(connection);
  const a = scope.select(session, 'A'), pendingA = deferred();
  const b = scope.select(session, 'B'), pendingB = deferred();
  let shown = '';
  const workA = pendingA.promise.then(() => { if (scope.canCommit(a)) shown = 'A'; });
  const workB = pendingB.promise.then(() => { if (scope.canCommit(b)) shown = 'B'; });
  pendingB.resolve(); await workB; pendingA.resolve(); await workA;
  assert.equal(shown, 'B');
});

test('scoped old child callback cannot select its previous controller', () => {
  const scope = createServerRequestScope(), session = scope.activate({});
  scope.select(session, 'A');
  scope.select(session, 'B');
  assert.equal(scope.refresh(session, 'A'), null);
  assert.ok(scope.canCommit(scope.refresh(session, 'B')));
});

test('logout invalidates in-flight result and old session error; new session remains valid', () => {
  const scope = createServerRequestScope(), connection = {}, old = scope.activate(connection);
  const request = scope.select(old, 'A');
  scope.invalidate();
  assert.equal(scope.canCommit(request), false);
  const current = scope.activate(connection); // Identity alone must not resurrect old work.
  assert.equal(scope.isSession(old), false);
  assert.equal(scope.isSession(current), true);
  assert.equal(scope.refresh(old, 'A'), null);
  assert.equal(scope.canCommit(request), false);
});

test('later refresh of same selection supersedes earlier response', () => {
  const scope = createServerRequestScope(), session = scope.activate({});
  const first = scope.select(session, 'A'), later = scope.refresh(session, 'A');
  assert.equal(scope.canCommit(first), false);
  assert.equal(scope.canCommit(later), true);
});

test('connection identity and session generation both scope authentication recovery', () => {
  const scope = createServerRequestScope(), first = {}, second = {};
  const old = scope.activate(first), current = scope.activate(second);
  assert.equal(scope.isSession(old), false);
  assert.equal(scope.isSession(current), true);
  for (const code of ['invalid_session', 'session_required', 'session_expired', 'authentication_required', 'http_401'])
    assert.equal(isSessionFailure(code), true);
  assert.equal(isSessionFailure('network_error'), false);
});
