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
// Identity of the decision event the approve button belongs to, and what happened to our request for it.
let approvalKey = null;
let approvalOutcome = null;
let acceptanceSequence = 0;
// Committing requests that never answer are reported as unconfirmed instead of staying locked forever.
const ACTION_TIMEOUT_MS = 20000;
const CHECKING_BANNER_DELAY_MS = 600;
let checkingTimer = null;
// Label of the acceptance button derived from the loaded state; a transient result message wins briefly.
let acceptLabel = 'accept current change';
let acceptMessage = null;
// A feedback or failure message belongs to the card it was written for. Refreshes keep it until that
// card changes, so a reader always sees the outcome of their answer.
let feedbackFor = null;
let featureFeedbackFor = null;
const setFeedback = (conceptId, text) => { feedbackFor = conceptId; $('feedback').textContent = text; };
const setFeatureFeedback = (fingerprint, text) => { featureFeedbackFor = fingerprint; $('featureFeedback').textContent = text; };

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
// Rewriting identical markup on every poll drops keyboard focus, open details and clicks in progress.
// Containers are only rewritten when their markup changes; callers that alter rendered children forget it.
const renderedHtml = new WeakMap();
function patchHtml(el, html) {
  if (!el || renderedHtml.get(el) === html) return false;
  el.innerHTML = html; renderedHtml.set(el, html); return true;
}
const forgetHtml = (el) => { if (el) renderedHtml.delete(el); };

// An HTTP error is an answer from IdleProof Local (error.status is set); a thrown fetch is not.
async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const body = await res.json(); const detail = typeof body?.error === 'string' ? body.error : body?.error?.message; if (detail) message = String(detail); } catch {}
    const error = new Error(message); error.status = res.status; throw error;
  }
  // A body that is not JSON was answered but cannot be read; a cut connection stays a network error.
  try { return await res.json(); }
  catch (error) { if (error instanceof SyntaxError) throw Object.assign(new Error('Response is not readable JSON'), { unreadable: true }); throw error; }
}

// Committing request with a deadline. A timeout is an uncertain outcome, never a refusal.
async function commitRequest(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);
  try { return await api(path, { method: 'POST', body: JSON.stringify(body), signal: controller.signal }); }
  finally { clearTimeout(timer); }
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
  patchHtml($('files'), files.length
    ? files.slice(-10).reverse().map((file) => `<div class="file-row"><span>${escapeHtml(file)}</span><span>touched</span></div>`).join('')
    : '<p class="empty">No files observed yet.</p>');
  const changed = session?.changed || { added: 0, deleted: 0 };
  $('linesChanged').textContent = `+${changed.added || 0} −${changed.deleted || 0}`;
}

function renderFindings(session) {
  const findings = session?.findings || [];
  $('findingCount').textContent = findings.length;
  patchHtml($('findings'), findings.length
    ? findings.slice(0, 7).map((f) => `<div class="finding ${escapeHtml(f.severity)}"><strong>${escapeHtml(f.title)}</strong><p>${escapeHtml(f.message)}</p></div>`).join('')
    : `<p class="empty">${session?.status === 'complete' ? 'No narrow deterministic rule fired on this diff. This is not a guarantee of safety.' : 'Checks appear when the agent completes a turn.'}</p>`);
}

function renderLedger(ledger) {
  const rows = Object.values(ledger || {}).sort((a,b) => (b.risk * b.exposures * (100 - b.confidence)) - (a.risk * a.exposures * (100 - a.confidence)));
  patchHtml($('ledger'), rows.length
    ? rows.slice(0, 8).map((entry) => `<div class="ledger-row"><span class="ledger-title">${escapeHtml(entry.title)}</span><span class="ledger-risk">×${entry.exposures} · r${entry.risk}</span>${recallMeter('ledger-meter', entry.confidence, `${entry.confidence}% confidence`)}</div>`).join('')
    : '<p class="empty">Concepts appear as the coding agent touches your codebase.</p>');
}

