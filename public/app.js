let feedbackLock = null;
let featureFeedbackLock = null;
// Whether the last loaded state allows accepting the current change; false until state is known.
let acceptAllowed = false;
// Time of the last successful /api/state response; null until one arrives.
let lastStateAt = null;
// Presentation freshness only: no API, policy or evidence semantics are changed.
const STATE_TIMEOUT_MS = 8000;
const STATE_MAX_AGE_MS = 10000;
let statePoll = null;
let acceptanceBusy = false;
let approvalBusy = false;
let approvalFingerprint = null;
let acceptanceSequence = 0;

const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[ch]));
const shortHash = (value, size = 12) => value ? `${String(value).slice(0, size)}…` : 'waiting';
// The page CSP refuses inline style attributes, so bars use a native <progress> element.
const meter = (className, value, label) => { const n = Number(value); return `<progress class="${className}" max="100" value="${Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></progress>`; };
// Presentation only: a value that was not assessed is shown quieter than a measured one.
const markAssessed = (...ids) => ids.forEach((id) => { const el = $(id); if (el) el.dataset.assessed = String(el.textContent.trim() !== 'Not assessed'); });
// Project-wide check counts cannot establish that a particular zero-valued item was checked.
// Preserve positive recorded scores; an ambiguous zero must not imply a failed personal check.
const recallText = (value, anyChecks) => {
  if (!anyChecks) return 'not assessed';
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)}%` : 'assessment unavailable';
};
const recallMeter = (className, value, label) => Number(value) > 0 ? meter(className, value, label) : '<span class="meter-empty" aria-hidden="true"></span>';

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function riskLabel(card = {}) {
  if (card.risk >= 5) return 'HIGH RISK';
  if (card.risk >= 4) return 'RISK';
  return card.level?.toUpperCase() || 'CORE';
}

function resumeLabel(value) {
  if (!value) return 'when the task context changes';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  const minutes = Math.max(1, Math.ceil((date.getTime() - Date.now()) / 60000));
  return `in about ${minutes} min`;
}

function renderFiles(session) {
  const files = session?.touchedFiles || [];
  $('files').innerHTML = files.length
    ? files.slice(-10).reverse().map((file) => `<div class="file-row"><span>${escapeHtml(file)}</span><span>touched</span></div>`).join('')
    : '<p class="empty">No files observed yet.</p>';
  const changed = session?.changed || { added: 0, deleted: 0 };
  $('linesChanged').textContent = `+${changed.added || 0} −${changed.deleted || 0}`;
}

function renderFindings(session) {
  const findings = session?.findings || [];
  $('findingCount').textContent = findings.length;
  $('findings').innerHTML = findings.length
    ? findings.slice(0, 7).map((f) => `<div class="finding ${escapeHtml(f.severity)}"><strong>${escapeHtml(f.title)}</strong><p>${escapeHtml(f.message)}</p></div>`).join('')
    : `<p class="empty">${session?.status === 'complete' ? 'No narrow deterministic rule fired on this diff. This is not a guarantee of safety.' : 'Checks appear when the agent completes a turn.'}</p>`;
}

function renderLedger(ledger) {
  const rows = Object.values(ledger || {}).sort((a,b) => (b.risk * b.exposures * (100 - b.confidence)) - (a.risk * a.exposures * (100 - a.confidence)));
  $('ledger').innerHTML = rows.length
    ? rows.slice(0, 8).map((entry) => `<div class="ledger-row"><span class="ledger-title">${escapeHtml(entry.title)}</span><span class="ledger-risk">×${entry.exposures} · r${entry.risk}</span>${recallMeter('ledger-meter', entry.confidence, `${entry.confidence}% confidence`)}</div>`).join('')
    : '<p class="empty">Concepts appear as the coding agent touches your codebase.</p>';
}

function renderJourney(state) {
  const concepts = state.learning?.concepts || [];
  const complete = state.session?.status === 'complete';
  const visible = concepts.slice(0, complete ? 6 : 3);
  $('learningJourney').innerHTML = visible.length
    ? visible.map((item) => `<div class="ledger-row"><span class="ledger-title">${escapeHtml(item.title)}</span><span class="ledger-risk">${escapeHtml(item.status)} · ${recallText(item.confidence, state.metrics?.conceptsChecked)}</span>${recallMeter('ledger-meter', item.confidence, `${item.confidence}% mastery`)}</div>`).join('')
    : '<p class="empty">The task knowledge map will appear as the agent reveals relevant concepts.</p>';
}

function renderLearning(state) {
  const card = state.card || {};
  const learning = state.learning || {};
  const handoff = state.session?.status === 'complete';
  const recap = learning.recap || {};

  if (!state.session) {
    $('cardRisk').textContent = 'WAITING';
    $('cardTime').textContent = 'No activity observed';
    $('cardConfidence').textContent = 'Understanding not assessed';
    $('cardTitle').textContent = 'No agent session observed';
    $('cardWhy').textContent = 'The project scan is available above. No agent activity has been observed in this installation.';
    $('cardLesson').textContent = '';
    $('question').textContent = '';
    $('answers').innerHTML = '';
    $('feedback').textContent = '';
    renderJourney(state);
    return;
  }

  if (learning.paused) {
    const first = learning.snoozedConceptIds?.[0] || '';
    $('cardRisk').textContent = 'PAUSED';
    $('cardTime').textContent = resumeLabel(learning.resumeAt);
    $('cardConfidence').textContent = `${recap.mastered || 0} mastered · ${recap.building || 0} building · ${recap.review || 0} review`;
    $('cardTitle').textContent = 'No lesson forced right now';
    $('cardWhy').textContent = 'You chose “not now”. IdleProof does not count that as a wrong answer or reduce your mastery.';
    $('cardLesson').textContent = 'The agent can keep working. A useful lesson returns when context changes or the snooze expires.';
    $('question').textContent = '';
    $('answers').innerHTML = first ? '<button class="text-button" id="resumeLesson" type="button">resume learning now</button>' : '';
    $('feedback').textContent = '';
    $('resumeLesson')?.addEventListener('click', () => snoozeLesson(first, 0));
    renderJourney(state);
    return;
  }

  $('cardRisk').textContent = handoff ? 'HANDOFF' : riskLabel(card);
  const depth = card.presentation?.label ? ` · ${card.presentation.label}` : '';
  $('cardTime').textContent = `≈ ${card.seconds || 20} sec${depth}`;
  $('cardConfidence').textContent = handoff
    ? `${recap.mastered || 0} mastered · ${recap.building || 0} building · ${recap.review || 0} review`
    : card.id ? `${Number(card.confidence) > 0 ? `${card.confidence}% mastery` : state.metrics?.conceptsChecked ? 'assessment unavailable' : 'mastery not assessed'} · ${learning.phase || 'live'}` : 'Understanding not assessed';
  $('cardTitle').textContent = card.title || 'Current task';
  $('cardWhy').textContent = card.why || 'IdleProof will connect a useful concept to the task as soon as the agent starts working.';
  $('cardLesson').textContent = card.lesson || '';
  $('question').textContent = card.id ? card.question || 'What should you understand about this task?' : '';
  if (!feedbackLock || feedbackLock !== card.id) $('feedback').textContent = '';
  const choices = (card.options || []).map((option, index) => `<button class="answer" data-choice="${index}">${escapeHtml(option)}</button>`).join('');
  const snooze = card.id ? '<button class="text-button" id="snoozeLesson" type="button">not now · 10 min</button>' : '';
  $('answers').innerHTML = `${choices}${snooze}`;
  document.querySelectorAll('#answers .answer').forEach((button) => button.addEventListener('click', () => submitAnswer(card.id, Number(button.dataset.choice))));
  $('snoozeLesson')?.addEventListener('click', () => snoozeLesson(card.id, 10));
  renderJourney(state);
}

function storyStep(step, index) {
  const role = escapeHtml(step.role || step.type || 'code');
  return `<div class="feature-step role-${role}"><span>${role}</span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.evidence || 'observed locally')}</small></div>${index >= 0 ? '<span class="feature-arrow" aria-hidden="true">→</span>' : ''}`;
}

function surfaceChip(type, value) {
  return `<span class="surface-chip"><b>${escapeHtml(type)}</b>${escapeHtml(value)}</span>`;
}

function driftDetails(drift = {}) {
  const additions = Object.entries(drift.added || {}).flatMap(([group, values]) => (values || []).map((value) => `<span class="drift-token added">+ ${escapeHtml(group)} · ${escapeHtml(value)}</span>`));
  const removals = Object.entries(drift.removed || {}).flatMap(([group, values]) => (values || []).map((value) => `<span class="drift-token removed">− ${escapeHtml(group)} · ${escapeHtml(value)}</span>`));
  return [...additions, ...removals].slice(0, 8).join('');
}

function renderFeatureMemory(memory = []) {
  $('featureMemoryCount').textContent = `${memory.length} tracked`;
  $('featureMemory').innerHTML = memory.length ? memory.map((item) => {
    const story = (item.story || []).slice(0, 4).map((step) => escapeHtml(step.label)).join(' → ');
    const surfaces = [...(item.surfaces?.technologies || []).slice(0, 2), ...(item.surfaces?.routes || []).slice(0, 1), ...(item.surfaces?.tables || []).slice(0, 1)];
    const status = item.needsRefresh ? '<span class="refresh-badge">refresh</span>' : `<span>${item.checks > 0 ? `${item.confidence || 0}% fluent` : 'not assessed'}</span>`;
    const drift = item.needsRefresh && item.drift?.summary ? `<div class="memory-drift">${escapeHtml(item.drift.summary)}</div>` : '';
    return `<article class="memory-card ${item.needsRefresh ? 'needs-refresh' : ''}"><div class="memory-top"><strong>${escapeHtml(item.task || 'Previous feature')}</strong>${status}</div><p>${story || 'Feature structure captured from a completed task.'}</p>${drift}<div class="memory-tags">${surfaces.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>${item.checks > 0 ? meter('memory-meter', item.confidence || 0, `${item.confidence || 0}% fluent`) : ''}</article>`;
  }).join('') : '<p class="empty">Completed feature tasks will accumulate here and become spaced-review material.</p>';
}

function renderFeatureModel(state) {
  const model = state.featureModel;
  const projectFluency = state.metrics?.featureCoverage || 0;
  const pending = state.projectModel?.stats?.pendingFeatureReviews || 0;
  $('featureFluency').textContent = state.metrics?.featuresChecked ? `${projectFluency}%` : 'Not assessed';
  $('featureFluencyHint').textContent = pending ? `${pending} feature review${pending === 1 ? '' : 's'} waiting` : state.metrics?.featuresSeen ? `${state.metrics.featuresSeen} feature mental model${state.metrics.featuresSeen === 1 ? '' : 's'} tracked` : 'mental models demonstrated';
  renderFeatureMemory(state.featureMemory || []);

  if (!model) {
    $('featureModelStatus').textContent = 'waiting for code context';
    $('currentFeatureFluency').textContent = 'Not assessed';
    $('featureDisclaimer').textContent = 'IdleProof will build a bounded static map once the agent touches project-local code.';
    $('featureDrift').className = 'drift-banner hidden';
    $('featureStory').innerHTML = '<p class="empty">No connected feature structure observed yet.</p>';
    $('featureSurfaces').innerHTML = '';
    $('featureRiskNotes').innerHTML = '';
    $('featureExplainBack').className = 'explain-back hidden';
    $('featureChallenge').className = 'challenge feature-challenge hidden';
    return;
  }

  $('featureModelStatus').textContent = `bounded static · ${model.generatedFrom?.filesInspected || 0} files`;
  $('currentFeatureFluency').textContent = Number(model.fluency?.checks) > 0 ? `${model.fluency?.confidence || 0}%` : 'Not assessed';
  $('featureDisclaimer').textContent = model.disclaimer || 'This is a bounded static map, not a proven runtime trace.';

  if (model.drift?.changed) {
    $('featureDrift').className = `drift-banner ${escapeHtml(model.drift.level || 'minor')}`;
    $('featureDrift').innerHTML = `<div><span>${model.drift.preview ? 'LIVE MENTAL MODEL DRIFT' : 'MENTAL MODEL DRIFT'} · ${escapeHtml((model.drift.level || 'changed').toUpperCase())}</span><strong>${escapeHtml(model.drift.summary || 'Feature structure changed.')}</strong></div><div class="drift-tokens">${driftDetails(model.drift)}</div>`;
  } else {
    $('featureDrift').className = 'drift-banner hidden';
    $('featureDrift').innerHTML = '';
  }

  const story = model.story || [];
  $('featureStory').innerHTML = story.length ? story.map((step, index) => storyStep(step, index === story.length - 1 ? -1 : index)).join('') : '<p class="empty">IdleProof sees code, but not enough connected structure to tell a useful feature story yet.</p>';
  const surfaces = [
    ...(model.surfaces?.routes || []).slice(0, 4).map((v) => ['route', v]),
    ...(model.surfaces?.technologies || []).slice(0, 4).map((v) => ['external', v]),
    ...(model.surfaces?.tables || []).slice(0, 4).map((v) => ['data', v]),
    ...(model.tests || []).slice(0, 3).map((v) => ['test', v])
  ];
  $('featureSurfaces').innerHTML = surfaces.map(([type, value]) => surfaceChip(type, value)).join('');
  $('featureRiskNotes').innerHTML = (model.riskNotes || []).map((note) => `<p>↳ ${escapeHtml(note)}</p>`).join('');

  if (model.explainBack) {
    $('featureExplainBack').className = 'explain-back';
    $('featureExplainBack').innerHTML = `<span>60-SECOND EXPLAIN-BACK</span><p>${escapeHtml(model.explainBack)}</p>`;
  } else $('featureExplainBack').className = 'explain-back hidden';

  if (model.challenge) {
    $('featureChallenge').className = 'challenge feature-challenge';
    $('featureQuestion').textContent = model.challenge.question;
    if (!featureFeedbackLock || featureFeedbackLock !== model.fingerprint) $('featureFeedback').textContent = '';
    $('featureAnswers').innerHTML = (model.challenge.options || []).map((option, index) => `<button class="answer feature-answer" data-choice="${index}">${escapeHtml(option)}</button>`).join('');
    document.querySelectorAll('.feature-answer').forEach((button) => button.addEventListener('click', () => submitFeatureAnswer(model.fingerprint, Number(button.dataset.choice))));
  } else $('featureChallenge').className = 'challenge feature-challenge hidden';
}

function renderProjectModel(state) {
  const model = state.projectModel || {};
  const impact = model.impact || { otherFeatures: [], blastRadius: 0, summary: '' };
  $('impactCount').textContent = `${impact.blastRadius || 0} other feature${impact.blastRadius === 1 ? '' : 's'}`;
  // Translate only the server's known presentation templates, not paths or user-supplied task text.
  const summary = typeof impact.summary === 'string' ? impact.summary : '';
  $('impactSummary').textContent = summary
    .replace(/^(This task's observed feature surface overlaps \d+ other )learned (features?\b)/, '$1tracked $2')
    .replace(/^No other learned feature currently overlaps/, 'No other tracked feature currently overlaps')
    || 'IdleProof will compare touched files with previously captured feature models.';
  $('impactFeatures').innerHTML = impact.otherFeatures?.length ? impact.otherFeatures.slice(0, 6).map((item) => {
    const shared = (item.sharedFiles || []).map((entry) => `${entry.role} · ${entry.file}`).join(' · ');
    const status = item.needsRefresh || item.confidence < 60 ? 'review recommended' : `${item.confidence}% fluent`;
    return `<article class="impact-card ${item.needsRefresh || item.confidence < 60 ? 'weak' : ''}"><div><strong>${escapeHtml(item.task)}</strong><span>${escapeHtml(status)}</span></div><p>shared through ${escapeHtml(shared)}</p></article>`;
  }).join('') : '<p class="empty">No other tracked feature currently shares the files touched by this task.</p>';

  const hotspots = model.topology?.hotspots || [];
  const queue = model.reviewQueue || [];
  $('projectModelStats').textContent = `${hotspots.length} hotspot${hotspots.length === 1 ? '' : 's'} · ${model.stats?.pendingFeatureReviews || 0} review`;
  $('projectHotspots').innerHTML = hotspots.length ? hotspots.slice(0, 7).map((item) => `<div class="compact-row"><div><strong>${escapeHtml(item.file)}</strong><span>${escapeHtml(item.role)} · ${item.featureCount} features</span></div><b>${recallText(item.averageFluency, state.metrics?.featuresChecked)}</b></div>`).join('') : '<p class="empty">Hotspots emerge when multiple tracked features share code.</p>';
  $('featureReviewQueue').innerHTML = queue.length ? queue.slice(0, 7).map((item) => `<div class="compact-row ${item.needsRefresh ? 'refresh-row' : ''}"><div><strong>${escapeHtml(item.task)}</strong><span>${escapeHtml(item.reason)}</span></div><b>${recallText(item.confidence, state.metrics?.featuresChecked)}</b></div>`).join('') : '<p class="empty">Feature reviews appear as your project memory grows.</p>';
}

function eventClass(policy) {
  const decision = policy?.originalDecision || policy?.decision;
  if (decision === 'deny') return 'deny';
  if (decision === 'ask') return 'ask';
  if ((policy?.risk || 0) >= 50) return 'risk';
  return '';
}

function renderTimeline(control) {
  const rows = [...(control.recentEvents || [])].reverse();
  $('timeline').innerHTML = rows.length ? rows.slice(0, 18).map((record) => {
    const e = record.event || {}; const p = e.policy;
    return `<div class="trace-row ${eventClass(p)}"><span class="trace-seq">#${record.sequence}</span><div class="trace-main"><strong>${escapeHtml(e.eventType || 'event')}${e.tool ? ` · ${escapeHtml(e.tool)}` : ''}</strong><span>${escapeHtml(e.source || 'agent')}${e.resource ? ` · ${escapeHtml(e.resource)}` : ''}${e.mcp?.server ? ` · MCP ${escapeHtml(e.mcp.server)}` : ''}</span></div><div class="trace-side">${p ? `<span class="decision ${escapeHtml(p.originalDecision || p.decision)}">${escapeHtml((p.originalDecision || p.decision || 'allow').toUpperCase())}</span><small>risk ${p.risk || 0}</small>` : '<small>observed</small>'}</div></div>`;
  }).join('') : '<p class="empty">Agent activity appears here so each lesson can be grounded in what is actually happening.</p>';
}

