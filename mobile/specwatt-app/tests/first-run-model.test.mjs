import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, demoState, reduceState, restoreState} from '../src/specwatt/model.ts';

test('unfinished journey resumes each validated step and selected language after reload', () => {
  for (const value of ['welcome','insight','safety','locale','mode','controller']) {
    let state = reduceState(emptyState(), {type:'locale',value:'ky'});
    state = reduceState(state, {type:'first-run-step',value});
    const restored = restoreState(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.firstRunStep, value);
    assert.equal(restored.locale, 'ky');
    assert.equal(restored.onboarded, false);
    assert.equal(restored.source, 'none');
  }
});
test('untrusted step cannot become a route; old states migrate without granting consent', () => {
  const legacy = demoState('ky');
  legacy.channels[0].assigned.allowAuto = true;
  const restored = restoreState({...legacy, firstRunStep:'https://untrusted.example'});
  assert.equal(restored.firstRunStep, undefined);
  assert.deepEqual(restored.channels, legacy.channels);
  assert.equal(restored.channels[2].protected, true);
  assert.equal(restored.channels[2].assigned.allowAuto, false);
});
test('moving through onboarding never changes channel settings or permissions', () => {
  const state = demoState('ky');
  state.channels[0].assigned.allowAuto = true;
  const moved = reduceState(state, {type:'first-run-step',value:'controller'});
  assert.equal(moved.firstRunStep,'controller');
  assert.deepEqual(moved.channels,state.channels);
  assert.deepEqual(moved.schedules,state.schedules);
});