function renderJourney(state) {
  const concepts = state.learning?.concepts || [];
  const complete = state.session?.status === 'complete';
  const visible = concepts.slice(0, complete ? 6 : 3);
  patchHtml($('learningJourney'), visible.length
    ? visible.map((item) => `<div class="ledger-row"><span class="ledger-title">${escapeHtml(item.title)}</span><span class="ledger-risk">${escapeHtml(item.status)} · ${recallText(item.confidence, state.metrics?.conceptsChecked)}</span>${recallMeter('ledger-meter', item.confidence, `${item.confidence}% mastery`)}</div>`).join('')
    : '<p class="empty">The task knowledge map will appear as the agent reveals relevant concepts.</p>');
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
    patchHtml($('answers'), '');
    setFeedback(null, '');
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
    if (patchHtml($('answers'), first ? `<button class="text-button" id="resumeLesson" type="button" data-concept="${escapeHtml(first)}">resume learning now</button>` : '')) {
      $('resumeLesson')?.addEventListener('click', () => snoozeLesson(first, 0));
    }
    // A failed "resume" keeps its message while the lesson stays paused.
    if (feedbackFor !== first) setFeedback(null, '');
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
  if ((!feedbackLock || feedbackLock !== card.id) && feedbackFor !== card.id) setFeedback(null, '');
  const concept = escapeHtml(card.id || '');
  const choices = (card.options || []).map((option, index) => `<button class="answer" type="button" data-concept="${concept}" data-choice="${index}">${escapeHtml(option)}</button>`).join('');
  const snooze = card.id ? `<button class="text-button" id="snoozeLesson" type="button" data-concept="${concept}">not now · 10 min</button>` : '';
  if (patchHtml($('answers'), `${choices}${snooze}`)) {
    document.querySelectorAll('#answers .answer').forEach((button) => button.addEventListener('click', () => submitAnswer(card.id, Number(button.dataset.choice))));
    $('snoozeLesson')?.addEventListener('click', () => snoozeLesson(card.id, 10));
  }
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
  patchHtml($('featureMemory'), memory.length ? memory.map((item) => {
    const story = (item.story || []).slice(0, 4).map((step) => escapeHtml(step.label)).join(' → ');
    const surfaces = [...(item.surfaces?.technologies || []).slice(0, 2), ...(item.surfaces?.routes || []).slice(0, 1), ...(item.surfaces?.tables || []).slice(0, 1)];
    const status = item.needsRefresh ? '<span class="refresh-badge">refresh</span>' : `<span>${item.checks > 0 ? `${item.confidence || 0}% fluent` : 'not assessed'}</span>`;
    const drift = item.needsRefresh && item.drift?.summary ? `<div class="memory-drift">${escapeHtml(item.drift.summary)}</div>` : '';
    return `<article class="memory-card ${item.needsRefresh ? 'needs-refresh' : ''}"><div class="memory-top"><strong>${escapeHtml(item.task || 'Previous feature')}</strong>${status}</div><p>${story || 'Feature structure captured from a completed task.'}</p>${drift}<div class="memory-tags">${surfaces.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>${item.checks > 0 ? meter('memory-meter', item.confidence || 0, `${item.confidence || 0}% fluent`) : ''}</article>`;
  }).join('') : '<p class="empty">Completed feature tasks will accumulate here and become spaced-review material.</p>');
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
    patchHtml($('featureStory'), '<p class="empty">No connected feature structure observed yet.</p>');
    patchHtml($('featureSurfaces'), '');
    patchHtml($('featureRiskNotes'), '');
    $('featureExplainBack').className = 'explain-back hidden';
    $('featureChallenge').className = 'challenge feature-challenge hidden';
    return;
  }

  $('featureModelStatus').textContent = `bounded static · ${model.generatedFrom?.filesInspected || 0} files`;
  $('currentFeatureFluency').textContent = Number(model.fluency?.checks) > 0 ? `${model.fluency?.confidence || 0}%` : 'Not assessed';
  $('featureDisclaimer').textContent = model.disclaimer || 'This is a bounded static map, not a proven runtime trace.';

  if (model.drift?.changed) {
    $('featureDrift').className = `drift-banner ${escapeHtml(model.drift.level || 'minor')}`;
    patchHtml($('featureDrift'), `<div><span>${model.drift.preview ? 'LIVE MENTAL MODEL DRIFT' : 'MENTAL MODEL DRIFT'} · ${escapeHtml((model.drift.level || 'changed').toUpperCase())}</span><strong>${escapeHtml(model.drift.summary || 'Feature structure changed.')}</strong></div><div class="drift-tokens">${driftDetails(model.drift)}</div>`);
  } else {
    $('featureDrift').className = 'drift-banner hidden';
    patchHtml($('featureDrift'), '');
  }

  const story = model.story || [];
  patchHtml($('featureStory'), story.length ? story.map((step, index) => storyStep(step, index === story.length - 1 ? -1 : index)).join('') : '<p class="empty">IdleProof sees code, but not enough connected structure to tell a useful feature story yet.</p>');
  const surfaces = [
    ...(model.surfaces?.routes || []).slice(0, 4).map((v) => ['route', v]),
    ...(model.surfaces?.technologies || []).slice(0, 4).map((v) => ['external', v]),
    ...(model.surfaces?.tables || []).slice(0, 4).map((v) => ['data', v]),
    ...(model.tests || []).slice(0, 3).map((v) => ['test', v])
  ];
  patchHtml($('featureSurfaces'), surfaces.map(([type, value]) => surfaceChip(type, value)).join(''));
  patchHtml($('featureRiskNotes'), (model.riskNotes || []).map((note) => `<p>↳ ${escapeHtml(note)}</p>`).join(''));

  if (model.explainBack) {
    $('featureExplainBack').className = 'explain-back';
    patchHtml($('featureExplainBack'), `<span>60-second explain-back</span><p>${escapeHtml(model.explainBack)}</p>`);
  } else $('featureExplainBack').className = 'explain-back hidden';

  if (model.challenge) {
    $('featureChallenge').className = 'challenge feature-challenge';
    $('featureQuestion').textContent = model.challenge.question;
    if ((!featureFeedbackLock || featureFeedbackLock !== model.fingerprint) && featureFeedbackFor !== model.fingerprint) setFeatureFeedback(null, '');
    const fingerprint = escapeHtml(model.fingerprint || '');
    if (patchHtml($('featureAnswers'), (model.challenge.options || []).map((option, index) => `<button class="answer feature-answer" type="button" data-fingerprint="${fingerprint}" data-choice="${index}">${escapeHtml(option)}</button>`).join(''))) {
      document.querySelectorAll('.feature-answer').forEach((button) => button.addEventListener('click', () => submitFeatureAnswer(model.fingerprint, Number(button.dataset.choice))));
    }
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
  patchHtml($('impactFeatures'), impact.otherFeatures?.length ? impact.otherFeatures.slice(0, 6).map((item) => {
    const shared = (item.sharedFiles || []).map((entry) => `${entry.role} · ${entry.file}`).join(' · ');
    const status = item.needsRefresh || item.confidence < 60 ? 'review recommended' : `${item.confidence}% fluent`;
    return `<article class="impact-card ${item.needsRefresh || item.confidence < 60 ? 'weak' : ''}"><div><strong>${escapeHtml(item.task)}</strong><span>${escapeHtml(status)}</span></div><p>shared through ${escapeHtml(shared)}</p></article>`;
  }).join('') : '<p class="empty">No other tracked feature currently shares the files touched by this task.</p>');

  const hotspots = model.topology?.hotspots || [];
  const queue = model.reviewQueue || [];
  $('projectModelStats').textContent = `${hotspots.length} hotspot${hotspots.length === 1 ? '' : 's'} · ${model.stats?.pendingFeatureReviews || 0} review`;
  patchHtml($('projectHotspots'), hotspots.length ? hotspots.slice(0, 7).map((item) => `<div class="compact-row"><div><strong>${escapeHtml(item.file)}</strong><span>${escapeHtml(item.role)} · ${item.featureCount} features</span></div><b>${recallText(item.averageFluency, state.metrics?.featuresChecked)}</b></div>`).join('') : '<p class="empty">Hotspots emerge when multiple tracked features share code.</p>');
  patchHtml($('featureReviewQueue'), queue.length ? queue.slice(0, 7).map((item) => `<div class="compact-row ${item.needsRefresh ? 'refresh-row' : ''}"><div><strong>${escapeHtml(item.task)}</strong><span>${escapeHtml(item.reason)}</span></div><b>${recallText(item.confidence, state.metrics?.featuresChecked)}</b></div>`).join('') : '<p class="empty">Feature reviews appear as your project memory grows.</p>');
}

