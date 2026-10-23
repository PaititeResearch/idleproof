import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createServer } from '../src/server.mjs';
import { seedDemo } from '../src/hook.mjs';

// Executes the shipped Local controller (public/app.js) with a minimal DOM and a controllable
// /api/state. Presentation behaviour only; no browser or HUMAN qualification is implied.
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

function element(id) {
  const classes = new Set();
  let text = '';
  return {
    // Like the DOM, textContent always stores a string.
    get textContent() { return text; }, set textContent(value) { text = String(value); },
    id, innerHTML: '', className: '', disabled: false, hidden: false, dataset: {}, listeners: {},
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, add(name) { classes.add(name); }, contains: (name) => classes.has(name) },
    nextElementSibling: { textContent: '' },
    addEventListener(name, fn) { this.listeners[name] = fn; }
  };
}

function harness(responses) {
  const elements = new Map();
  const get = (id) => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  get('acceptResponsibility').disabled = /id="acceptResponsibility"[^>]*\bdisabled\b/.test(html);
  const body = element('body');
  const context = {
    document: { getElementById: get, querySelectorAll: () => [], body },
    navigator: {}, setInterval() {}, setTimeout, clearTimeout, AbortController, Date,
    fetch: async () => {
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { ok: true, json: async () => structuredClone(next) };
    }
  };
  vm.runInNewContext(appSource, context);
  return { get, body, context, settle: () => new Promise((resolve) => setTimeout(resolve, 20)) };
}

async function demoState() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'idleproof-ui-state-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd });
    seedDemo(cwd);
    const started = await createServer({ cwd, port: 0 });
    try { return await (await fetch(`${started.url}/api/state`)).json(); }
    finally { await new Promise((resolve) => started.server.close(resolve)); }
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

test('before any state arrives, the page shows no measurement, no verified trace and no acceptance', () => {
  assert.match(html, /id="acceptResponsibility"[^>]*\bdisabled\b/);
  for (const id of ['runtimeRisk', 'featureFluency', 'debt', 'coverage', 'currentFeatureFluency', 'responsibilityCoverage', 'policyProfile', 'agentCount']) {
    const text = html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))?.[1] ?? '';
    assert.equal(text, 'Not loaded', id);
  }
  const chip = html.match(/<span id="integrityChip" class="([^"]*)">([^<]*)</);
  assert.ok(chip);
  assert.doesNotMatch(chip[2], /verified/i);
  assert.doesNotMatch(chip[1], /chip-ok/);
  assert.match(html, /id="connectionBanner"[^>]*\bhidden\b/);
});

test('a first failed state request says nothing was loaded and keeps acceptance disabled', async () => {
  const ui = harness([new Error('offline')]);
  await ui.settle();
  assert.equal(ui.body.dataset.connection, 'offline');
  assert.equal(ui.get('connectionBanner').hidden, false);
  assert.match(ui.get('connectionBanner').textContent, /No project state has been loaded/);
  assert.equal(ui.get('acceptResponsibility').disabled, true);
});

test('a failed refresh marks earlier values as out of date and disables engaging actions', async () => {
  const state = await demoState();
  state.session = { ...(state.session || {}), status: 'complete' };
  const ui = harness([state, new Error('offline'), state]);
  await ui.settle();
  assert.equal(ui.body.dataset.connection, 'live');
  assert.equal(ui.get('connectionBanner').hidden, true);
  assert.equal(ui.get('acceptResponsibility').disabled, false);

  await ui.context.poll();
  assert.equal(ui.body.dataset.connection, 'stale');
  assert.equal(ui.get('connectionBanner').hidden, false);
  assert.match(ui.get('connectionBanner').textContent, /last update at .+ may be out of date/);
  assert.equal(ui.get('acceptResponsibility').disabled, true);
  assert.equal(ui.get('approveAction').disabled, true);

  await ui.context.poll();
  assert.equal(ui.body.dataset.connection, 'live');
  assert.equal(ui.get('connectionBanner').hidden, true);
});

test('acceptance stays disabled while the loaded change is not complete', async () => {
  const state = await demoState();
  state.session = { ...(state.session || {}), status: 'active' };
  const ui = harness([state]);
  await ui.settle();
  assert.equal(ui.get('acceptResponsibility').disabled, true);
});

