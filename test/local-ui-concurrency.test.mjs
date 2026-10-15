import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Runs the shipped controller. Synthetic state and deterministic time, not a live Core,
// real provider, authenticated browser, or a substitute for the full acceptance recipe.
const source = fs.readFileSync(process.env.LOCAL_UI_SOURCE || new URL('../public/app.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function state(overrides = {}) {
  return { project: 'ui-fixture', session: { status: 'complete', prompt: 'Loaded task', source: 'codex' },
    metrics: { conceptsChecked: 0, conceptsSeen: 0, featuresChecked: 0, featuresSeen: 0 },
    controlPlane: { provenance: { valid: true }, policy: {}, recentEvents: [], responsibility: {} },
    learning: {}, projectModel: {}, ...overrides };
}
function harness(responses) {
  const elements = new Map(), requests = [], timers = new Map(), documentEvents = {};
  let clock = 1_800_000_000_000, timerId = 0;
  function get(id) {
    if (elements.has(id)) return elements.get(id);
    let text = '', html = ''; const classes = new Set();
    const el = { id, dataset: {}, hidden: false, disabled: id === 'acceptResponsibility', listeners: {}, className: '',
      get textContent() { return text; }, set textContent(value) { text = String(value); },
      get innerHTML() { return html; }, set innerHTML(value) {
        html = String(value);
        if (id === 'decisionBanner') {
          elements.delete('approveAction');
          const match = html.match(/<button id="approveAction"([^>]*)>([^<]*)/);
          if (match) { const button = get('approveAction'); button.disabled = /\bdisabled\b/.test(match[1]); button.dataset.fingerprint = match[1].match(/data-fingerprint="([^"]*)"/)?.[1]; button.textContent = match[2]; }
        }
      },
      classList: { add(name) { classes.add(name); }, toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
      nextElementSibling: { textContent: '' }, addEventListener(name, fn) { this.listeners[name] = fn; } };
    elements.set(id, el); return el;
  }
  const document = { getElementById: (id) => id === 'approveAction' && !elements.has(id) ? null : get(id),
    querySelectorAll: () => [], body: get('body'), visibilityState: 'visible', addEventListener(name, fn) { documentEvents[name] = fn; } };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ document, navigator: {}, Date: ClockDate, AbortController,
    setInterval() {}, setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, { at: clock + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (!responses.length) throw new Error(`No fixture response for ${url}`);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      const result = typeof next === 'function' ? await next(url, options) : await next;
      if (result?.json) return result;
      return { ok: true, json: async () => structuredClone(result) };
    } });
  vm.runInContext(source, context);
  async function advance(ms, runTimers = true) {
    clock += ms;
    if (runTimers) {
      for (;;) {
        const due = [...timers].find(([, timer]) => timer.at <= clock);
        if (!due) break;
        timers.delete(due[0]); due[1].fn(); await flush();
      }
    }
    await flush();
  }
  return { context, get, requests, responses, document, documentEvents, advance, settle: flush };
}

test('a hung first refresh becomes offline, without authorizing acceptance', async () => {
  const pending = deferred(); const ui = harness([pending.promise]); await ui.settle();
  await ui.advance(8001);
  assert.equal(ui.document.body.dataset.connection, 'offline');
  assert.equal(ui.get('acceptResponsibility').disabled, true);
  assert.match(ui.get('connectionBanner').textContent, /No project state has been loaded/);
});

test('a hung response body marks previously loaded values stale', async () => {
  const pending = deferred(); const ui = harness([state(), { ok: true, json: () => pending.promise }]); await ui.settle();
  const poll = ui.context.poll(); await ui.settle(); await ui.advance(8001);
  assert.equal(ui.document.body.dataset.connection, 'stale');
  await poll;
  assert.equal(ui.requests.at(-1).options.signal.aborted, true);
  assert.equal(ui.get('acceptResponsibility').disabled, true);
});

test('concurrent refresh requests are coalesced, not allowed to arrive out of order', async () => {
  const pending = deferred(); const ui = harness([pending.promise]); await ui.settle();
  const a = ui.context.poll(), b = ui.context.poll();
  assert.equal(a, b); assert.equal(ui.requests.length, 1);
  pending.resolve(state()); await a;
  assert.equal(ui.document.body.dataset.connection, 'live');
});