// An ask/deny rule that a local approval let through once: the rule fired, the action was allowed.
const approvedOnce = (policy) => ['allow', 'observe'].includes(policy?.decision) && ['ask', 'deny'].includes(policy?.originalDecision);

function eventClass(policy) {
  if (approvedOnce(policy)) return 'approved';
  const decision = policy?.originalDecision || policy?.decision;
  if (decision === 'deny') return 'deny';
  if (decision === 'ask') return 'ask';
  if ((policy?.risk || 0) >= 50) return 'risk';
  return '';
}

function renderTimeline(control) {
  const rows = [...(control.recentEvents || [])].reverse();
  patchHtml($('timeline'), rows.length ? rows.slice(0, 18).map((record) => {
    const e = record.event || {}; const p = e.policy;
    const decision = p ? (approvedOnce(p) ? 'approved' : p.originalDecision || p.decision || 'allow') : '';
    return `<div class="trace-row ${eventClass(p)}"><span class="trace-seq">#${record.sequence}</span><div class="trace-main"><strong>${escapeHtml(e.eventType || 'event')}${e.tool ? ` · ${escapeHtml(e.tool)}` : ''}</strong><span>${escapeHtml(e.source || 'agent')}${e.resource ? ` · ${escapeHtml(e.resource)}` : ''}${e.mcp?.server ? ` · MCP ${escapeHtml(e.mcp.server)}` : ''}</span></div><div class="trace-side">${p ? `<span class="decision ${escapeHtml(decision)}">${escapeHtml(decision.toUpperCase())}</span><small>risk ${p.risk || 0}</small>` : '<small>observed</small>'}</div></div>`;
  }).join('') : '<p class="empty">Agent activity appears here so each lesson can be grounded in what is actually happening.</p>');
}