test('a feature or concept that was never checked is not shown as 0%', async () => {
  const base = await demoState();
  const unchecked = structuredClone(base);
  unchecked.featureModel = { ...(unchecked.featureModel || {}), fluency: { confidence: 0, checks: 0 } };
  unchecked.metrics = { ...unchecked.metrics, featuresChecked: 0, conceptsChecked: 0 };
  unchecked.projectModel = { ...(unchecked.projectModel || {}),
    topology: { hotspots: [{ file: 'src/a.ts', role: 'service', featureCount: 2, averageFluency: 0 }] },
    reviewQueue: [{ task: 'Feature A', reason: 'low demonstrated feature fluency', confidence: 0 }] };
  let ui = harness([unchecked]);
  await ui.settle();
  assert.equal(ui.get('currentFeatureFluency').textContent, 'Not assessed');
  assert.doesNotMatch(ui.get('projectHotspots').innerHTML, /<b>0%<\/b>/);
  assert.match(ui.get('projectHotspots').innerHTML, /not assessed/);
  assert.match(ui.get('featureReviewQueue').innerHTML, /not assessed/);

  // A check elsewhere does not tell us whether this hotspot's features were ever checked.
  const checkedElsewhere = structuredClone(unchecked);
  checkedElsewhere.metrics.featuresChecked = 1;
  ui = harness([checkedElsewhere]);
  await ui.settle();
  assert.match(ui.get('projectHotspots').innerHTML, /assessment unavailable/);
  assert.doesNotMatch(ui.get('projectHotspots').innerHTML, /no correct check yet/);

  const checked = structuredClone(unchecked);
  checked.featureModel.fluency = { confidence: 0, checks: 2 };
  checked.metrics.featuresChecked = 1;
  checked.projectModel.topology.hotspots[0].averageFluency = 40;
  ui = harness([checked]);
  await ui.settle();
  assert.equal(ui.get('currentFeatureFluency').textContent, '0%');
  assert.match(ui.get('projectHotspots').innerHTML, /<b>40%<\/b>/);
});

test('text colours meet WCAG AA and --faint is never used for text', () => {
  const tokens = (source) => Object.fromEntries([...source.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const light = tokens(css.match(/:root\{([\s\S]*?)\n\}/)[1]);
  const dark = { ...light, ...tokens(css.match(/prefers-color-scheme:dark\)\{\s*:root\{([\s\S]*?)\}/)[1]) };
  const hex = (v) => v.length === 4 ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : v;
  const parse = (v) => v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(hex(v).slice(i, i + 2), 16)).concat(1) : v.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number).concat(1).slice(0, 4);
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs = [...['ink', 'ink-2', 'muted'].flatMap((t) => ['canvas', 'surface', 'surface-2', 'sunken'].map((bg) => [t, bg])),
    ['ok', 'ok-soft'], ['warn', 'warn-soft'], ['bad', 'bad-soft'], ['ip-ink', 'ip-soft'], ['dw-ink', 'dw-soft'], ['on-accent', 'ip']];
  for (const [name, theme] of [['light', light], ['dark', dark]]) {
    const surface = parse(theme.surface);
    for (const [text, background] of pairs) {
      const bg = over(parse(theme[background]), surface);
      assert.ok(ratio(over(parse(theme[text]), bg), bg) >= 4.5, `${name}: ${text} on ${background}`);
    }
  }
  assert.doesNotMatch(css, /(^|[^-\w])color:var\(--faint\)/);
});

test('a completed coding turn never implies native Proof acceptance', async () => {
  const original = await demoState();
  const changeId = 'dwchg_' + 'a'.repeat(24);
  const base = { ...original,
    session: { ...(original.session || {}), source:'codex', status:'complete',
      proof: { changeId, diffSha256:'c'.repeat(64) } } };

  for (const [status, expected] of [
    ['blocked', /Proof was not accepted/],
    ['terminal', /Proof was not accepted/],
    ['unavailable', /Proof was not accepted/],
    ['pending', /Proof is still being checked/],
    ['unverified', /Verification is not confirmed/],
    ['no-change', /Verification is not confirmed/],
    ['not-configured', /Verification is not confirmed/]
  ]) {
    const state = structuredClone(base);
    state.session.nativeStop = { status, changeId, reasonCode:'stable-fail' };
    const ui = harness([state]);
    await ui.settle();
    assert.match(ui.get('headline').innerHTML, expected, status);
    assert.equal(ui.get('proofId').textContent, 'not verified', status);
    assert.doesNotMatch(ui.get('status').textContent, /Proof accepted/, status);
  }

  // Older cached states and a native Stop for a foreign exact change cannot be treated as verified.
  for (const nativeStop of [null, {
    status:'accepted', changeId:'dwchg_' + 'b'.repeat(24), certificateId:'dw2_abcdef123456'
  }]) {
    const state = structuredClone(base);
    state.session.nativeStop = nativeStop;
    const ui = harness([state]);
    await ui.settle();
    assert.match(ui.get('headline').innerHTML, /Verification is not confirmed/);
    assert.equal(ui.get('proofId').textContent, 'not verified');
  }

  const verified = structuredClone(base);
  verified.session.nativeStop = {
    status:'accepted', changeId, certificateId:'dw2_abcdef123456'
  };
  const ui = harness([verified]);
  await ui.settle();
  assert.match(ui.get('headline').innerHTML, /DiffWitness accepted this change/);
  assert.match(ui.get('status').textContent, /Proof accepted/);
  assert.equal(ui.get('proofId').textContent, 'dw2_abcdef123456');
});