test('a timed-out response cannot overwrite a later successful refresh', async () => {
  const pending = deferred(); const ui = harness([pending.promise, state({ project: 'newer' })]); await ui.settle();
  await ui.advance(8001); await ui.context.poll();
  pending.resolve(state({ project: 'older' })); await ui.settle();
  assert.equal(ui.get('project').textContent, 'newer');
  assert.equal(ui.document.body.dataset.connection, 'live');
});

test('an invalid first state is not recorded as a successful update', async () => {
  const ui = harness([{}]); await ui.settle();
  assert.equal(ui.document.body.dataset.connection, 'offline');
  assert.match(ui.get('connectionBanner').textContent, /No project state has been loaded/);
});

test('polling never re-enables an acceptance while its POST is pending', async () => {
  const pending = deferred(); const ui = harness([state(), pending.promise, state(), state()]); await ui.settle();
  const action = ui.get('acceptResponsibility').listeners.click(); await ui.settle();
  await ui.context.poll();
  assert.equal(ui.get('acceptResponsibility').disabled, true);
  await ui.get('acceptResponsibility').listeners.click();
  assert.equal(ui.requests.filter((r) => r.url === '/api/responsibility/accept').length, 1);
  pending.resolve({ responsibility: { responsibilityCoverage: 100 } }); await action;
  assert.equal(ui.get('acceptResponsibility').disabled, false);
});

test('acceptance remains unavailable when its post-action refresh fails', async () => {
  const ui = harness([state(), { responsibility: { responsibilityCoverage: 100 } }, new Error('offline')]); await ui.settle();
  await ui.get('acceptResponsibility').listeners.click(); await ui.advance(1801);
  assert.equal(ui.document.body.dataset.connection, 'stale');
  assert.equal(ui.get('acceptResponsibility').disabled, true);
});

test('a late feedback timer cannot render an old completed state after disconnect', async () => {
  const old = state(); const ui = harness([old, { correct: true, answer: 0, review: 'Recorded', state: old }, new Error('offline'), new Error('offline')]); await ui.settle();
  await ui.context.submitAnswer('concept-a', 0); await ui.context.poll(); await ui.advance(1701);
  assert.equal(ui.document.body.dataset.connection, 'stale');
  assert.equal(ui.get('acceptResponsibility').disabled, true);
});

test('feedback does not freeze task or acceptance updates while a new task begins', async () => {
  const old = state(); const active = state({ session: { status: 'active', prompt: 'New task' } });
  const ui = harness([old, { correct: true, answer: 0, state: old }, active, active]); await ui.settle();
  await ui.context.submitAnswer('concept-a', 0); await ui.context.poll();
  assert.equal(ui.get('task').textContent, 'New task');
  assert.equal(ui.get('acceptResponsibility').disabled, true);
  await ui.advance(1701);
  assert.equal(ui.get('task').textContent, 'New task');
});

test('approval stays locked across DOM re-rendering while its POST is pending', async () => {
  const pending = deferred(); const snapshot = state();
  snapshot.controlPlane.latestDecision = { decision: 'ask', approvalFingerprint: 'fixture-fingerprint', risk: 50 };
  const ui = harness([snapshot, pending.promise, snapshot, snapshot]); await ui.settle();
  const original = ui.get('approveAction');
  const action = original.listeners.click({ currentTarget: original }); await ui.settle();
  await ui.context.poll();
  const replaced = ui.get('approveAction');
  assert.equal(replaced.disabled, true);
  await replaced.listeners.click({ currentTarget: replaced });
  assert.equal(ui.requests.filter((r) => r.url === '/api/approve').length, 1);
  pending.resolve({ ok: true }); await action;
});

test('expired data cannot authorize a click after background timers were suspended', async () => {
  const ui = harness([state()]); await ui.settle(); await ui.advance(10001, false);
  await ui.get('acceptResponsibility').listeners.click();
  assert.equal(ui.requests.filter((r) => r.options.method === 'POST').length, 0);
});