function stateIsFresh() {
  return document.body.dataset.connection === 'live' && lastStateAt !== null
    && Date.now() - lastStateAt.getTime() <= STATE_MAX_AGE_MS;
}

function requireFreshState() {
  if (stateIsFresh()) return true;
  markDisconnected();
  void poll();
  return false;
}

function syncCommitControls() {
  const fresh = stateIsFresh();
  $('acceptResponsibility').disabled = !fresh || !acceptAllowed || acceptanceBusy;
  const approve = $('approveAction');
  if (approve) {
    approve.disabled = !fresh || approvalBusy || !approvalFingerprint;
    if (approvalBusy) approve.textContent = 'confirming approval…';
  }
  for (const button of document.querySelectorAll('#answers button')) button.disabled = !fresh || Boolean(feedbackLock);
  for (const button of document.querySelectorAll('.feature-answer')) button.disabled = !fresh || Boolean(featureFeedbackLock);
}

function renderDecision(control) {
  const latest = control.latestDecision; const banner = $('decisionBanner');
  if (!latest || ['allow', 'observe'].includes(latest.originalDecision || latest.decision)) {
    approvalFingerprint = null;
    banner.className = 'decision-banner hidden'; banner.innerHTML = ''; return;
  }
  const decision = latest.originalDecision || latest.decision;
  banner.className = `decision-banner ${decision}`;
  const canApprove = ['ask', 'deny'].includes(decision) && latest.approvalFingerprint;
  approvalFingerprint = canApprove ? latest.approvalFingerprint : null;
  banner.innerHTML = `<div><strong>${escapeHtml(decision.toUpperCase())} · risk ${latest.risk || 0}</strong><span>${escapeHtml(latest.reason || 'IdleProof paused a risky agent action.')}</span></div>${canApprove ? `<button id="approveAction" disabled data-fingerprint="${escapeHtml(latest.approvalFingerprint)}">approve once</button>` : ''}`;
  $('approveAction')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!requireFreshState() || approvalBusy || button.disabled || button.dataset.fingerprint !== approvalFingerprint) return;
    const fingerprint = button.dataset.fingerprint;
    approvalBusy = true; syncCommitControls();
    try {
      await api('/api/approve', { method:'POST', body:JSON.stringify({ fingerprint, uses:1, minutes:10 }) });
      if ($('approveAction')?.dataset.fingerprint === fingerprint) $('approveAction').textContent = 'approved · retry action';
    } catch {
      // A failed transport is not evidence that a committing request was not applied. Never retry it automatically.
      markDisconnected();
      if ($('approveAction')?.dataset.fingerprint === fingerprint) $('approveAction').textContent = 'approval not confirmed';
    } finally {
      // Keep the action locked until a read that starts after the mutation has settled.
      await refreshAfterAction();
      approvalBusy = false; syncCommitControls();
    }
  });
}

