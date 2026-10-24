// Issue #29: the explanation is about the change the agent actually made, not about whatever
// historical declaration happens to come first in a touched file, and it never states an
// authentication, persistence or service role the code does not support.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTaskSignals } from '../src/context.mjs';
import { buildHookDelivery } from '../src/delivery.mjs';
import { processHookLifecycle } from '../src/hook.mjs';
import { buildPortalSnapshot } from '../src/portal-snapshot.mjs';
import { loadState } from '../src/state.mjs';
import { canonicalCore, failingCore } from './support/canonical-core.mjs';

const CART = `def apply_discount(total):
    """Return the discounted total for large orders."""
    return total * 0.9 if total >= 100 else total
`;
const TESTS = `from src.cart import apply_discount


def test_small_order():
    assert apply_discount(50) == 50
`;
const GIFT = `

def gift_wrap_fee_cents(item_count: int) -> int:
    """Gift wrap fee in cents computed from item_count, capped; update the total elsewhere."""
    return min(item_count * 150, 600)
`;
const GIFT_TESTS = `

def test_gift_wrap_fee_is_per_item():
    from src.cart import gift_wrap_fee_cents
    assert gift_wrap_fee_cents(2) == 300


def test_gift_wrap_fee_is_capped():
    from src.cart import gift_wrap_fee_cents
    assert gift_wrap_fee_cents(9) == 600
`;
// The real request mixed French and the exact identifier; earlier recipe turns talked about
// sessions and SQLite, which are topics of the conversation, not of this code.
const PROMPT = 'Nouvelle session de recette (base SQLite inchangée) : ajoute gift_wrap_fee_cents(item_count: int) -> int, 150 centimes par article, plafonné à 600, avec tests.';

const FORBIDDEN = [/decides who the user is/i, /allowed to do/i, /data that the application keeps over time/i,
  /succeed together or fail together/i, /boundary between this project and another service/i, /persistent/i];

// Spans as Python's parser reports them: from `def` to the last line of the indented body.
function pythonSpans(text) {
  const lines = text.split('\n');
  const spans = [];
  lines.forEach((line, index) => {
    const name = line.match(/^def ([A-Za-z_]\w*)\(/)?.[1];
    if (!name) return;
    let end = index;
    for (let next = index + 1; next < lines.length; next += 1) {
      if (lines[next].trim() && !/^\s/.test(lines[next])) break;
      if (lines[next].trim()) end = next;
    }
    spans.push({ name, line: index + 1, end_line: end + 1 });
  });
  return spans;
}

const parser = (cwd) => ({
  command: 'fixture-core',
  run: (command, args, options) => {
    const facts = {};
    for (const file of ['src/cart.py', 'src/pricing.py', 'tests/test_cart.py']) {
      const absolute = path.join(cwd, file);
      if (fs.existsSync(absolute)) facts[file] = { symbols: pythonSpans(fs.readFileSync(absolute, 'utf8')) };
    }
    return canonicalCore(facts).run(command, args, options);
  }
});

function repo(t, files = { 'src/cart.py': CART, 'tests/test_cart.py': TESTS }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'idleproof-change-subject-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 'subject@example.test'); git('config', 'user.name', 'Subject Test');
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), text);
  }
  git('add', '-A'); git('commit', '-qm', 'history');
  return cwd;
}

// The native turn as hooks see it: the agent reads both files, edits the code, then the tests last.
function turn(cwd, prompt = PROMPT, edits = () => {
  fs.appendFileSync(path.join(cwd, 'src/cart.py'), GIFT);
  fs.appendFileSync(path.join(cwd, 'tests/test_cart.py'), GIFT_TESTS);
}) {
  const event = { cwd, session_id: 'codex-29', source: 'codex' };
  processHookLifecycle({ ...event, hook_event_name: 'SessionStart' });
  processHookLifecycle({ ...event, hook_event_name: 'UserPromptSubmit', prompt });
  for (const file of ['src/cart.py', 'tests/test_cart.py']) {
    processHookLifecycle({ ...event, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: path.join(cwd, file) } });
  }
  edits();
  for (const file of ['src/cart.py', 'tests/test_cart.py']) {
    processHookLifecycle({ ...event, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(cwd, file) } });
  }
  const stop = processHookLifecycle({ ...event, hook_event_name: 'Stop' }, { deferAutoDebt: true });
  return { stop, session: loadState(cwd).sessions['codex-29'], state: loadState(cwd) };
}

const signals = (cwd, session) => extractTaskSignals(cwd, session, { structureOptions: parser(cwd) });