function stateIsFresh() {
  return document.body.dataset.connection === 'live' && lastStateAt !== null
    && Date.now() - lastStateAt.getTime() <= STATE_MAX_AGE_MS;
}

function requireFreshState() {
  if (stateIsFresh()) return true;
  if (document.body.dataset.connection === 'live') markChecking();
  void poll();
  return false;
}

function approvalNote(outcome) {
  if (approvalBusy || !outcome) return '';
  if (outcome.status === 'confirmed') return 'Approval recorded for one use within 10 minutes. Ask the agent to retry the action.';
  if (outcome.status === 'refused') return `IdleProof Local refused the approval: ${outcome.message}`;
  return 'The approval request got no confirmed answer, so it may or may not have been recorded. Approving again replaces it and never adds uses.';
}

function syncCommitControls() {
  const fresh = stateIsFresh();
  const accept = $('acceptResponsibility');
  accept.disabled = !fresh || !acceptAllowed || acceptanceBusy;
  if (!acceptanceBusy && !acceptMessage) accept.textContent = acceptLabel;
  const approve = $('approveAction');
  if (approve) {
    // Only the outcome for this exact decision event is shown; a new event starts clean.
    const outcome = approvalOutcome && approvalOutcome.key === approvalKey ? approvalOutcome : null;
    approve.disabled = !fresh || approvalBusy || !approvalFingerprint || outcome?.status === 'confirmed';
    approve.textContent = approvalBusy ? 'confirming approval…' : outcome?.status === 'confirmed' ? 'approved once' : 'approve once';
    const note = $('approvalNote'); if (note) note.textContent = approvalNote(outcome);
  }
  for (const button of document.querySelectorAll('#answers button')) button.disabled = !fresh || Boolean(feedbackLock);
  for (const button of document.querySelectorAll('.feature-answer')) button.disabled = !fresh || Boolean(featureFeedbackLock);
}