function renderControlPlane(state) {
  const control = state.controlPlane || {};
  $('runtimeRisk').textContent = control.runtimeRisk || 0;
  $('integrityChip').textContent = control.provenance?.valid ? 'local trace verified' : 'trace invalid';
  $('integrityChip').className = `chip ${control.provenance?.valid ? 'chip-ok' : 'chip-bad'}`;
  $('chainHead').textContent = `head: ${shortHash(control.provenance?.headHash, 14)}`;
  $('traceHash').textContent = shortHash(control.provenance?.headHash, 20);
  const policy = control.policy || {};
  $('policyProfile').textContent = policy.profile || 'balanced'; $('policySource').textContent = policy.source === 'project' ? 'project policy' : 'built-in safety'; $('policyHash').textContent = shortHash(policy.sha256, 20);
  $('policyText').textContent = 'Safety hooks stay under the hood while IdleProof teaches from the same live agent context.';
  const bom = control.agentBom || { tools:[], mcpServers:[], sources:[] };
  $('agentCount').textContent = `${bom.capabilities?.length || 0} capabilit${bom.capabilities?.length === 1 ? 'y' : 'ies'}`; $('mcpCount').textContent = `${bom.mcpServers?.length || 0} MCP server${bom.mcpServers?.length === 1 ? '' : 's'}`;
  $('agentSources').textContent = bom.sources?.length ? `Observed: ${bom.sources.join(', ') || 'none'} · ${control.provenance?.events || 0} events` : 'No agent execution observed yet.';
  const att = control.attestation || {}; $('attestationState').textContent = !att.exists ? 'waiting' : att.valid ? 'signed · valid' : 'signature invalid'; $('attestationSigner').textContent = att.fingerprint ? `recorder ${shortHash(att.fingerprint, 12)}` : 'no completed turn';
  const responsibility = control.responsibility || { ownerCoverage:0, responsibilityCoverage:0, obligations:[] };
  $('responsibilityCoverage').textContent = state.session ? `${responsibility.responsibilityCoverage || 0}%` : 'Not assessed'; $('ownerCoverage').textContent = state.session ? `${responsibility.ownerCoverage || 0}% owners mapped` : 'No ownership evidence yet';
  $('responsibilityText').textContent = responsibility.obligations?.length ? `${responsibility.obligations.length} high-risk ownership obligation${responsibility.obligations.length === 1 ? '' : 's'} remain.` : state.session?.status === 'complete' ? 'No uncovered high-risk ownership obligation.' : 'Ownership evidence becomes available after a completed change.';
  acceptAllowed = state.session?.status === 'complete';
  syncCommitControls();
  renderDecision(control); renderTimeline(control);
}

