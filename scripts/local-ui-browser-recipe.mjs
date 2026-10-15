// MACHINE UI qualification of the IdleProof Local page in Chromium, never HUMAN.
//
// The real Local server serves the real page. Projects are produced only through the real hook path
// (processHookEvent) on temporary Git repositories; no state file is written by hand. Faults are
// injected at the browser network layer only (Playwright routes): held, aborted, failed, unreadable or
// late responses. Each check records PASS or FAIL; nothing is skipped.
//
// Env: PLAYWRIGHT_MODULE (playwright/index.mjs), RECIPE_OUT (evidence directory, optional).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createServer } from '../src/server.mjs';
import { processHookEvent } from '../src/hook.mjs';
import { projectPaths } from '../src/paths.mjs';

const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the qualified browser driver. No installation is attempted.');
const { chromium } = await import(pathToFileURL(path.resolve(modulePath)));
const out = path.resolve(process.env.RECIPE_OUT || 'e2e/test-results/local-ui');
fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });

const results = [];
const pageErrors = [];
function check(id, pass, detail = {}) {
  results.push({ check: id, status: pass ? 'PASS' : 'FAIL', ...(pass ? {} : { detail }) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}${pass ? '' : ` ${JSON.stringify(detail).slice(0, 1200)}`}`);
}
async function section(id, fn) {
  try { await fn(); } catch (error) { check(id, false, { error: String(error?.stack || error).slice(0, 1500) }); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanup = [];

// ---------- Real projects ----------
const LONG_PROMPT = 'Add Google OAuth login, persist sessions in Postgres, and add tests for protected routes — '
  + 'including refresh-token rotation, device-bound session revocation and an audit trail for every administrative sign-in';
const LONG_DIR = 'src/authentication/providers/google-workspace-enterprise/session-persistence';
function project({ deny = true, complete = true, events = true, long = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'idleproof-local-ui-'));
  cleanup.push(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 'qualification@example.invalid'); git('config', 'user.name', 'Qualification');
  const dir = long ? LONG_DIR : 'src/auth';
  const file = `${dir}/${long ? 'google-workspace-enterprise-session-persistence-adapter.ts' : 'session.ts'}`;
  fs.mkdirSync(path.join(cwd, dir), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), 'export const session = 1;\n'); git('add', '.'); git('commit', '-qm', 'init');
  const sessionId = `local-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const event = (e) => processHookEvent({ cwd, session_id: sessionId, ...e });
  if (events) {
    event({ hook_event_name: 'UserPromptSubmit', prompt: long ? LONG_PROMPT : 'Add Google OAuth login, persist sessions in Postgres, and add tests for protected routes.' });
    event({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(cwd, file), content: 'session cookie oauth' } });
    fs.writeFileSync(path.join(cwd, file), 'export const session = { cookie: "oauth", secure: true };\n');
    event({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(cwd, file) }, tool_response: { success: true } });
    if (deny) event({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } });
    if (complete) event({ hook_event_name: 'Stop' });
  }
  return { cwd, event, newTask: (prompt) => processHookEvent({ cwd, session_id: `${sessionId}-next`, hook_event_name: 'UserPromptSubmit', prompt }) };
}
async function serve(p) {
  const started = await createServer({ cwd: p.cwd, port: 0 });
  cleanup.push(() => new Promise((resolve) => started.server.close(resolve)));
  return started.url;
}

// A server that sends response headers and the start of a JSON body, then never finishes it.
const stalled = [];
const hangServer = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"project":"'); stalled.push(res); });
await new Promise((resolve) => hangServer.listen(0, '127.0.0.1', resolve));
cleanup.push(() => { for (const res of stalled) res.destroy(); return new Promise((resolve) => hangServer.close(resolve)); });
const hangUrl = `http://127.0.0.1:${hangServer.address().port}/`;

// ---------- Browser helpers ----------
const browser = await chromium.launch({ headless: true });
cleanup.unshift(() => browser.close());
async function open(url, { width = 1280, height = 900, scheme = 'light', before } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (error) => { errors.push(error.message); pageErrors.push(error.message); });
  const posts = []; page.on('request', (request) => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  if (before) await before(page);
  await page.goto(url);
  return { page, errors, posts, close: () => context.close() };
}
const connection = (page) => page.evaluate(() => document.body.dataset.connection);
const waitConnection = (page, value, timeout = 15000) => page.waitForFunction((v) => document.body.dataset.connection === v, value, { timeout });
const text = (page, selector) => page.locator(selector).first().innerText();
const count = (list, pathname) => list.filter((item) => item === pathname).length;
async function shot(page, name) { await page.screenshot({ path: path.join(out, 'screenshots', `${name}.png`) }); }

// ---------- A. Connection and freshness ----------
const complete = project();
const completeUrl = await serve(complete);