test('a globally checked project does not imply an unchecked item had a wrong answer', async () => {
  const snapshot = state({ metrics: { featuresChecked: 1, conceptsChecked: 1 },
    projectModel: { topology: { hotspots: [{ file: 'src/unchecked.js', averageFluency: 0, featureCount: 2 }] }, reviewQueue: [{ task: 'Unchecked', confidence: 0 }] } });
  const ui = harness([snapshot]); await ui.settle();
  assert.doesNotMatch(ui.get('projectHotspots').innerHTML, /no correct check yet/);
  assert.match(ui.get('projectHotspots').innerHTML, /assessment unavailable/);
  assert.match(ui.get('featureReviewQueue').innerHTML, /assessment unavailable/);
});

test('tracked feature overlap is not labelled human learning; literal paths stay unchanged', async () => {
  const snapshot = state({ projectModel: { impact: { summary: "This task's observed feature surface overlaps 1 other learned feature through docs/other learned feature.md.", otherFeatures: [] } } });
  const ui = harness([snapshot]); await ui.settle();
  assert.equal(ui.get('impactSummary').textContent, "This task's observed feature surface overlaps 1 other tracked feature through docs/other learned feature.md.");
  assert.doesNotMatch(ui.get('impactFeatures').innerHTML, /other learned/);
});

test('real zero from per-feature checks and positive scores remain visible', async () => {
  const snapshot = state({ featureModel: { fluency: { confidence: 0, checks: 2 } }, metrics: { featuresChecked: 1 },
    projectModel: { topology: { hotspots: [{ file: 'src/known.js', averageFluency: 40, featureCount: 2 }] } } });
  const ui = harness([snapshot]); await ui.settle();
  assert.equal(ui.get('currentFeatureFluency').textContent, '0%');
  assert.match(ui.get('projectHotspots').innerHTML, /<b>40%<\/b>/);
});

function blocked(hash) {
  const policy = { decision: 'deny', originalDecision: 'deny', approvalFingerprint: '0123456789abcdef', risk: 69, reason: 'Catastrophic delete.' };
  return state({ controlPlane: { provenance: { valid: true }, policy: {}, responsibility: {}, latestDecision: policy,
    recentEvents: [{ sequence: 5, hash, event: { eventType: 'PreToolUse', policy } }] } });
}

test('a confirmed approval is not offered again when the same decision is re-rendered', async () => {
  const ui = harness([blocked('h5'), { ok: true }, blocked('h5'), blocked('h5')]); await ui.settle();
  const button = ui.get('approveAction');
  await button.listeners.click({ currentTarget: button }); await ui.context.poll();
  assert.equal(ui.get('approveAction').textContent, 'approved once');
  assert.equal(ui.get('approveAction').disabled, true);
  assert.match(ui.get('approvalNote').textContent, /Ask the agent to retry/);
  assert.equal(ui.requests.filter((r) => r.url === '/api/approve').length, 1);
});

test('a new block of the same action starts with a fresh approve button', async () => {
  const ui = harness([blocked('h5'), { ok: true }, blocked('h5'), blocked('h7')]); await ui.settle();
  const button = ui.get('approveAction');
  await button.listeners.click({ currentTarget: button }); await ui.context.poll();
  assert.equal(ui.get('approveAction').textContent, 'approve once');
  assert.equal(ui.get('approveAction').disabled, false);
  assert.equal(ui.get('approvalNote').textContent, '');
});

test('an approval without an answer is uncertain, not refused, and is never resent', async () => {
  const ui = harness([blocked('h5'), new Error('connection reset'), blocked('h5')]); await ui.settle();
  const button = ui.get('approveAction');
  await button.listeners.click({ currentTarget: button });
  assert.match(ui.get('approvalNote').textContent, /may or may not have been recorded/);
  assert.equal(ui.document.body.dataset.connection, 'live');
  assert.equal(ui.requests.filter((r) => r.url === '/api/approve').length, 1);
});