function render(state) {
  const session = state.session; const active = session?.status === 'active'; const complete = session?.status === 'complete';
  const agentName = session?.source === 'codex' ? 'Codex' : session?.source === 'claude' ? 'Claude Code' : session?.source ? session.source : 'Agent';
  const learning = state.learning || {};
  $('project').textContent = state.project; $('debt').textContent = state.metrics.conceptsChecked ? state.metrics.debt : 'Not assessed'; $('coverage').textContent = state.metrics.conceptsChecked ? `${state.metrics.coverage}%` : 'Not assessed';
  $('coverage').nextElementSibling.textContent = `${state.metrics.conceptsChecked||0} checked / ${state.metrics.conceptsSeen||0} observed concepts`;
  document.body.classList.toggle('completed', complete); $('statusDot').classList.toggle('active', active);
  $('status').textContent = active ? `${agentName} working · ${learning.paused ? 'learning snoozed' : 'live lesson ready'}` : complete ? `${agentName} turn complete · mental-model review ready` : 'Waiting for a coding agent';
  $('window').textContent = active ? `≈ ${session.estimatedWindow || 20} sec learning window` : complete ? 'handoff review' : 'no learning window';
  $('currentTool').textContent = session?.currentTool || (complete ? 'Task complete · review what changed' : 'No active tool');
  $('headline').innerHTML = active ? 'Your agent is building.<br><em>Keep the mental model.</em>' : complete ? 'The code is ready.<br><em>Make sure the understanding is too.</em>' : 'Vibe code fast.<br><em>Stay fluent in your own product.</em>';
  $('task').textContent = session?.prompt || 'Run `idleproof on`, then use Claude Code or Codex normally. IdleProof turns live agent work into task-specific learning and feature understanding.';
  if (active && learning.file) $('currentTool').textContent = `${session.currentTool || 'Working'} · ${learning.file}`;
  renderControlPlane(state);
  // Feedback may pause its own card, never the rest of the live state or safety controls.
  if (!feedbackLock) renderLearning(state);
  if (!featureFeedbackLock) renderFeatureModel(state);
  renderProjectModel(state); renderFiles(session); renderFindings(session); renderLedger(state.ledger); $('proofId').textContent = shortHash(session?.proof?.diffSha256, 20);
  markAssessed('runtimeRisk', 'featureFluency', 'debt', 'coverage', 'currentFeatureFluency', 'responsibilityCoverage', 'policyProfile', 'agentCount');
}