await section('A1 before the first state nothing reads as measured, verified or acceptable', async () => {
  let release; const held = new Promise((resolve) => { release = resolve; });
  const ui = await open(completeUrl, { before: (page) => page.route('**/api/state', async (route) => { await held; await route.continue(); }) });
  const ids = ['runtimeRisk', 'debt', 'coverage', 'currentFeatureFluency', 'responsibilityCoverage', 'policyProfile', 'agentCount'];
  const values = await ui.page.evaluate((list) => list.map((id) => document.getElementById(id)?.textContent.trim()), ids);
  const chip = await text(ui.page, '#integrityChip');
  const accept = await ui.page.locator('#acceptResponsibility').isDisabled();
  release(); await waitConnection(ui.page, 'live');
  check('A1 before the first state nothing reads as measured, verified or acceptable',
    values.every((value) => /^not loaded$/i.test(value)) && !/verified/i.test(chip) && accept, { values, chip, accept });
  await ui.close();
});

await section('A2 a first failed read says that nothing was loaded', async () => {
  const ui = await open(completeUrl, { before: (page) => page.route('**/api/state', (route) => route.abort('connectionrefused')) });
  await waitConnection(ui.page, 'offline');
  const banner = await text(ui.page, '#connectionBanner');
  await shot(ui.page, 'a2-offline');
  check('A2 a first failed read says that nothing was loaded',
    /is not responding\. No project state has been loaded yet\./.test(banner) && await ui.page.locator('#acceptResponsibility').isDisabled(), { banner });
  await ui.close();
});

await section('A3 an HTTP error and an unreadable state are named as such, not as offline', async () => {
  let mode = 'pass';
  const ui = await open(completeUrl, { before: (page) => page.route('**/api/state', (route) => {
    if (mode === 'http') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' });
    if (mode === 'empty') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (mode === 'notjson') return route.fulfill({ status: 200, contentType: 'application/json', body: '<html>proxy page</html>' });
    return route.continue();
  }) });
  await waitConnection(ui.page, 'live');
  const seen = {};
  for (const value of ['http', 'empty', 'notjson']) {
    mode = value; await waitConnection(ui.page, 'stale');
    await ui.page.waitForTimeout(1700);
    seen[value] = { banner: await text(ui.page, '#connectionBanner'), chip: await text(ui.page, '#integrityChip') };
    mode = 'pass'; await waitConnection(ui.page, 'live');
  }
  check('A3 an HTTP error and an unreadable state are named as such, not as offline',
    /returned an error \(HTTP 500\)/.test(seen.http.banner) && /could not read/.test(seen.empty.banner) && /could not read/.test(seen.notjson.banner)
      && Object.values(seen).every((item) => item.chip === 'state unavailable'), seen);
  await ui.close();
});

await section('A4 a read hung before its headers marks values out of date with the time of the data shown', async () => {
  let hold = false; const held = []; let lastAnswer = 0;
  const ui = await open(completeUrl, { before: (page) => {
    page.on('requestfinished', (request) => { if (request.url().endsWith('/api/state')) lastAnswer = Date.now(); });
    return page.route('**/api/state', (route) => { if (hold) held.push(route); else route.continue(); });
  } });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(400);
  hold = true; await ui.page.waitForTimeout(1600);
  const answered = lastAnswer;
  await waitConnection(ui.page, 'stale', 12000);
  const banner = await text(ui.page, '#connectionBanner');
  // The banner time is the last state actually rendered: within a second of the last answered read.
  const stated = await ui.page.evaluate((value) => Date.parse(value.match(/last update at (.+?) and may/)?.[1] || ''), banner);
  const shown = { stated, answered, gapMs: stated - answered };
  const motion = await ui.page.evaluate(() => {
    const pulse = document.querySelector('.pulse-track i'); const dot = document.getElementById('statusDot');
    return { animation: pulse ? getComputedStyle(pulse).animationName : 'none', opacity: pulse ? getComputedStyle(pulse).opacity : '0', dot: getComputedStyle(dot).backgroundColor,
      faint: getComputedStyle(document.documentElement).getPropertyValue('--faint').trim(), accept: document.getElementById('acceptResponsibility').disabled, filter: getComputedStyle(document.querySelector('.shell>section')).filter };
  });
  await shot(ui.page, 'a4-stale');
  hold = false; for (const route of held.splice(0)) await route.continue().catch(() => {});
  await waitConnection(ui.page, 'live');
  const recovered = await ui.page.locator('#connectionBanner').isHidden();
  check('A4 a read hung before its headers marks values out of date with the time of the data shown',
    Math.abs(shown.gapMs) <= 1500 && /project scan has its own captured snapshot/.test(banner)
      && (motion.animation === 'none' || motion.opacity === '0') && motion.accept && /grayscale/.test(motion.filter) && recovered, { banner, shown, motion, recovered });
  await ui.close();
});