async function approveCurrentAction(event) {
  const button = event.currentTarget;
  if (!requireFreshState() || approvalBusy || button.disabled || button.dataset.fingerprint !== approvalFingerprint) return;
  const fingerprint = approvalFingerprint; const key = approvalKey;
  approvalBusy = true; syncCommitControls();
  try {
    await commitRequest('/api/approve', { fingerprint, uses:1, minutes:10 });
    approvalOutcome = { key, status: 'confirmed' };
  } catch (error) {
    // No answer, or a timeout, does not tell whether the approval was recorded. It is never retried automatically.
    approvalOutcome = { key, status: error?.status ? 'refused' : 'unconfirmed', message: error?.message || '' };
  } finally {
    // Keep the action locked until a read that starts after the mutation has settled.
    await refreshAfterAction();
    approvalBusy = false; syncCommitControls();
  }
}

function renderDecision(control) {
  const latest = control.latestDecision; const banner = $('decisionBanner');
  const original = latest?.originalDecision || latest?.decision;
  if (latest && approvedOnce(latest)) {
    approvalFingerprint = null; approvalKey = null;
    banner.className = 'decision-banner approved';
    patchHtml(banner, `<div><strong>ALLOWED ONCE BY YOUR APPROVAL · ${escapeHtml(String(original).toUpperCase())} RULE · risk ${latest.risk || 0}</strong><span>${escapeHtml(latest.reason || 'Allowed by a local approval.')}</span></div>`);
    return;
  }
  if (!latest || !['ask', 'deny'].includes(original)) {
    approvalFingerprint = null; approvalKey = null;
    banner.className = 'decision-banner hidden'; patchHtml(banner, ''); return;
  }
  banner.className = `decision-banner ${original}`;
  const canApprove = Boolean(latest.approvalFingerprint);
  const record = [...(control.recentEvents || [])].reverse().find((item) => item.event?.policy);
  approvalFingerprint = canApprove ? latest.approvalFingerprint : null;
  approvalKey = canApprove ? `${latest.approvalFingerprint}:${record?.hash ?? record?.sequence ?? ''}` : null;
  const updated = patchHtml(banner, `<div><strong>${escapeHtml(original.toUpperCase())} · risk ${latest.risk || 0}</strong><span>${escapeHtml(latest.reason || 'IdleProof paused a risky agent action.')}</span><span id="approvalNote" class="approval-note" role="status"></span></div>${canApprove ? `<button id="approveAction" type="button" disabled data-fingerprint="${escapeHtml(latest.approvalFingerprint)}">approve once</button>` : ''}`);
  if (updated) $('approveAction')?.addEventListener('click', approveCurrentAction);
}

function renderControlPlane(state) {
  const control = state.controlPlane || {};
  $('runtimeRisk').textContent = control.recentEvents?.length ? control.runtimeRisk || 0 : 'Not assessed';
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
  acceptLabel = acceptAllowed && responsibility.acceptances?.length ? 'accepted · accept again' : 'accept current change';
  renderDecision(control); renderTimeline(control);
  syncCommitControls();
}