test('an action allowed once by a local approval is not shown as blocked or approvable', async () => {
  const policy = { decision: 'allow', originalDecision: 'deny', approvalFingerprint: '0123456789abcdef', risk: 69, reason: 'Approved locally until 2026-10-15T10:00:00.000Z.' };
  const ui = harness([state({ controlPlane: { provenance: { valid: true }, policy: {}, responsibility: {}, latestDecision: policy, recentEvents: [{ sequence: 6, hash: 'h6', event: { policy } }] } })]); await ui.settle();
  assert.equal(ui.get('decisionBanner').className, 'decision-banner approved');
  assert.match(ui.get('decisionBanner').innerHTML, /ALLOWED ONCE BY YOUR APPROVAL · DENY RULE/);
  assert.equal(ui.document.getElementById('approveAction'), null);
  assert.match(ui.get('timeline').innerHTML, />APPROVED</);
});

test('an HTTP error or unreadable state is named, not reported as Local not responding', async () => {
  const ui = harness([state(), { ok: false, status: 500, json: async () => ({ error: 'internal' }) }, {}]); await ui.settle();
  await ui.context.poll();
  assert.match(ui.get('connectionBanner').textContent, /returned an error \(HTTP 500\)/);
  assert.equal(ui.get('integrityChip').textContent, 'state unavailable');
  await ui.context.poll();
  assert.match(ui.get('connectionBanner').textContent, /returned a state this page could not read/);
});

test('a refused action leaves the connection state to the next read', async () => {
  const ui = harness([state(), { ok: false, status: 500, json: async () => ({ error: 'No completed diff proof is available to accept.' }) }, state()]); await ui.settle();
  await ui.get('acceptResponsibility').listeners.click();
  assert.equal(ui.get('acceptResponsibility').textContent, 'acceptance refused');
  assert.equal(ui.document.body.dataset.connection, 'live');
});

test('an accepted change says so after the refresh instead of offering a first acceptance again', async () => {
  const accepted = state(); accepted.controlPlane.responsibility = { acceptances: [{ acceptedBy: 'me' }] };
  const ui = harness([state(), { responsibility: { responsibilityCoverage: 100 } }, accepted, accepted]); await ui.settle();
  await ui.get('acceptResponsibility').listeners.click(); await ui.advance(1801);
  assert.equal(ui.get('acceptResponsibility').textContent, 'accepted · accept again');
});

test('no recorded agent activity leaves runtime risk not assessed; a recorded zero stays zero', async () => {
  let ui = harness([state()]); await ui.settle();
  assert.equal(ui.get('runtimeRisk').textContent, 'Not assessed');
  const quiet = state(); quiet.controlPlane.recentEvents = [{ sequence: 1, hash: 'h1', event: { eventType: 'UserPromptSubmit' } }]; quiet.controlPlane.runtimeRisk = 0;
  ui = harness([quiet]); await ui.settle();
  assert.equal(ui.get('runtimeRisk').textContent, '0');
});

test('an unconfirmed answer stays reported after the refresh of the same card', async () => {
  const withCard = state({ session: { status: 'active', prompt: 'Task' }, card: { id: 'auth', question: 'Which?', options: ['a', 'b', 'c'] } });
  const ui = harness([withCard, new Error('connection reset'), withCard, withCard]); await ui.settle();
  await ui.context.submitAnswer('auth', 0); await ui.settle();
  assert.match(ui.get('feedback').textContent, /was not confirmed/);
  await ui.context.poll();
  assert.match(ui.get('feedback').textContent, /was not confirmed/);
  const next = structuredClone(withCard); next.card.id = 'sql';
  ui.responses.push(next); await ui.context.poll();
  assert.equal(ui.get('feedback').textContent, '');
});

test('a refused feature check keeps the server reason after the refresh of the same map', async () => {
  const withMap = state({ featureModel: { fingerprint: 'fp-1', generatedFrom: { filesInspected: 1 }, fluency: { checks: 0 }, challenge: { question: 'Where?', options: ['x', 'y'] } } });
  const refused = { ok: false, status: 409, json: async () => ({ error: 'Feature model changed; refresh before answering' }) };
  const ui = harness([withMap, refused, withMap, withMap]); await ui.settle();
  await ui.context.submitFeatureAnswer('fp-1', 0); await ui.settle(); await ui.context.poll();
  assert.match(ui.get('featureFeedback').textContent, /Could not record feature check: Feature model changed/);
  assert.equal(ui.document.body.dataset.connection, 'live');
});