test('REPRO #29: the new function, not the first historical declaration, is the subject of the handoff', (t) => {
  const cwd = repo(t);
  const { session, state } = turn(cwd);
  // Session concepts come from the conversation: they include topics the code never touches.
  assert.ok(Object.keys(session.concepts).includes('auth'), 'fixture: "session" in the request is an auth topic');

  const found = signals(cwd, session);
  assert.equal(found.file, 'src/cart.py');
  assert.equal(found.symbol, 'gift_wrap_fee_cents');
  assert.equal(found.symbolEvidence, 'added');
  assert.deepEqual(found.changedSymbols, [{ name: 'gift_wrap_fee_cents', kind: 'added' }]);
  const tests = found.relatedFiles.find((item) => item.file === 'tests/test_cart.py');
  assert.deepEqual(tests.changedSymbols.map((item) => item.name).sort(), ['test_gift_wrap_fee_is_capped', 'test_gift_wrap_fee_is_per_item']);
  assert.notEqual(tests.symbol, 'test_small_order');
  // A docstring saying "computed from item_count ... update the total" is not a SQL statement.
  assert.equal(found.table, null);
  assert.equal(found.fileRole.role, 'core');

  const delivery = buildHookDelivery(cwd, state, session, 'Stop', { structureOptions: parser(cwd) });
  const message = delivery.message;
  assert.match(message, /The change adds `gift_wrap_fee_cents`/);
  assert.match(message, /this change adds `gift_wrap_fee_cents`/);
  // Historical code stays visible as context, explicitly not part of this change (the hook line
  // itself is bounded; the explanation keeps the full sentence).
  assert.match(delivery.explanation.files[0].explanation, /existing declarations it does not change include `apply_discount`/);
  assert.doesNotMatch(message, /centered on `(?:test_small_order|apply_discount)`|around `(?:test_small_order|apply_discount)`/);
  for (const pattern of FORBIDDEN) assert.doesNotMatch(message, pattern);
  assert.equal(delivery.explanation.concept, null, 'auth/sql are conversation topics, not code evidence');

  const summary = buildPortalSnapshot({ session: { ...session, taskSignals: found } }).task.summary;
  assert.equal(summary, 'Adds gift_wrap_fee_cents in src/cart.py');
});

test('through the real Stop hook without a parser, the change file is the subject and no role is invented', (t) => {
  const cwd = repo(t);
  const { stop, session } = turn(cwd);
  assert.equal(session.taskSignals.file, 'src/cart.py', 'the production change, not the test file edited last');
  assert.notEqual(session.taskSignals.symbol, 'test_small_order');
  assert.notEqual(session.taskSignals.symbol, 'apply_discount');
  const message = stop.hookOutput.systemMessage;
  for (const pattern of FORBIDDEN) assert.doesNotMatch(message, pattern);
  assert.doesNotMatch(buildPortalSnapshot({ session }).task.summary, /test_small_order|apply_discount/);
});

test('a code-grounded concept is still explained; a conversation-only topic is not', (t) => {
  const cwd = repo(t, { 'src/access.py': 'def can_export(user):\n    return False\n' });
  const { session, state } = turn(cwd, 'Restrict export: check the authorization role before exporting', () => {
    fs.writeFileSync(path.join(cwd, 'src/access.py'), 'def can_export(user):\n    # authorization: only finance admins\n    return user.is_authenticated and "finance_admin" in user.roles\n');
  });
  const delivery = buildHookDelivery(cwd, state, { ...session, touchedFiles: ['src/access.py'] }, 'Stop', { structureOptions: parser(cwd) });
  assert.equal(delivery.explanation.concept?.id, 'auth');
});