async function submitAnswer(conceptId, choice) {
  if (!requireFreshState() || feedbackLock) return;
  try {
    feedbackLock = conceptId; syncCommitControls(); const result = await api('/api/answer', { method: 'POST', body: JSON.stringify({ conceptId, choice }) });
    [...document.querySelectorAll('#answers .answer')].forEach((button, index) => { button.disabled = true; if (index === result.answer) button.classList.add('correct'); else if (index === choice) button.classList.add('wrong'); });
    $('feedback').textContent = result.correct ? `Correct. ${result.review}` : `Not quite. ${result.review}`;
    setTimeout(() => { feedbackLock = null; void refreshAfterAction(); }, 1700);
  } catch (error) { feedbackLock = null; $('feedback').textContent = `Could not record answer: ${error.message}`; markDisconnected(); void refreshAfterAction(); }
}

async function submitFeatureAnswer(fingerprint, choice) {
  if (!requireFreshState() || featureFeedbackLock) return;
  try {
    featureFeedbackLock = fingerprint; syncCommitControls(); const result = await api('/api/feature-answer', { method: 'POST', body: JSON.stringify({ fingerprint, choice }) });
    [...document.querySelectorAll('.feature-answer')].forEach((button, index) => { button.disabled = true; if (index === result.answer) button.classList.add('correct'); else if (index === choice) button.classList.add('wrong'); });
    $('featureFeedback').textContent = `${result.correct ? 'Correct.' : 'Not quite.'} ${result.explanation}`;
    setTimeout(() => { featureFeedbackLock = null; void refreshAfterAction(); }, 2200);
  } catch (error) { featureFeedbackLock = null; $('featureFeedback').textContent = `Could not record feature check: ${error.message}`; markDisconnected(); void refreshAfterAction(); }
}

