import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { mutateState } from './state.mjs';

const CHANGE_ID = /^dwchg_[a-f0-9]{24}$/;
// Core certificate ids: dw2_ (exhaustive), dwac1_ (Adaptive Core), dwa1_ (assurance), dwv1_ (validation).
const CERTIFICATE = /^dw[a-z0-9]{0,4}_[a-f0-9]{8,64}$/;
const ACCEPTED_MESSAGE = /^DiffWitness Proof accepted:\s*(dw[a-z0-9]{0,4}_[a-f0-9]{8,64})(?=\s|$)/;
// Claims that change-envelope-1 can carry with accepted=true (Core change_envelope._proof_claim).
const ACCEPTED_CLAIMS = new Set(['causal', 'preservation', 'validation', 'not-required']);
const MAX_ENVELOPE_BYTES = 1024 * 1024;
const HISTORY_LIMIT = 20;

// Core writes the frozen change envelope through `git rev-parse --git-path`, which is not `.git/`
// in a linked worktree.
export function changeEnvelopePath(cwd = process.cwd()) {
  try {
    const raw = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'diffwitness/change-envelope.json'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true }).trim();
    if (raw) return raw;
  } catch {}
  return path.join(cwd, '.git', 'diffwitness', 'change-envelope.json');
}

export function readNativeChangeEnvelope(cwd = process.cwd()) {
  try {
    const file = changeEnvelopePath(cwd);
    if (fs.statSync(file).size > MAX_ENVELOPE_BYTES) return null;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function envelopeDebt(debt) {
  if (!debt || typeof debt !== 'object' || debt.report_schema !== 'debt-report-1') return null;
  if (!Number.isSafeInteger(debt.points) || debt.points < 0 || !Array.isArray(debt.open_lineages)) return null;
  return {
    points: debt.points,
    obligations: new Set(debt.open_lineages.map(String)).size,
    budgetPassed: typeof debt.budget_passed === 'boolean' ? debt.budget_passed : null
  };
}

// The Stop text names a certificate; only Core's structured envelope binds it to one exact change.
function envelopeBinding(envelope, changeId, certificateId) {
  if (!envelope || envelope.schema_version !== 'change-envelope-1') return { ok: false, reasonCode: 'proof-envelope-unavailable' };
  if (envelope.change_id !== changeId) return { ok: false, reasonCode: 'change-identity-mismatch' };
  const proof = envelope.proof;
  if (!proof || typeof proof !== 'object' || proof.tool !== 'diffwitness' || proof.accepted !== true ||
      !ACCEPTED_CLAIMS.has(proof.claim)) return { ok: false, reasonCode: 'proof-not-accepted-in-envelope' };
  if (proof.certificate_id !== certificateId) return { ok: false, reasonCode: 'certificate-mismatch' };
  return { ok: true, claim: proof.claim, debt: envelopeDebt(envelope.debt) };
}

function refusalReason(text) {
  const cause = text.match(/\bcause:\s*(test-runner-unavailable|evidence-command-unavailable)\b/)?.[1];
  if (cause) return cause;
  const classification = text.match(/classification:\s*(stable-fail|flaky|timeout)\b/i)?.[1];
  if (classification) return classification.toLowerCase();
  if (/claim is '?inconclusive'?|inconclusive evidence|before 1-minimality was established/i.test(text)) return 'inconclusive';
  if (/Debt Ledger budget rejected/i.test(text)) return 'debt-budget';
  if (/cannot find an evidence command/i.test(text)) return 'no-evidence-command';
  if (/not armed at SessionStart|SessionStart state is invalid/i.test(text)) return 'not-armed';
  return 'proof-not-accepted';
}

// Only an authoritative native Stop response can update this presentation status. A Git diff,
// local attestation or completed coding turn is never an accepted DiffWitness Proof. The text can
// only lower the status: acceptance also needs Core's change envelope for the exact local change.
export function classifyNativeStop({ diffResult, output, changeId = null, envelope = null } = {}) {
  if (diffResult?.enabled === false) return { status: 'not-configured' };
  if (!diffResult?.ok) return {
    status: 'unavailable',
    reasonCode: String(diffResult?.errorCode || 'bridge-unavailable').slice(0, 80)
  };

  const native = diffResult.output || {};
  if (output?.decision === 'block' || native.decision === 'block' ||
      output?.continue === false || native.continue === false) {
    const text = [native.reason, native.stopReason, native.systemMessage, output?.reason, output?.stopReason]
      .filter((value) => typeof value === 'string').join('\n');
    const reasonCode = refusalReason(text);
    const terminal = output?.continue === false || native.continue === false;
    return { status: terminal ? 'terminal' : reasonCode === 'inconclusive' ? 'inconclusive' : 'blocked', reasonCode };
  }

  const message = String(native.systemMessage || '');
  if (/^DiffWitness: no repository change to prove\./.test(message)) return { status: 'no-change' };
  if (/^DiffWitness: no production-code mutation to prove\./.test(message)) return { status: 'not-required' };

  const certificate = message.match(ACCEPTED_MESSAGE)?.[1];
  if (certificate) {
    if (!CHANGE_ID.test(String(changeId || ''))) return { status: 'unverified', reasonCode: 'change-identity-unavailable' };
    // A reported change id is a cross-check, never a substitute for the envelope: Core omits it when
    // Continuity is degraded.
    if ((message.match(/\bdwchg_[a-f0-9]{24}\b/g) || []).some((id) => id !== changeId)) {
      return { status: 'unverified', reasonCode: 'change-identity-mismatch' };
    }
    const binding = envelopeBinding(envelope, changeId, certificate);
    if (!binding.ok) return { status: 'unverified', reasonCode: binding.reasonCode };
    return { status: 'accepted', certificateId: certificate, claim: binding.claim, debt: binding.debt, binding: 'core-change-envelope' };
  }

  return { status: 'unverified', reasonCode: 'no-accepted-proof' };
}

export function isBoundAcceptance(verdict, changeId) {
  return verdict?.status === 'accepted' && CHANGE_ID.test(String(changeId || '')) && verdict.changeId === changeId &&
    CERTIFICATE.test(String(verdict.certificateId || '')) && verdict.binding === 'core-change-envelope';
}

// Called after the native Core Stop, not by SessionEnd or the server poller. Every verdict is kept
// in the session history; only a compare-and-set on the pending exact change updates the current
// status, so a delayed Stop for an earlier turn cannot upgrade a new/changed session.
export function recordNativeStopStatus(cwd, event, completedIdentity, diffResult, output, { readEnvelope = readNativeChangeEnvelope } = {}) {
  const sessionId = typeof event?.session_id === 'string' ? event.session_id : '';
  if (!sessionId) return false;
  const changeId = completedIdentity?.available ? completedIdentity.changeId : null;
  const accepting = ACCEPTED_MESSAGE.test(String(diffResult?.output?.systemMessage || ''));
  const verdict = {
    ...classifyNativeStop({ diffResult, output, changeId, envelope: accepting ? readEnvelope(cwd) : null }),
    changeId,
    checkedAt: new Date().toISOString()
  };
  let recorded = false;
  mutateState(cwd, (state) => {
    const session = state.sessions?.[sessionId];
    if (!session) return state;
    session.nativeStopHistory = [...(Array.isArray(session.nativeStopHistory) ? session.nativeStopHistory : []), verdict].slice(-HISTORY_LIMIT);
    const record = (session.completedChanges || []).find((item) => item?.changeId && item.changeId === changeId);
    // The frozen record keeps the first accepted verdict of its exact change.
    if (record && !isBoundAcceptance(record.nativeStop, changeId)) record.nativeStop = verdict;

    const currentId = session?.changeIdentity?.available ? session.changeIdentity.changeId : null;
    if (session.status !== 'complete' ||
        currentId !== changeId ||
        session.nativeStop?.status !== 'pending' ||
        session.nativeStop.changeId !== changeId) return state;

    session.nativeStop = verdict;
    recorded = true;
    return state;
  });
  return recorded;
}

// The status a reader may show for a session: its current exact change only, plus earlier verdicts
// of that same change so a later acceptance never hides the refusals before it.
export function publicNativeStop(session) {
  const changeId = session?.proof?.changeId || null;
  const current = session?.nativeStop && session.nativeStop.changeId === changeId ? session.nativeStop : null;
  if (!current) return null;
  const earlier = (Array.isArray(session.nativeStopHistory) ? session.nativeStopHistory : [])
    .filter((item) => item?.changeId === changeId && item !== current && item.checkedAt !== current.checkedAt);
  return { ...current, earlierAttempts: earlier.length, earlierNotAccepted: earlier.filter((item) => item.status !== 'accepted').length };
}