test('variants: rename, partial edit, similar names, several files, tests only, empty diff', async (t) => {
  await t.test('a renamed function is the modified subject; the old name is gone', (t) => {
    const cwd = repo(t);
    const { session } = turn(cwd, 'Rename apply_discount to discounted_total', () => {
      fs.writeFileSync(path.join(cwd, 'src/cart.py'), CART.replace('apply_discount', 'discounted_total'));
    });
    const found = signals(cwd, session);
    assert.equal(found.symbol, 'discounted_total');
    assert.equal(found.symbolEvidence, 'modified');
  });
  await t.test('an edit inside an existing function makes it the modified subject', (t) => {
    const cwd = repo(t);
    const { session } = turn(cwd, 'Raise the discount threshold', () => {
      fs.writeFileSync(path.join(cwd, 'src/cart.py'), CART.replace('total >= 100', 'total >= 150'));
    });
    const found = signals(cwd, session);
    assert.deepEqual([found.file, found.symbol, found.symbolEvidence], ['src/cart.py', 'apply_discount', 'modified']);
  });
  await t.test('of two similar names the changed one wins, whatever the request says', (t) => {
    const cwd = repo(t, { 'src/cart.py': CART + '\n\ndef gift_wrap_fee_euros(item_count):\n    return item_count * 1.5\n', 'tests/test_cart.py': TESTS });
    const { session } = turn(cwd, 'Add the gift wrap fee in cents', () => fs.appendFileSync(path.join(cwd, 'src/cart.py'), GIFT));
    const found = signals(cwd, session);
    assert.equal(found.symbol, 'gift_wrap_fee_cents');
    assert.ok(!found.changedSymbols.some((item) => item.name === 'gift_wrap_fee_euros'));
  });
  await t.test('with several changed files the request picks among the changed symbols', (t) => {
    const cwd = repo(t, { 'src/cart.py': CART, 'src/pricing.py': 'def base_price(sku):\n    return 100\n', 'tests/test_cart.py': TESTS });
    const { session } = turn(cwd, 'Add bulk_price to pricing and use it from the cart', () => {
      fs.appendFileSync(path.join(cwd, 'src/pricing.py'), '\n\ndef bulk_price(sku, quantity):\n    return base_price(sku) * quantity\n');
      fs.appendFileSync(path.join(cwd, 'src/cart.py'), '\n\ndef cart_line(sku, quantity):\n    return quantity\n');
    });
    const found = signals(cwd, session);
    assert.deepEqual([found.file, found.symbol], ['src/pricing.py', 'bulk_price']);
    assert.ok(found.relatedFiles.some((item) => item.file === 'src/cart.py' && item.changedSymbols.some((s) => s.name === 'cart_line')));
  });
  await t.test('a tests-only change is a test subject, never production code', (t) => {
    const cwd = repo(t);
    const { session } = turn(cwd, 'Add a regression test', () => fs.appendFileSync(path.join(cwd, 'tests/test_cart.py'), GIFT_TESTS));
    const found = signals(cwd, session);
    assert.equal(found.file, 'tests/test_cart.py');
    assert.equal(found.fileRole.role, 'test');
    assert.match(found.symbol, /^test_gift_wrap_fee_/);
  });
  await t.test('an empty diff names no subject unless the request does', (t) => {
    const cwd = repo(t);
    const { session } = turn(cwd, 'Look around the cart', () => {});
    const found = signals(cwd, session);
    assert.equal(found.changed, false);
    assert.equal(found.symbol, null);
    assert.equal(found.symbolEvidence, null);
    // The request names a symbol: it becomes the subject only in the file that declares it.
    const named = signals(cwd, { ...session, prompt: 'Explain apply_discount' });
    assert.equal(named.file, 'tests/test_cart.py');
    assert.equal(named.symbol, null, 'the test file only imports apply_discount');
    const cart = named.relatedFiles.find((item) => item.file === 'src/cart.py');
    assert.deepEqual([cart.symbol, cart.symbolEvidence], ['apply_discount', 'request']);
  });
  await t.test('without a parser for Python, no symbol and no role are asserted', (t) => {
    const cwd = repo(t);
    const { session } = turn(cwd);
    const found = extractTaskSignals(cwd, session, { structureOptions: failingCore.timeout });
    assert.equal(found.file, 'src/cart.py');
    assert.equal(found.symbol, null);
    assert.deepEqual(found.changedSymbols, []);
    assert.equal(buildPortalSnapshot({ session: { ...session, taskSignals: found } }).task.summary, 'Work involving src/cart.py');
  });
});

test('SQL tables need the shape of a statement', async () => {
  const { sqlStatementTables } = await import('../src/sql-shape.mjs');
  for (const prose of ['"""Fee computed from item_count; update the total, select from options"""',
    'alert("Select a file from your computer")', "toast('Delete from cart?')", '"Insert into the box, then update total set"']) {
    assert.deepEqual(sqlStatementTables(prose), [], prose);
  }
  assert.deepEqual(sqlStatementTables('db.query("select count(*) as n, o.id from orders o")'), ['orders']);
  assert.deepEqual(sqlStatementTables("run('delete from sessions where id = ?')"), ['sessions']);
  assert.deepEqual(sqlStatementTables('db.query("select id from orders where id = ?")'), ['orders']);
  assert.deepEqual(sqlStatementTables("cur.execute('INSERT INTO widget_events(id) VALUES (1)')"), ['widget_events']);
  assert.deepEqual(sqlStatementTables('SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id'), ['orders', 'customers']);
  assert.deepEqual(sqlStatementTables("sql`update invoices set paid = true`"), ['invoices']);
});