// One label per native Stop status. Only `accepted` is a Proof, and only when Core's change
// envelope bound its certificate to this exact change.
const NATIVE_STOP_LABELS = {
  accepted:'Proof accepted', blocked:'Proof not accepted', inconclusive:'Proof inconclusive',
  terminal:'Proof stopped · needs a person', unavailable:'DiffWitness unavailable · not verified',
  pending:'Proof checking', 'no-change':'No change to prove', 'not-required':'No production code to prove',
  'not-configured':'Proof not configured', unverified:'Proof not confirmed'
};
const NATIVE_STOP_HEADLINES = {
  accepted:'DiffWitness accepted this change.<br><em>Review the exact evidence.</em>',
  blocked:'The coding turn ended.<br><em>Proof was not accepted.</em>',
  inconclusive:'The coding turn ended.<br><em>Proof was not accepted: the evidence is inconclusive.</em>',
  terminal:'The coding turn ended.<br><em>Proof was not accepted: a person must step in.</em>',
  unavailable:'The coding turn ended.<br><em>DiffWitness could not check it: not verified.</em>',
  pending:'The coding turn ended.<br><em>Proof is still being checked.</em>',
  'no-change':'The coding turn ended.<br><em>No repository change to prove.</em>',
  'not-required':'The coding turn ended.<br><em>No production code changed: no Proof required.</em>',
  unverified:'The coding turn ended.<br><em>Verification is not confirmed.</em>'
};
const NATIVE_STOP_REASONS = {
  'test-runner-unavailable':'the evidence command could not start its test runner (environment problem, not a test failure)',
  'evidence-command-unavailable':'the evidence command could not start (environment problem, not a test failure)',
  'stable-fail':'the evidence command fails on the candidate (stable-fail)', flaky:'the evidence is flaky', timeout:'the evidence timed out',
  inconclusive:'the evidence is inconclusive', 'debt-budget':'the Debt Ledger budget rejected the change',
  'no-evidence-command':'no evidence command is configured', 'not-armed':'DiffWitness was not armed when the task started',
  'change-identity-unavailable':'the accepted Proof could not be bound to this exact change',
  'change-identity-mismatch':'the accepted Proof names another change',
  'proof-envelope-unavailable':'the accepted Proof could not be bound to this exact change',
  'proof-not-accepted-in-envelope':'Core did not record an accepted Proof for this change',
  'certificate-mismatch':"the certificate does not match Core's record for this change",
  'proof-not-accepted':'see the IDE handoff'
};

function render(state) {
  const session = state.session; const active = session?.status === 'active'; const complete = session?.status === 'complete';
  const agentName = session?.source === 'codex' ? 'Codex' : session?.source === 'claude' ? 'Claude Code' : session?.source ? session.source : 'Agent';
  // Observing a diff or finishing an IDE turn never establishes a DiffWitness Proof.
  // Historical/unknown/mismatched Stop results are deliberately not upgraded to VERIFIED.
  const nativeStop = complete && session?.nativeStop && session.nativeStop.changeId === (session.proof?.changeId || null) ? session.nativeStop : null;
  const proven = nativeStop?.status === 'accepted' && /^dw[a-z0-9]{0,4}_[a-f0-9]{8,64}$/.test(String(nativeStop.certificateId || '')) &&
    /^dwchg_[a-f0-9]{24}$/.test(String(nativeStop.changeId || '')) && nativeStop.binding === 'core-change-envelope';
  const stopState = proven ? 'accepted' : nativeStop?.status === 'accepted' ? 'unverified' : nativeStop?.status || 'unverified';
  const proofLabel = NATIVE_STOP_LABELS[stopState] || NATIVE_STOP_LABELS.unverified;
  const stopReason = NATIVE_STOP_REASONS[nativeStop?.reasonCode] || (nativeStop?.reasonCode ? String(nativeStop.reasonCode) : 'see the IDE handoff');
  const earlierRefusals = proven && nativeStop.earlierNotAccepted > 0 ? ` · ${nativeStop.earlierNotAccepted} earlier Stop attempt(s) on this change not accepted` : '';
  const learning = state.learning || {};
  $('project').textContent = state.project; $('debt').textContent = state.metrics.conceptsChecked ? state.metrics.debt : 'Not assessed'; $('coverage').textContent = state.metrics.conceptsChecked ? `${state.metrics.coverage}%` : 'Not assessed';
  $('coverage').nextElementSibling.textContent = `${state.metrics.conceptsChecked||0} checked / ${state.metrics.conceptsSeen||0} observed concepts`;
  document.body.classList.toggle('completed', complete); $('statusDot').classList.toggle('active', active);
  $('status').textContent = active ? `${agentName} working · ${learning.paused ? 'learning snoozed' : 'live lesson ready'}` : complete ? `${agentName} turn complete · ${proofLabel}` : 'Waiting for a coding agent';
  $('window').textContent = active ? `≈ ${session.estimatedWindow || 20} sec learning window` : complete ? 'handoff review · ' + proofLabel.toLowerCase() : 'no learning window';
  $('currentTool').textContent = complete ? (proven ? `Native Proof accepted · ${nativeStop.certificateId}${earlierRefusals}` :
    ['blocked', 'terminal', 'inconclusive', 'unavailable'].includes(stopState) ? `${proofLabel} · ${stopReason}` :
    stopState === 'pending' ? 'Native Proof is being checked' : 'Coding turn finished · verification not confirmed') : (session?.currentTool || 'No active tool');
  $('headline').innerHTML = active ? 'Your agent is building.<br><em>Keep the mental model.</em>' : complete ? NATIVE_STOP_HEADLINES[stopState] || NATIVE_STOP_HEADLINES.unverified : 'Vibe code fast.<br><em>Stay fluent in your own product.</em>';
  $('task').textContent = session?.prompt || 'Run `idleproof on`, then use Claude Code or Codex normally. IdleProof turns live agent work into task-specific learning and feature understanding.';
  if (active && learning.file) $('currentTool').textContent = `${session.currentTool || 'Working'} · ${learning.file}`;
  renderControlPlane(state);
  // Feedback may pause its own card, never the rest of the live state or safety controls.
  if (!feedbackLock) renderLearning(state);
  if (!featureFeedbackLock) renderFeatureModel(state);
  renderProjectModel(state); renderFiles(session); renderFindings(session); renderLedger(state.ledger); $('proofId').textContent = proven ? nativeStop.certificateId : 'not verified';
  markAssessed('runtimeRisk', 'featureFluency', 'debt', 'coverage', 'currentFeatureFluency', 'responsibilityCoverage', 'policyProfile', 'agentCount');
}

