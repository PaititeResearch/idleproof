import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { processHookLifecycle } from '../src/hook.mjs';
import { changeEnvelopePath, recordNativeStopStatus, classifyNativeStop, publicNativeStop } from '../src/native-stop-status.mjs';
import { loadState } from '../src/state.mjs';
import { publicSession } from '../src/analyze.mjs';
import { queueMatchingDiffWitnessAssurance } from '../src/ide-assurance.mjs';

const CERT = 'dw2_abcdef1234567890abcd';

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

function accepted(changeId, certificate = CERT) {
  return { enabled: true, required: true, ok: true,
    output: { systemMessage: 'DiffWitness Proof accepted: ' + certificate +
      ' · Debt +0/0 obligation(s) · Continuity 5 event(s)' + (changeId ? ' · ' + changeId : '') } };
}

// The exact message Core returns when its Proof is valid but the Continuity projection failed.
function acceptedDegraded(certificate = CERT) {
  return { enabled: true, required: true, ok: true, output: { systemMessage: 'DiffWitness Proof accepted: ' + certificate +
    ' · Debt +0/0 obligation(s) · Continuity DEGRADED (Proof remains exact-tree valid; run `dw doctor`)' } };
}

function envelope(changeId, { certificate = CERT, claim = 'causal', accepted = true, debt = true } = {}) {
  return { schema_version: 'change-envelope-1', change_id: changeId,
    proof: { tool: 'diffwitness', certificate_id: certificate, claim, accepted, certificate_schema: 2 },
    ...(debt ? { debt: { report_schema: 'debt-report-1', points: 0, open_lineages: [], budget_passed: true } } : {}) };
}

function writeEnvelope(cwd, value) {
  const file = changeEnvelopePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

test('native accepted Proof is persisted only after Stop and bound to its change id', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  assert.match(changeId, /^dwchg_[a-f0-9]{24}$/);
  writeEnvelope(cwd, envelope(changeId));
  const proof = accepted(changeId);
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, proof, proof.output), true);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.equal(session.status, 'complete');
  assert.equal(session.nativeStop.status, 'accepted');
  assert.equal(session.nativeStop.certificateId, CERT);
  assert.equal(session.nativeStop.changeId, changeId);
  assert.equal(session.nativeStop.binding, 'core-change-envelope');
  assert.deepEqual(session.nativeStop.debt, { points: 0, obligations: 0, budgetPassed: true });
  assert.equal(publicSession(session).nativeStop.status, 'accepted');

  // The historical native Stop verdict must survive SessionEnd, not be rewritten by a receipt.
  processHookLifecycle({ ...stop, hook_event_name: 'SessionEnd' }, { deferAutoDebt: true });
  assert.equal(loadState(cwd).sessions[stop.session_id].nativeStop.certificateId, CERT);
});

test('REPRO #54: accepted text without dwchg_ and without Core envelope never verifies the change', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  // The pre-fix classifier returned accepted here: the missing change id was not checked.
  assert.deepEqual(classifyNativeStop({ changeId, diffResult: acceptedDegraded() }),
    { status: 'unverified', reasonCode: 'proof-envelope-unavailable' });
  const proof = acceptedDegraded();
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, proof, proof.output), true);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.equal(session.nativeStop.status, 'unverified');
  assert.equal(session.nativeStop.certificateId, undefined);
});

test('degraded Continuity still verifies when Core envelope binds the certificate to the exact change', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  writeEnvelope(cwd, envelope(changeId));
  const proof = acceptedDegraded();
  recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, proof, proof.output);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.equal(session.nativeStop.status, 'accepted');
  assert.equal(session.nativeStop.certificateId, CERT);
});

