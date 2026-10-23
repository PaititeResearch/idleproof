import { mutateState } from './state.mjs';

// Only an authoritative native Stop response can update this presentation status. A Git diff,
// local attestation or completed coding turn is never an accepted DiffWitness Proof.
export function classifyNativeStop({ diffResult, output, changeId = null } = {}) {
  if (diffResult?.enabled === false) return { status: 'not-configured' };
  if (!diffResult?.ok) return {
    status: 'unavailable',
    reasonCode: String(diffResult?.errorCode || 'bridge-unavailable').slice(0, 80)
  };

  const native = diffResult.output || {};
  if (output?.decision === 'block' || native.decision === 'block' ||
      output?.continue === false || native.continue === false) {
    const reason = String(native.reason || native.stopReason || native.systemMessage ||
      output?.reason || output?.stopReason || '');
    const match = reason.match(/classification:\s*(stable-fail|flaky|timeout)\b/i);
    return {
      status: (output?.continue === false || native.continue === false) ? 'terminal' : 'blocked',
      reasonCode: match ? match[1].toLowerCase() : 'proof-not-accepted'
    };
  }

  const message = String(native.systemMessage || '');
  if (/^DiffWitness: no (?:repository change|production-code mutation) to prove\./.test(message)) {
    return { status: 'no-change' };
  }

  const certificate = message.match(/^DiffWitness Proof accepted:\s*(dw2_[a-z0-9]+)/);
  if (certificate) {
    // If Core supplies an exact change id, never display an acceptance against a different
    // local change. The original native certificate remains in Core even when the UI abstains.
    const reportedChange = message.match(/\bdwchg_[a-f0-9]{24}\b/)?.[0] || null;
    if (!changeId || (reportedChange && reportedChange !== changeId)) {
      return { status: 'unverified', reasonCode: 'change-identity-unavailable' };
    }
    return { status: 'accepted', certificateId: certificate[1] };
  }

  return { status: 'unverified', reasonCode: 'no-accepted-proof' };
}

// Called after the native Core Stop, not by SessionEnd or the server poller. The compare-and-set
// prevents a delayed Stop for an earlier turn from upgrading a new/changed session.
export function recordNativeStopStatus(cwd, event, completedIdentity, diffResult, output) {
  const sessionId = typeof event?.session_id === 'string' ? event.session_id : '';
  if (!sessionId) return false;
  const changeId = completedIdentity?.available ? completedIdentity.changeId : null;
  let recorded = false;
  mutateState(cwd, (state) => {
    const session = state.sessions?.[sessionId];
    const currentId = session?.changeIdentity?.available ? session.changeIdentity.changeId : null;
    if (!session || session.status !== 'complete' ||
        currentId !== changeId ||
        session.nativeStop?.status !== 'pending' ||
        session.nativeStop.changeId !== changeId) return state;

    session.nativeStop = {
      ...classifyNativeStop({ diffResult, output, changeId }),
      changeId,
      checkedAt: new Date().toISOString()
    };
    recorded = true;
    return state;
  });
  return recorded;
}