async function snoozeLesson(conceptId, minutes = 10) {
  if (!conceptId || !requireFreshState() || feedbackLock) return;
  try { feedbackLock = conceptId; syncCommitControls(); await api('/api/snooze', { method: 'POST', body: JSON.stringify({ conceptId, minutes }) }); feedbackLock = null; await refreshAfterAction(); }
  catch (error) { feedbackLock = null; $('feedback').textContent = `Could not pause this lesson: ${error.message}`; markDisconnected(); void refreshAfterAction(); }
}

function markConnected() {
  lastStateAt = new Date();
  document.body.dataset.connection = 'live';
  const banner = $('connectionBanner'); if (banner) { banner.hidden = true; banner.textContent = ''; }
  syncCommitControls();
}

// A failed refresh must not leave earlier values looking current, nor leave engaging actions available.
function markDisconnected() {
  $('status').textContent = 'IdleProof disconnected'; $('integrityChip').textContent = 'offline'; $('integrityChip').className = 'chip chip-bad';
  document.body.dataset.connection = lastStateAt ? 'stale' : 'offline';
  const banner = $('connectionBanner');
  if (banner) {
    banner.hidden = false;
    banner.textContent = lastStateAt
      ? `IdleProof Local is not responding. Live-task data is from the last update at ${lastStateAt.toLocaleString()} and may be out of date. The project scan has its own captured snapshot.`
      : 'IdleProof Local is not responding. No project state has been loaded yet.';
  }
  acceptAllowed = false; $('acceptResponsibility').disabled = true;
  syncCommitControls();
}