await section('A5 a body that stops after the headers is bounded as well', async () => {
  let stall = false;
  const ui = await open(completeUrl, { before: (page) => page.route('**/api/state', (route) => (stall ? route.continue({ url: hangUrl }) : route.continue())) });
  await waitConnection(ui.page, 'live');
  stall = true; const started = Date.now();
  await waitConnection(ui.page, 'stale', 14000);
  const elapsed = Date.now() - started;
  stall = false; await waitConnection(ui.page, 'live');
  check('A5 a body that stops after the headers is bounded as well', elapsed <= 11000, { elapsed });
  await ui.close();
});

await section('A6 reads never overlap and a late answer cannot replace newer data', async () => {
  const p = project({ deny: false, complete: false }); const url = await serve(p);
  let inflight = 0; let maxInflight = 0; let holdNext = false; let late = null;
  const ui = await open(url, { before: async (page) => {
    page.on('request', (r) => { if (r.url().endsWith('/api/state')) { inflight += 1; maxInflight = Math.max(maxInflight, inflight); } });
    const done = (r) => { if (r.url().endsWith('/api/state')) inflight -= 1; };
    page.on('requestfinished', done); page.on('requestfailed', done);
    await page.route('**/api/state', async (route) => {
      if (holdNext) { holdNext = false; late = route; return; }
      await sleep(2200); await route.continue().catch(() => {});
    });
  } });
  await waitConnection(ui.page, 'live', 20000); await ui.page.waitForTimeout(5000);
  const old = await (await fetch(`${url}/api/state`)).json();
  holdNext = true; await waitConnection(ui.page, 'stale', 15000);
  p.newTask('Second task: rotate refresh tokens');
  await ui.page.waitForFunction(() => document.getElementById('task').textContent.includes('Second task'), null, { timeout: 15000 });
  await late?.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(old) }).catch(() => {});
  await ui.page.waitForTimeout(3000);
  const task = await text(ui.page, '#task');
  check('A6 reads never overlap and a late answer cannot replace newer data', maxInflight === 1 && task.includes('Second task'), { maxInflight, task });
  await ui.close();
});

await section('A7 after a suspended tab, data is re-read before any action and the pause is stated', async () => {
  let hold = false; const held = [];
  const ui = await open(completeUrl, { before: async (page) => {
    await page.clock.install();
    await page.route('**/api/state', (route) => { if (hold) held.push(route); else route.continue(); });
  } });
  for (let i = 0; i < 50 && (await connection(ui.page)) !== 'live'; i += 1) await sleep(100);
  const enabledBefore = await ui.page.locator('#acceptResponsibility').isEnabled();
  hold = true;
  await ui.page.clock.fastForward(11000);
  await ui.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await ui.page.locator('#acceptResponsibility').click({ force: true });
  await ui.page.clock.runFor(800);
  const during = { connection: await connection(ui.page), banner: await text(ui.page, '#connectionBanner'), accept: await ui.page.locator('#acceptResponsibility').isDisabled() };
  hold = false; for (const route of held.splice(0)) await route.continue().catch(() => {});
  for (let i = 0; i < 50 && (await connection(ui.page)) !== 'live'; i += 1) { await ui.page.clock.runFor(50); await sleep(50); }
  const after = { connection: await connection(ui.page), hidden: await ui.page.locator('#connectionBanner').isHidden() };
  check('A7 after a suspended tab, data is re-read before any action and the pause is stated',
    enabledBefore && count(ui.posts, '/api/responsibility/accept') === 0 && during.connection === 'checking' && /Updating live-task data/.test(during.banner) && during.accept && after.connection === 'live' && after.hidden,
    { enabledBefore, posts: ui.posts, during, after });
  await ui.close();
});

// ---------- B. Actions and synchronisation ----------
await section('B1 a double click sends one acceptance; the refreshed state then says it is accepted', async () => {
  const p = project({ deny: false }); const url = await serve(p);
  const ui = await open(url);
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#acceptResponsibility').dblclick();
  await ui.page.waitForFunction(() => /accepted ·/.test(document.getElementById('acceptResponsibility').textContent));
  await ui.page.waitForTimeout(2600);
  const label = await text(ui.page, '#acceptResponsibility');
  const stored = await (await fetch(`${url}/api/responsibility`)).json();
  check('B1 a double click sends one acceptance; the refreshed state then says it is accepted',
    count(ui.posts, '/api/responsibility/accept') === 1 && label === 'accepted · accept again' && stored.acceptances?.length === 1, { posts: ui.posts, label, acceptances: stored.acceptances?.length });
  await ui.close();
});