test('an envelope only accepts the exact change, an accepted claim and the same certificate', () => {
  const own = 'dwchg_' + 'a'.repeat(24);
  const foreign = 'dwchg_' + 'b'.repeat(24);
  const verdict = (value, diffResult = accepted(own)) => classifyNativeStop({ changeId: own, diffResult, envelope: value });
  assert.deepEqual(verdict(envelope(foreign)), { status: 'unverified', reasonCode: 'change-identity-mismatch' });
  assert.deepEqual(verdict(envelope(own, { accepted: false, claim: 'inconclusive' })), { status: 'unverified', reasonCode: 'proof-not-accepted-in-envelope' });
  assert.deepEqual(verdict(envelope(own, { claim: 'made-up' })), { status: 'unverified', reasonCode: 'proof-not-accepted-in-envelope' });
  assert.deepEqual(verdict(envelope(own, { certificate: 'dw2_ffffffffffffffffffff' })), { status: 'unverified', reasonCode: 'certificate-mismatch' });
  assert.deepEqual(verdict({ ...envelope(own), schema_version: 'change-envelope-0' }), { status: 'unverified', reasonCode: 'proof-envelope-unavailable' });
  assert.deepEqual(verdict(null), { status: 'unverified', reasonCode: 'proof-envelope-unavailable' });
  // A missing measurement is not a zero: no debt block means no debt figure.
  assert.equal(verdict(envelope(own, { debt: false })).debt, null);
  // Every Core certificate family is recognised when bound; "unknown" never is.
  const adaptive = 'dwac1_0123456789abcdef0123';
  assert.equal(verdict(envelope(own, { certificate: adaptive }), accepted(own, adaptive)).status, 'accepted');
  assert.equal(verdict(envelope(own, { certificate: 'unknown' }), accepted(own, 'unknown')).status, 'unverified');
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

test('refusals keep their Core cause: runner unavailable, inconclusive, terminal, budget, not armed', () => {
  const id = 'dwchg_' + 'a'.repeat(24);
  const block = (reason) => ({ enabled: true, ok: true, output: { decision: 'block', reason, systemMessage: reason } });
  const terminal = (reason) => ({ enabled: true, ok: true, output: { continue: false, stopReason: reason, systemMessage: reason } });
  assert.deepEqual(classifyNativeStop({ changeId: id, diffResult: block(
    'DiffWitness rejected the current handoff. Reason: candidate is not stably green under the selected test command\nclassification: stable-fail\n' +
    'cause: test-runner-unavailable (python -m pytest: No module named pytest)') }), { status: 'blocked', reasonCode: 'test-runner-unavailable' });
  assert.deepEqual(classifyNativeStop({ changeId: id, diffResult: block(
    "Reason: canonical Proof claim is 'inconclusive' and is not accepted by the change-envelope contract") }), { status: 'inconclusive', reasonCode: 'inconclusive' });
  assert.deepEqual(classifyNativeStop({ changeId: id, diffResult: terminal(
    'DiffWitness still cannot establish acceptable evidence after 3 continuation attempts. Last reason: candidate is not stably green; classification: stable-fail') }),
  { status: 'terminal', reasonCode: 'stable-fail' });
  assert.deepEqual(classifyNativeStop({ changeId: id, diffResult: block(
    "classification: stable-fail\ncause: missing-module ('requests' is not importable by the evidence command)") }), { status: 'blocked', reasonCode: 'missing-module' });
  assert.deepEqual(classifyNativeStop({ changeId: id, diffResult: block('Reason: Debt Ledger budget rejected the change: max_per_change') }),
    { status: 'blocked', reasonCode: 'debt-budget' });
  assert.deepEqual(classifyNativeStop({ changeId: id, diffResult: terminal('DiffWitness was not armed at SessionStart, so this task cannot be declared verified.') }),
    { status: 'terminal', reasonCode: 'not-armed' });
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
    diffResult: { enabled: true, ok: true, output: { systemMessage: 'DiffWitness: no production-code mutation to prove.' } }
  }), { status: 'not-required' });
  assert.deepEqual(classifyNativeStop({ changeId: id,
    diffResult: { enabled: false, ok: true, required: false }
  }), { status: 'not-configured' });
});

test('accepted report for a foreign/missing change identity cannot verify local code', () => {
  const own = 'dwchg_' + 'a'.repeat(24);
  const foreign = 'dwchg_' + 'b'.repeat(24);
  assert.equal(classifyNativeStop({ changeId: own, diffResult: accepted(foreign), envelope: envelope(own) }).status, 'unverified');
  assert.equal(classifyNativeStop({ changeId: null, diffResult: accepted(own), envelope: envelope(own) }).status, 'unverified');
  assert.equal(classifyNativeStop({ changeId: own,
    diffResult: { enabled: true, ok: true, output: { systemMessage: 'The agent says the tests passed' } }
  }).status, 'unverified');
  // An IdleProof-appended line cannot turn a Core message into an acceptance.
  assert.equal(classifyNativeStop({ changeId: own, envelope: envelope(own),
    diffResult: { enabled: true, ok: true, output: { systemMessage: 'DiffWitness: Proof status unknown' } },
    output: { systemMessage: 'DiffWitness Proof accepted: ' + CERT + ' · ' + own } }).status, 'unverified');
});