// A single in-flight read prevents an older response overwriting a newer state. The deadline
// also bounds a response whose headers or JSON body never complete. Late results are ignored.
function poll() {
  if (statePoll) return statePoll;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Local state refresh timed out'));
    }, STATE_TIMEOUT_MS);
  });
  statePoll = (async () => {
    try {
      const state = await Promise.race([api('/api/state', { signal: controller.signal }), deadline]);
      if (!state || typeof state !== 'object' || !state.metrics || typeof state.metrics !== 'object') {
        throw new Error('Local state is unavailable');
      }
      render(state);
      // Only a successfully rendered state is evidence of an update, not merely received headers.
      markConnected();
    } catch { markDisconnected(); }
    finally { clearTimeout(timer); statePoll = null; }
  })();
  return statePoll;
}

async function refreshAfterAction() {
  // Do not reuse a read that started before the action finished.
  if (statePoll) await statePoll;
  await poll();
}

$('copyEvidence').addEventListener('click', async () => {
  const button = $('copyEvidence'); const before = button.textContent;
  try { button.disabled = true; button.textContent = 'preparing local evidence…'; const evidence = await api('/api/evidence', { method:'POST', body:'{}' }); await navigator.clipboard.writeText(JSON.stringify(evidence, null, 2)); button.textContent = 'evidence copied'; }
  catch { button.textContent = 'not ready'; }
  finally { setTimeout(() => { button.disabled = false; button.textContent = before; }, 1500); }
});

$('acceptResponsibility').addEventListener('click', async () => {
  const button = $('acceptResponsibility');
  if (!requireFreshState() || !acceptAllowed || acceptanceBusy || button.disabled) return;
  const before = 'accept current change'; const sequence = ++acceptanceSequence;
  acceptanceBusy = true; syncCommitControls();
  try {
    button.textContent = 'binding acceptance…';
    const result = await api('/api/responsibility/accept', { method:'POST', body:JSON.stringify({}) });
    button.textContent = `accepted · ${result.responsibility.responsibilityCoverage}% covered`;
  } catch {
    button.textContent = 'acceptance not confirmed';
    markDisconnected();
  } finally {
    await refreshAfterAction();
    acceptanceBusy = false; syncCommitControls();
    setTimeout(() => {
      if (sequence !== acceptanceSequence || acceptanceBusy) return;
      button.textContent = before; syncCommitControls();
    }, 1800);
  }
});

// Browser timers may be suspended in background tabs. Recheck age before showing controls again.
if (typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!stateIsFresh()) markDisconnected();
    void poll();
  });
}

poll();
setInterval(poll, 1500);