await section('B2 a slow acceptance stays locked through refreshes', async () => {
  const p = project({ deny: false }); const url = await serve(p);
  const ui = await open(url, { before: (page) => page.route('**/api/responsibility/accept', async (route) => { await sleep(4000); await route.continue(); }) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#acceptResponsibility').click();
  await ui.page.waitForTimeout(3000);
  const during = { disabled: await ui.page.locator('#acceptResponsibility').isDisabled(), label: await text(ui.page, '#acceptResponsibility') };
  await ui.page.waitForFunction(() => /accepted ·/.test(document.getElementById('acceptResponsibility').textContent), null, { timeout: 8000 });
  check('B2 a slow acceptance stays locked through refreshes', during.disabled && during.label === 'binding acceptance…' && count(ui.posts, '/api/responsibility/accept') === 1, { during, posts: ui.posts });
  await ui.close();
});

await section('B3 an acceptance without an answer is reported unconfirmed, never retried, and the refresh shows the truth', async () => {
  const p = project({ deny: false }); const url = await serve(p);
  const ui = await open(url, { before: (page) => page.route('**/api/responsibility/accept', async (route) => { await route.fetch(); await route.abort('connectionreset'); }) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#acceptResponsibility').click();
  await ui.page.waitForFunction(() => document.getElementById('acceptResponsibility').textContent === 'acceptance not confirmed');
  const banner = await ui.page.locator('#connectionBanner').isHidden();
  await ui.page.waitForTimeout(4000);
  const label = await text(ui.page, '#acceptResponsibility');
  check('B3 an acceptance without an answer is reported unconfirmed, never retried, and the refresh shows the truth',
    count(ui.posts, '/api/responsibility/accept') === 1 && banner && label === 'accepted · accept again', { posts: ui.posts, label, bannerHidden: banner });
  await ui.close();
});

await section('B4 a refused acceptance is called refused', async () => {
  const p = project({ deny: false }); const url = await serve(p);
  const ui = await open(url, { before: (page) => page.route('**/api/responsibility/accept', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"No completed diff proof is available to accept."}' })) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#acceptResponsibility').click();
  await ui.page.waitForFunction(() => document.getElementById('acceptResponsibility').textContent === 'acceptance refused');
  check('B4 a refused acceptance is called refused', await ui.page.locator('#connectionBanner').isHidden(), {});
  await ui.close();
});

await section('B5 a confirmed approval is sent once and is not offered again by later refreshes', async () => {
  const p = project(); const url = await serve(p);
  const ui = await open(url);
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#approveAction').dblclick();
  await ui.page.waitForFunction(() => document.getElementById('approveAction')?.textContent === 'approved once');
  await ui.page.waitForTimeout(4600);
  const state = { label: await text(ui.page, '#approveAction'), disabled: await ui.page.locator('#approveAction').isDisabled(), note: await text(ui.page, '#approvalNote') };
  const grants = JSON.parse(fs.readFileSync(projectPaths(p.cwd).approvals, 'utf8')).grants;
  check('B5 a confirmed approval is sent once and is not offered again by later refreshes',
    count(ui.posts, '/api/approve') === 1 && state.label === 'approved once' && state.disabled && /Ask the agent to retry/.test(state.note) && Object.keys(grants).length === 1,
    { posts: ui.posts, state, grants: Object.keys(grants).length });
  // The agent retries: the rule fired, the local approval let it through once.
  p.event({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } });
  await ui.page.waitForFunction(() => document.getElementById('decisionBanner').classList.contains('approved'), null, { timeout: 8000 });
  const approved = await ui.page.evaluate(() => ({ banner: document.getElementById('decisionBanner').innerText, button: Boolean(document.getElementById('approveAction')),
    first: document.querySelector('#timeline .trace-side .decision')?.textContent, border: getComputedStyle(document.getElementById('decisionBanner')).borderLeftColor,
    ok: getComputedStyle(document.documentElement).getPropertyValue('--ok').trim() }));
  await shot(ui.page, 'b5-approved-once');
  check('B5b an approved retry is shown as allowed once by the human, not as a block and not as success',
    /ALLOWED ONCE BY YOUR APPROVAL · DENY RULE/.test(approved.banner) && !approved.button && approved.first === 'APPROVED', approved);
  // The grant is used up; the same command is blocked again as a new event.
  p.event({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } });
  await ui.page.waitForFunction(() => document.getElementById('approveAction')?.textContent === 'approve once' && !document.getElementById('approveAction').disabled, null, { timeout: 8000 });
  check('B5c a new block of the same action starts with a fresh approve button', (await text(ui.page, '#approvalNote')) === '', {});
  await ui.close();
});

await section('B6 an approval without an answer is reported as uncertain and never retried', async () => {
  const p = project(); const url = await serve(p);
  const ui = await open(url, { before: (page) => page.route('**/api/approve', async (route) => { await route.fetch(); await route.abort('connectionreset'); }) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#approveAction').click();
  await ui.page.waitForFunction(() => /may or may not have been recorded/.test(document.getElementById('approvalNote')?.textContent || ''));
  await ui.page.waitForTimeout(4000);
  check('B6 an approval without an answer is reported as uncertain and never retried',
    count(ui.posts, '/api/approve') === 1 && await ui.page.locator('#connectionBanner').isHidden() && (await text(ui.page, '#approveAction')) === 'approve once', { posts: ui.posts });
  await ui.close();
});

await section('B7 a refused approval shows the reason', async () => {
  const p = project(); const url = await serve(p);
  const ui = await open(url, { before: (page) => page.route('**/api/approve', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Approval fingerprint must be a 16-character hex id from a blocked action."}' })) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#approveAction').click();
  await ui.page.waitForFunction(() => /refused the approval: Approval fingerprint/.test(document.getElementById('approvalNote')?.textContent || ''));
  check('B7 a refused approval shows the reason', count(ui.posts, '/api/approve') === 1, { posts: ui.posts });
  await ui.close();
});

await section('B8 keyboard focus survives refreshes on the approve and answer buttons', async () => {
  const p = project(); const url = await serve(p);
  const ui = await open(url);
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#approveAction').focus(); await ui.page.waitForTimeout(3300);
  const approve = await ui.page.evaluate(() => document.activeElement?.id);
  await ui.page.locator('#revealUnderstandingCheck').click().catch(() => {});
  const revealed = await ui.page.evaluate(() => document.activeElement?.classList.contains('answer'));
  await ui.page.waitForTimeout(3300);
  const answer = await ui.page.evaluate(() => document.activeElement?.classList.contains('answer'));
  check('B8 keyboard focus survives refreshes on the approve and answer buttons', approve === 'approveAction' && revealed && answer, { approve, revealed, answer });
  await ui.close();
});

await section('B9 an answer is sent once, feedback is not undone by refreshes, then the card updates', async () => {
  const p = project({ deny: false, complete: false }); const url = await serve(p);
  const ui = await open(url);
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#revealUnderstandingCheck').click().catch(() => {});
  await ui.page.locator('#answers .answer').first().dblclick();
  await ui.page.waitForFunction(() => /^(Correct|Not quite)\./.test(document.getElementById('feedback').textContent));
  await ui.page.waitForTimeout(900);
  const during = await ui.page.evaluate(() => ({ disabled: [...document.querySelectorAll('#answers .answer')].every((b) => b.disabled), marked: Boolean(document.querySelector('#answers .correct')) }));
  await ui.page.waitForTimeout(2600);
  const after = await ui.page.evaluate(() => ({ marked: Boolean(document.querySelector('#answers .correct, #answers .wrong')), enabled: [...document.querySelectorAll('#answers button')].some((b) => !b.disabled) }));
  check('B9 an answer is sent once, feedback is not undone by refreshes, then the card updates',
    count(ui.posts, '/api/answer') === 1 && during.disabled && during.marked && !after.marked && after.enabled, { posts: ui.posts, during, after });
  await ui.close();
});

await section('B10 a slow answer during a task change does not bring the old task back', async () => {
  const p = project({ deny: false, complete: false }); const url = await serve(p);
  const ui = await open(url, { before: (page) => page.route('**/api/answer', async (route) => { await sleep(3500); await route.continue(); }) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#revealUnderstandingCheck').click().catch(() => {});
  await ui.page.locator('#answers .answer').first().click();
  p.newTask('A new task: add rate limiting to the login route');
  await ui.page.waitForFunction(() => document.getElementById('task').textContent.includes('rate limiting'), null, { timeout: 8000 });
  const lockedWhileNewTask = await ui.page.evaluate(() => [...document.querySelectorAll('#answers .answer')].every((b) => b.disabled));
  await ui.page.waitForFunction(() => /^(Correct|Not quite)\./.test(document.getElementById('feedback').textContent), null, { timeout: 8000 });
  await ui.page.waitForTimeout(3500);
  const task = await text(ui.page, '#task');
  check('B10 a slow answer during a task change does not bring the old task back', lockedWhileNewTask && task.includes('rate limiting'), { lockedWhileNewTask, task });
  await ui.close();
});

await section('B11 an answer without a reply is unconfirmed and does not claim Local is offline', async () => {
  const p = project({ deny: false, complete: false }); const url = await serve(p);
  const ui = await open(url, { before: (page) => page.route('**/api/answer', (route) => route.abort('connectionreset')) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#revealUnderstandingCheck').click().catch(() => {});
  await ui.page.locator('#answers .answer').first().click();
  await ui.page.waitForFunction(() => /was not confirmed/.test(document.getElementById('feedback').textContent));
  await ui.page.waitForTimeout(1600);
  check('B11 an answer without a reply is unconfirmed and does not claim Local is offline', (await connection(ui.page)) === 'live' && await ui.page.locator('#connectionBanner').isHidden(), { posts: ui.posts });
  await ui.close();
});

await section('B12 a feature check refused because the map changed shows the server reason', async () => {
  const ui = await open(completeUrl, { before: (page) => page.route('**/api/feature-answer', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Feature model changed; refresh before answering"}' })) });
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.getByText('check this feature map · optional').click();
  await ui.page.locator('.feature-answer').first().click();
  await ui.page.waitForFunction(() => /Feature model changed; refresh before answering/.test(document.getElementById('featureFeedback').textContent));
  check('B12 a feature check refused because the map changed shows the server reason', await ui.page.locator('#connectionBanner').isHidden(), {});
  await ui.close();
});

await section('B13 setting lessons aside and resuming goes through the server and back', async () => {
  const p = project({ deny: false, complete: false }); const url = await serve(p);
  const ui = await open(url);
  await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  await ui.page.locator('#revealUnderstandingCheck').click().catch(() => {});
  // "Not now" moves to the next lesson; once every lesson of the task is set aside the card pauses.
  const seen = [];
  for (let i = 0; i < 8 && (await text(ui.page, '#cardRisk')) !== 'PAUSED'; i += 1) {
    seen.push(await text(ui.page, '#cardTitle'));
    // Each new lesson starts with its optional check folded away, as designed.
    if (await ui.page.locator('#revealUnderstandingCheck').isVisible()) await ui.page.locator('#revealUnderstandingCheck').click();
    await ui.page.locator('#snoozeLesson').click();
    await ui.page.waitForFunction((title) => document.getElementById('cardRisk').textContent === 'PAUSED' || document.getElementById('cardTitle').textContent !== title, seen.at(-1));
    await ui.page.waitForTimeout(300);
  }
  const paused = await text(ui.page, '#cardRisk');
  const snoozes = count(ui.posts, '/api/snooze');
  await ui.page.locator('#resumeLesson').click();
  await ui.page.waitForFunction(() => document.getElementById('cardRisk').textContent !== 'PAUSED');
  check('B13 setting lessons aside and resuming goes through the server and back',
    paused === 'PAUSED' && snoozes === seen.length && count(ui.posts, '/api/snooze') === snoozes + 1, { seen, snoozes, posts: ui.posts });
  await ui.close();
});

// ---------- C. Information fidelity ----------
await section('C1 no activity is not a zero; a real check shows its measured value', async () => {
  const empty = project({ events: false }); const emptyUrl = await serve(empty);
  let ui = await open(emptyUrl); await waitConnection(ui.page, 'live');
  const none = await ui.page.evaluate(() => ({ risk: document.getElementById('runtimeRisk').textContent, fluency: document.getElementById('currentFeatureFluency').textContent }));
  await ui.close();
  ui = await open(completeUrl); await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  const before = await text(ui.page, '#currentFeatureFluency');
  const risk = await text(ui.page, '#runtimeRisk');
  await ui.page.getByText('check this feature map · optional').click();
  await ui.page.locator('.feature-answer').first().click();
  await ui.page.waitForFunction(() => /%$/.test(document.getElementById('currentFeatureFluency').textContent), null, { timeout: 8000 });
  const after = await text(ui.page, '#currentFeatureFluency');
  check('C1 no activity is not a zero; a real check shows its measured value',
    none.risk === 'Not assessed' && none.fluency === 'Not assessed' && /^\d+$/.test(risk) && before === 'Not assessed' && /^\d+%$/.test(after), { none, risk, before, after });
  await ui.close();
});

// ---------- D. Semantics ----------
await section('D1 recorder health is a labelled status light; product promises match what exists', async () => {
  const ui = await open(completeUrl); await waitConnection(ui.page, 'live');
  const chip = await ui.page.evaluate(() => { const el = document.getElementById('integrityChip'); const style = getComputedStyle(el); return { text: el.textContent, border: style.borderTopWidth, background: style.backgroundColor }; });
  const privacy = await ui.page.locator('.privacy').getAttribute('title');
  const portal = await text(ui.page, '#portalBoundary');
  check('D1 recorder health is a labelled status light; product promises match what exists',
    chip.text === 'local trace verified' && chip.border === '0px' && /rgba\(0, 0, 0, 0\)|transparent/.test(chip.background)
      && privacy === '127.0.0.1 · source leaves only with your approval' && /received changes with their proof and debt results/.test(portal) && !/spaced recall|feature drift/i.test(portal),
    { chip, privacy, portal });
  await ui.close();
});

await section('D2 panel visibility is unchanged: displayed panels stay displayed, hidden ones stay hidden', async () => {
  const ui = await open(completeUrl); await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  const shown = await ui.page.evaluate(() => {
    const visible = (el) => Boolean(el) && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    return {
      featureMastery: visible(document.getElementById('featureFluency')?.closest('.metric')),
      knowledgeDebt: visible(document.getElementById('debt')?.closest('.metric')),
      conceptMastery: visible(document.getElementById('coverage')?.closest('.metric')),
      impactAndModel: visible(document.querySelector('.project-intel-grid')),
      projectMemory: visible(document.querySelector('.feature-memory-panel')),
      conceptMap: visible(document.querySelector('.ledger-panel')),
      spacedRecall: visible(document.getElementById('memoryReviewChallenge')),
    };
  });
  check('D2 panel visibility is unchanged: displayed panels stay displayed, hidden ones stay hidden',
    shown.featureMastery && shown.knowledgeDebt && shown.conceptMastery && shown.impactAndModel && !shown.projectMemory && !shown.conceptMap && !shown.spacedRecall, shown);
  await ui.close();
});

// ---------- F. Optional OpenRouter interpretation, without a key (no paid call is possible) ----------
await section('F1 OpenRouter: preview and refusals are explained, Send stays unavailable without a key, cancel answers, nothing leaves 127.0.0.1', async () => {
  const outside = [];
  const ui = await open(completeUrl, { before: (page) => page.on('request', (r) => { if (!/^http:\/\/127\.0\.0\.1:/.test(r.url())) outside.push(r.url()); }) });
  await waitConnection(ui.page, 'live');
  await ui.page.locator('#optionalAI > summary').click();
  await ui.page.waitForFunction(() => !/^\s*$/.test(document.getElementById('aiStatus').textContent));
  const status = await text(ui.page, '#aiStatus');
  await ui.page.locator('#aiTestConnection').click();
  await ui.page.waitForFunction((before) => document.getElementById('aiStatus').textContent !== before, status);
  const tested = await text(ui.page, '#aiStatus');
  await ui.page.locator('#aiPreviewButton').click();
  await ui.page.waitForFunction(() => !/No preview prepared/.test(document.getElementById('aiPreview').textContent));
  const preview = await text(ui.page, '#aiPreview');
  const send = await ui.page.locator('#aiSend').isDisabled();
  await ui.page.locator('#aiCancel').click();
  await ui.page.waitForFunction(() => document.getElementById('aiResult').textContent.trim() !== '');
  const cancelled = await text(ui.page, '#aiResult');
  check('F1 OpenRouter: preview and refusals are explained, Send stays unavailable without a key, cancel answers, nothing leaves 127.0.0.1',
    /Configure a dedicated capped key through the CLI/.test(status) && /No OpenRouter key is configured/.test(tested) && /Run a project scan first[\s\S]*Nothing was sent/.test(preview)
      && ![status, tested, preview, cancelled].some((value) => /BYOK_/.test(value)) && send && /No request in progress\. Nothing was sent\./.test(cancelled)
      && count(ui.posts, '/api/ai') === 3 && outside.length === 0,
    { status, tested, preview, send, cancelled, posts: ui.posts, outside });
  await ui.close();
});

// ---------- E. Layout, navigation and accessibility ----------
const longProject = project({ long: true }); const longUrl = await serve(longProject);
const WIDTHS = [320, 360, 390, 640, 759, 760, 761, 768, 1024, 1099, 1100, 1101, 1179, 1180, 1181, 1440];
for (const scheme of ['light', 'dark']) {
  await section(`E1 ${scheme}: no sideways scroll, every tab reachable, no overlap, at ${WIDTHS.join('/')} px`, async () => {
    const failures = [];
    for (const width of WIDTHS) {
      const ui = await open(longUrl, { width, height: 900, scheme }); await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(250);
      const layout = await ui.page.evaluate(() => {
        const vw = document.documentElement.clientWidth; const sw = document.documentElement.scrollWidth;
        const tabs = [...document.querySelectorAll('.section-nav a')].map((a) => { const r = a.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; });
        const brand = document.querySelector('.brand').getBoundingClientRect(); const meta = document.querySelector('.top-meta').getBoundingClientRect();
        return { vw, sw, tabs: tabs.length, clipped: tabs.filter((t) => t.left < 0 || t.right > vw + 0.5 || t.height === 0).length, overlap: brand.right > meta.left + 0.5 };
      });
      if (layout.sw > layout.vw || layout.clipped || layout.tabs !== 7 || layout.overlap) failures.push({ width, ...layout });
      if ([360, 768, 1440].includes(width)) await ui.page.screenshot({ path: path.join(out, 'screenshots', `e1-${scheme}-${width}.png`), fullPage: false });
      await ui.close();
    }
    check(`E1 ${scheme}: no sideways scroll, every tab reachable, no overlap, at ${WIDTHS.join('/')} px`, failures.length === 0, { failures });
  });
}

for (const width of [1440, 390]) {
  await section(`E2 ${width} px: each tab lands its section under the bars and becomes the current tab`, async () => {
    const ui = await open(completeUrl, { width, height: 900 }); await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
    const failures = [];
    for (const href of await ui.page.$$eval('.section-nav a', (links) => links.map((a) => a.getAttribute('href')))) {
      await ui.page.locator(`.section-nav a[href="${href}"]`).click(); await ui.page.waitForTimeout(700);
      const placed = await ui.page.evaluate((target) => {
        const section = document.querySelector(target).getBoundingClientRect();
        const bar = document.querySelector('.topbar').getBoundingClientRect(); const nav = document.querySelector('.section-nav-bar');
        const covered = getComputedStyle(nav).position === 'sticky' ? Math.max(bar.bottom, nav.getBoundingClientRect().bottom) : bar.bottom;
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        return { top: section.top, covered, atBottom, current: document.querySelector('.section-nav a[aria-current]')?.getAttribute('href') };
      }, href);
      const landed = placed.top >= placed.covered - 2 && (placed.top <= placed.covered + 48 || placed.atBottom);
      if (!landed || placed.current !== href) failures.push({ href, ...placed });
    }
    check(`E2 ${width} px: each tab lands its section under the bars and becomes the current tab`, failures.length === 0, { failures });
    await ui.close();
  });
}

await section('E3 keyboard order is skip link, brand, then the seven tabs; focus is visible on tabs and actions', async () => {
  const ui = await open(completeUrl); await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
  const order = [];
  for (let i = 0; i < 9; i += 1) { await ui.page.keyboard.press('Tab'); order.push(await ui.page.evaluate(() => document.activeElement?.getAttribute('href') || document.activeElement?.id || document.activeElement?.tagName)); }
  const ring = await ui.page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow }; });
  await ui.page.locator('#acceptResponsibility').focus();
  await ui.page.keyboard.press('Shift+Tab'); await ui.page.keyboard.press('Tab');
  const acceptRing = await ui.page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { id: document.activeElement.id, outline: s.outlineStyle, shadow: s.boxShadow }; });
  const visible = (r) => (r.outline !== 'none' && r.width !== '0px') || (r.shadow && r.shadow !== 'none');
  check('E3 keyboard order is skip link, brand, then the seven tabs; focus is visible on tabs and actions',
    order[0] === '#nowSection' && order[1] === '#' && order.slice(2, 9).join() === '#nowSection,#projectSection,#explainSection,#featureSection,#impactSection,#filesSection,#hoodSection' && visible(ring) && acceptRing.id === 'acceptResponsibility' && visible(acceptRing),
    { order, ring, acceptRing });
  await ui.close();
});

for (const scheme of ['light', 'dark']) {
  await section(`E4 ${scheme}: text contrast holds in the normal and out-of-date states`, async () => {
    let fail = false;
    const ui = await open(completeUrl, { scheme, before: (page) => page.route('**/api/state', (route) => (fail ? route.abort('connectionrefused') : route.continue())) });
    await waitConnection(ui.page, 'live'); await ui.page.waitForTimeout(300);
    const measure = () => ui.page.evaluate(() => {
      const rgba = (value) => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
      const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
      const background = (el) => { const stack = []; for (let node = el; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c && c[3] > 0) stack.push(c); if (c && c[3] === 1) break; }
        return stack.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255, 1]); };
      const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const selectors = ['#connectionBanner', '#status', '#integrityChip', '.empty', '.mini-label', '.section-nav a', '#task', '.trace-side small', 'footer', '#acceptResponsibility', '.privacy'];
      return selectors.flatMap((selector) => [...document.querySelectorAll(selector)].filter((el) => el.offsetParent && el.textContent.trim()).slice(0, 3).map((el) => {
        const bg = background(el); const fg = over(rgba(getComputedStyle(el).color), bg); return { selector, ratio: Math.round(ratio(fg, bg) * 100) / 100 };
      }));
    });
    const normal = await measure();
    fail = true; await waitConnection(ui.page, 'stale');
    const stale = await measure();
    // grayscale() keeps relative luminance, so the measured ratios also hold under the out-of-date filter.
    const low = [...normal, ...stale].filter((item) => item.ratio < 4.5);
    check(`E4 ${scheme}: text contrast holds in the normal and out-of-date states`, low.length === 0 && stale.some((item) => item.selector === '#connectionBanner'), { low });
    await ui.close();
  });
}

check('E5 the page raised no script error in any scenario above', pageErrors.length === 0, { errors: pageErrors.slice(0, 20) });

for (const step of cleanup) await step()?.catch?.(() => {});
const failed = results.filter((item) => item.status !== 'PASS');
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ schema: 'idleproof.local-ui-browser.v1', classification: 'MACHINE', human: 'NOT_RUN', passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;