test('a new active turn prevents stale native Stop from upgrading the session but keeps its history', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  writeEnvelope(cwd, envelope(changeId));
  processHookLifecycle({ ...stop, hook_event_name: 'UserPromptSubmit', prompt: 'Start another task' });
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity,
    accepted(changeId), accepted(changeId).output), false);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.notEqual(session.nativeStop?.status, 'accepted');
  // The late verdict is a fact about the earlier exact change, never about the new turn.
  assert.equal(session.nativeStopHistory.at(-1).changeId, changeId);
  assert.equal(session.completedChanges.find((item) => item.changeId === changeId).nativeStop.status, 'accepted');
});

test('a delayed verdict for an earlier tree cannot be attached to a newer change of the same session', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  writeEnvelope(cwd, envelope(changeId));
  // The tree changes and a second Stop completes a new change before the first verdict arrives.
  processHookLifecycle({ ...stop, hook_event_name: 'UserPromptSubmit', prompt: 'Also cap the fee' });
  fs.appendFileSync(path.join(cwd, 'cart.py'), '\ndef cap(): return 600\n');
  const second = processHookLifecycle(stop, { deferAutoDebt: true });
  assert.notEqual(second.completedIdentity.changeId, changeId);
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, accepted(changeId), accepted(changeId).output), false);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.equal(session.nativeStop.status, 'pending');
  assert.equal(session.nativeStop.changeId, second.completedIdentity.changeId);
  assert.equal(publicSession(session).nativeStop.status, 'pending');
});

test('a later acceptance keeps earlier refusals of the same change visible', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  const refusal = { enabled: true, required: true, ok: true, output: {
    decision: 'block', reason: 'classification: stable-fail', systemMessage: 'DiffWitness rejected this handoff' } };
  recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, refusal, refusal.output);
  // The agent's continuation repairs the environment, not the tree: the same change is proven next.
  const again = processHookLifecycle(stop, { deferAutoDebt: true });
  assert.equal(again.completedIdentity.changeId, changeId);
  writeEnvelope(cwd, envelope(changeId));
  assert.equal(recordNativeStopStatus(cwd, stop, again.completedIdentity, accepted(changeId), accepted(changeId).output), true);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.deepEqual(session.nativeStopHistory.map((item) => item.status), ['blocked', 'accepted']);
  const shown = publicNativeStop(session);
  assert.equal(shown.status, 'accepted');
  assert.equal(shown.earlierNotAccepted, 1);
  assert.equal(session.completedChanges.find((item) => item.changeId === changeId).nativeStop.status, 'accepted');
});

test('a repeated Stop of an already accepted tree does not downgrade its verdict', (t) => {
  const { cwd, stop, lifecycle, changeId } = fixture(t);
  writeEnvelope(cwd, envelope(changeId));
  recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, accepted(changeId), accepted(changeId).output);
  const repeat = processHookLifecycle(stop, { deferAutoDebt: true });
  assert.equal(loadState(cwd).sessions[stop.session_id].nativeStop.status, 'accepted');
  const notArmed = { enabled: true, required: true, ok: true, output: { continue: false,
    stopReason: 'DiffWitness was not armed at SessionStart', systemMessage: 'DiffWitness was not armed at SessionStart' } };
  assert.equal(recordNativeStopStatus(cwd, stop, repeat.completedIdentity, notArmed, notArmed.output), false);
  const session = loadState(cwd).sessions[stop.session_id];
  assert.equal(session.nativeStop.status, 'accepted');
  assert.deepEqual(session.nativeStopHistory.map((item) => item.status), ['accepted', 'terminal']);
});

test('no-change Stop records no-change rather than accepted Proof', (t) => {
  const { cwd, stop, lifecycle } = fixture(t, false);
  const noChange = { enabled: true, ok: true, required: true,
    output: { systemMessage: 'DiffWitness: no repository change to prove.' } };
  assert.equal(recordNativeStopStatus(cwd, stop, lifecycle.completedIdentity, noChange, noChange.output), true);
  assert.equal(loadState(cwd).sessions[stop.session_id].nativeStop.status, 'no-change');
});