// A refusal is an answer from IdleProof Local; no answer leaves the outcome unknown.
function actionFailure(what, error) {
  return error?.status ? `Could not record ${what}: ${error.message}` : `The ${what} was not confirmed: IdleProof Local did not answer. Check the result once it reconnects.`;
}

async function submitAnswer(conceptId, choice) {
  if (!requireFreshState() || feedbackLock) return;
  try {
    feedbackLock = conceptId; syncCommitControls(); const result = await commitRequest('/api/answer', { conceptId, choice });
    forgetHtml($('answers'));
    [...document.querySelectorAll('#answers .answer')].forEach((button, index) => { button.disabled = true; if (index === result.answer) button.classList.add('correct'); else if (index === choice) button.classList.add('wrong'); });
    setFeedback(conceptId, result.correct ? `Correct. ${result.review}` : `Not quite. ${result.review}`);
    setTimeout(() => { feedbackLock = null; void refreshAfterAction(); }, 1700);
  } catch (error) { feedbackLock = null; setFeedback(conceptId, actionFailure('answer', error)); void refreshAfterAction(); }
}

async function submitFeatureAnswer(fingerprint, choice) {
  if (!requireFreshState() || featureFeedbackLock) return;
  try {
    featureFeedbackLock = fingerprint; syncCommitControls(); const result = await commitRequest('/api/feature-answer', { fingerprint, choice });
    forgetHtml($('featureAnswers'));
    [...document.querySelectorAll('.feature-answer')].forEach((button, index) => { button.disabled = true; if (index === result.answer) button.classList.add('correct'); else if (index === choice) button.classList.add('wrong'); });
    setFeatureFeedback(fingerprint, `${result.correct ? 'Correct.' : 'Not quite.'} ${result.explanation}`);
    setTimeout(() => { featureFeedbackLock = null; void refreshAfterAction(); }, 2200);
  } catch (error) { featureFeedbackLock = null; setFeatureFeedback(fingerprint, actionFailure('feature check', error)); void refreshAfterAction(); }
}

