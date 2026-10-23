import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { processHookLifecycle } from '../src/hook.mjs';
import { recordNativeStopStatus, classifyNativeStop } from '../src/native-stop-status.mjs';
import { loadState } from '../src/state.mjs';
import { publicSession } from '../src/analyze.mjs';

function fixture(t, changed = true) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'idleproof-native-stop-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 'proof@example.test'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Proof Test'], { cwd });
  fs.writeFileSync(path.join(cwd, 'cart.py'), 'def subtotal(x): return x\n');
  execFileSync('git', ['add', '.'], { cwd });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd });

  const event = { cwd, session_id: 'native-codex', source: 'codex', hook_event_name: 'SessionStart' };
  processHookLifecycle(event);
  processHookLifecycle({ ...event, hook_event_name: 'UserPromptSubmit', prompt: 'Add gift wrap fee' });
  if (changed) fs.writeFileSync(path.join(cwd, 'cart.py'),
    'def subtotal(x): return x\n\ndef gift_wrap_fee_cents(n): return min(n*150,600)\n');
  const stop = { ...event, hook_event_name: 'Stop' };
  const lifecycle = processHookLifecycle(stop, { deferAutoDebt: true });
  assert.equal(loadState(cwd).sessions[event.session_id].nativeStop.status, 'pending');
  return { cwd, stop, lifecycle, changeId: lifecycle.completedIdentity?.changeId };
}

function accepted(changeId, certificate = 'dw2_abcdef123456') {
  return { enabled: true, required: true, ok: true,
    output: { systemMessage: 'DiffWitness Proof accepted: ' + certificate +
      ' · Debt +0/0 obligation(s) · Continuity 5 event(s) · ' + changeId } };
}

test('native accepted Proof is persisted only after Stop and bound to its change id', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  assert.match(changeId, /^dwchg_[a-f0-9]{24}$/);
  const proof = accepted(changeId);
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, proof, proof.output), true);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.equal(session.status, 'complete');
  assert.equal(session.nativeStop.status, 'accepted');
  assert.equal(session.nativeStop.certificateId, 'dw2_abcdef123456');
  assert.equal(session.nativeStop.changeId, changeId);
  assert.equal(publicSession(session).nativeStop.status, 'accepted');

  // The historical native Stop verdict must survive SessionEnd, not be rewritten by a receipt.
  processHookLifecycle({ ...stop, hook_event_name: 'SessionEnd' }, { deferAutoDebt: true });
  assert.equal(loadState(cwd).sessions[stop.session_id].nativeStop.certificateId, 'dw2_abcdef123456');
});

test('native blocked stable-fail remains non-accepted even when the coding turn is complete', (t) => {
  const { cwd, stop, lifecycle } = fixture(t);
  const result = { enabled: true, required: true, ok: true, output: {
    decision: 'block', reason: 'candidate is not stably green; classification: stable-fail',
    systemMessage: 'DiffWitness rejected this handoff' } };
  recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, result, result.output);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.equal(session.status, 'complete');
  assert.equal(session.nativeStop.status, 'blocked');
  assert.equal(session.nativeStop.reasonCode, 'stable-fail');
  assert.equal(session.nativeStop.certificateId, undefined);
});

test('native terminal failure, unavailable Core, no change and unconfigured Core abstain', (t) => {
  const id = 'dwchg_' + 'a'.repeat(24);
  assert.deepEqual(classifyNativeStop({ changeId: id, diffResult: {
    enabled: true, ok: true, output: {
      continue: false, stopReason: 'Evidence not sufficient', systemMessage: 'Evidence not sufficient'
    } } }), { status: 'terminal', reasonCode: 'proof-not-accepted' });
  assert.deepEqual(classifyNativeStop({ changeId: id,
    diffResult: { enabled: true, ok: false, errorCode: 'DIFFWITNESS_STOP_PROTOCOL_INVALID' }
  }), { status: 'unavailable', reasonCode: 'DIFFWITNESS_STOP_PROTOCOL_INVALID' });
  assert.deepEqual(classifyNativeStop({ changeId: id,
    diffResult: { enabled: true, ok: true, output: { systemMessage: 'DiffWitness: no repository change to prove.' } }
  }), { status: 'no-change' });
  assert.deepEqual(classifyNativeStop({ changeId: id,
    diffResult: { enabled: false, ok: true, required: false }
  }), { status: 'not-configured' });
});

test('accepted report for a foreign/missing change identity cannot verify local code', () => {
  const own = 'dwchg_' + 'a'.repeat(24);
  const foreign = 'dwchg_' + 'b'.repeat(24);
  assert.equal(classifyNativeStop({ changeId: own, diffResult: accepted(foreign) }).status, 'unverified');
  assert.equal(classifyNativeStop({ changeId: null, diffResult: accepted(own) }).status, 'unverified');
  assert.equal(classifyNativeStop({ changeId: own,
    diffResult: { enabled: true, ok: true, output: { systemMessage: 'The agent says the tests passed' } }
  }).status, 'unverified');
});

test('a new active turn prevents stale native Stop from upgrading the session', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  processHookLifecycle({ ...stop, hook_event_name: 'UserPromptSubmit', prompt: 'Start another task' });
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity,
    accepted(changeId), accepted(changeId).output), false);
  assert.notEqual(loadState(cwd).sessions[stop.session_id].nativeStop?.status, 'accepted');
});

test('no-change Stop records no-change rather than accepted Proof', (t) => {
  const { cwd, stop, lifecycle } = fixture(t, false);
  const noChange = { enabled: true, ok: true, required: true,
    output: { systemMessage: 'DiffWitness: no repository change to prove.' } };
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, noChange, noChange.output), true);
  assert.equal(loadState(cwd).sessions[stop.session_id].nativeStop.status, 'no-change');
});