test('the change envelope is found in a linked Git worktree', (t) => {
  const { cwd } = fixture(t);
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), 'idleproof-linked-'));
  t.after(() => fs.rmSync(linked, { recursive: true, force: true }));
  fs.rmSync(linked, { recursive: true, force: true });
  execFileSync('git', ['worktree', 'add', '-q', '--detach', linked], { cwd });
  assert.ok(fs.statSync(path.join(linked, '.git')).isFile());
  const file = changeEnvelopePath(linked);
  assert.ok(!file.startsWith(path.join(linked, '.git') + path.sep), file);
  assert.match(file.replaceAll('\\', '/'), /\/worktrees\/[^/]+\/diffwitness\/change-envelope\.json$/);
  // The IDE assurance reader looks where Core writes: before, it read `<worktree>/.git/...` and
  // never saw a linked worktree's envelope.
  assert.equal(queueMatchingDiffWitnessAssurance(linked).reason, 'no-envelope');
  writeEnvelope(linked, envelope('dwchg_' + 'c'.repeat(24)));
  assert.notEqual(queueMatchingDiffWitnessAssurance(linked).reason, 'no-envelope');
});

// The real native runner with a stand-in Core: the Stop protocol and envelope it writes are the only
// inputs, as with the installed DiffWitness executable.
function fakeCore(dir) {
  const file = path.join(dir, 'fake-dw.mjs');
  fs.writeFileSync(file, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const mode = JSON.parse(fs.readFileSync(process.env.FAKE_CORE_MODE, 'utf8'));
const event = process.argv[3];
let input = ''; for await (const chunk of process.stdin) input += chunk;
if (event !== 'session-stop') { console.log('{}'); process.exit(0); }
if (mode.envelope) {
  const target = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'diffwitness/change-envelope.json'], { cwd: JSON.parse(input).cwd, encoding: 'utf8' }).trim();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(mode.envelope));
}
console.log(JSON.stringify(mode.output));
`);
  fs.chmodSync(file, 0o755);
  return file;
}

test('real native runner: Local shows Proof only for the Core envelope of the exact change', { skip: process.platform === 'win32' && 'POSIX shebang stand-in' }, (t) => {
  const { cwd, changeId } = fixture(t);
  // Outside the repository: an untracked file would be part of the candidate tree and its change id.
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), 'idleproof-fake-core-'));
  t.after(() => fs.rmSync(tools, { recursive: true, force: true }));
  const core = fakeCore(tools);
  const modeFile = path.join(tools, 'mode.json');
  fs.writeFileSync(path.join(cwd, '.idleproof', 'diffwitness.json'), JSON.stringify({
    schema: 'diffwitness.integration-config.v1', requireDiffWitness: true, diffWitnessCommand: core, adapters: ['codex'] }));
  const hook = fileURLToPath(new URL('../bin/idleproof-hook.mjs', import.meta.url));
  const runStop = (mode) => {
    fs.writeFileSync(modeFile, JSON.stringify(mode));
    const result = spawnSync(process.execPath, [hook, 'codex'], { cwd, encoding: 'utf8', timeout: 60000,
      input: JSON.stringify({ cwd, session_id: 'native-codex', hook_event_name: 'Stop' }),
      env: { ...process.env, FAKE_CORE_MODE: modeFile, IDLEPROOF_AUTO_DEBT_WORKER: 'off', IDLEPROOF_PORTAL_SYNC: 'off' } });
    assert.equal(result.status, 0, result.stderr);
    return { output: JSON.parse(result.stdout.trim()), session: publicSession(loadState(cwd).sessions['native-codex']) };
  };

  const refused = runStop({ output: { decision: 'block', reason: 'classification: stable-fail\ncause: test-runner-unavailable', systemMessage: 'DiffWitness rejected the current handoff.' } });
  assert.equal(refused.output.decision, 'block');
  assert.equal(refused.session.nativeStop.status, 'blocked');
  assert.equal(refused.session.nativeStop.reasonCode, 'test-runner-unavailable');

  const textOnly = runStop({ output: acceptedDegraded().output });
  assert.equal(textOnly.session.nativeStop.status, 'unverified');

  const bound = runStop({ output: accepted(changeId).output, envelope: envelope(changeId) });
  assert.equal(bound.output.decision, undefined);
  assert.equal(bound.session.nativeStop.status, 'accepted');
  assert.equal(bound.session.nativeStop.certificateId, CERT);
  assert.equal(bound.session.nativeStop.earlierNotAccepted, 2);
});