async function snoozeLesson(conceptId, minutes = 10) {
  if (!conceptId || !requireFreshState() || feedbackLock) return;
  try { feedbackLock = conceptId; syncCommitControls(); await commitRequest('/api/snooze', { conceptId, minutes }); feedbackLock = null; await refreshAfterAction(); }
  catch (error) { feedbackLock = null; setFeedback(conceptId, actionFailure(minutes ? 'pause' : 'resume', error)); void refreshAfterAction(); }
}

function markConnected() {
  clearTimeout(checkingTimer);
  lastStateAt = new Date();
  document.body.dataset.connection = 'live';
  const banner = $('connectionBanner'); if (banner) { banner.hidden = true; banner.textContent = ''; }
  syncCommitControls();
}

// Data older than the freshness window (for example after a background tab) is re-read before
// any action. The banner only appears if that read is slow, so a normal return does not flicker.
function markChecking() {
  document.body.dataset.connection = 'checking';
  syncCommitControls();
  clearTimeout(checkingTimer);
  checkingTimer = setTimeout(() => {
    if (document.body.dataset.connection !== 'checking') return;
    const banner = $('connectionBanner');
    if (banner) { banner.hidden = false; banner.textContent = `Updating live-task data. The last update was at ${lastStateAt.toLocaleString()}; actions are paused until it is current.`; }
  }, CHECKING_BANNER_DELAY_MS);
}

// A failed refresh must not leave earlier values looking current, nor leave engaging actions available.
// The wording says what actually happened: no answer, an HTTP error, or a state the page could not read.
function markDisconnected(error) {
  clearTimeout(checkingTimer);
  const what = error?.status ? `returned an error (HTTP ${error.status})` : error?.unreadable ? 'returned a state this page could not read' : 'is not responding';
  $('status').textContent = error?.status || error?.unreadable ? 'IdleProof state unavailable' : 'IdleProof disconnected';
  $('integrityChip').textContent = error?.status || error?.unreadable ? 'state unavailable' : 'offline'; $('integrityChip').className = 'chip chip-bad';
  document.body.dataset.connection = lastStateAt ? 'stale' : 'offline';
  const banner = $('connectionBanner');
  if (banner) {
    banner.hidden = false;
    banner.textContent = lastStateAt
      ? `IdleProof Local ${what}. Live-task data is from the last update at ${lastStateAt.toLocaleString()} and may be out of date. The project scan has its own captured snapshot.`
      : `IdleProof Local ${what}. No project state has been loaded yet.`;
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
        throw Object.assign(new Error('Local state is unreadable'), { unreadable: true });
      }
      try { render(state); } catch (error) { throw Object.assign(error, { unreadable: true }); }
      // Only a successfully rendered state is evidence of an update, not merely received headers.
      markConnected();
    } catch (error) { markDisconnected(error); }
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
  const sequence = ++acceptanceSequence;
  acceptanceBusy = true; acceptMessage = 'binding acceptance…'; button.textContent = acceptMessage; syncCommitControls();
  try {
    const result = await commitRequest('/api/responsibility/accept', {});
    acceptMessage = `accepted · ${result.responsibility.responsibilityCoverage}% covered`;
  } catch (error) {
    // Without an answer the acceptance may or may not be recorded; the refreshed coverage tells which.
    acceptMessage = error?.status ? 'acceptance refused' : 'acceptance not confirmed';
  } finally {
    button.textContent = acceptMessage;
    await refreshAfterAction();
    acceptanceBusy = false; syncCommitControls();
    setTimeout(() => {
      if (sequence !== acceptanceSequence || acceptanceBusy) return;
      acceptMessage = null; syncCommitControls();
    }, 1800);
  }
});

// Browser timers may be suspended in background tabs. Recheck age before showing controls again.
if (typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!stateIsFresh() && document.body.dataset.connection === 'live') markChecking();
    void poll();
  });
}

poll();
setInterval(poll, 1500);
