import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Independent, manually specified counterexamples. Source fixtures are data sent
// to isolated provider CLIs; none of the fixture programs is imported or executed.
const python = process.env.IDLEPROOF_DEEP_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const pythonProvider = fileURLToPath(new URL('../src/atlas-deep-python.py', import.meta.url));
const javascriptProvider = new URL('../src/atlas-deep-javascript.mjs', import.meta.url).href;
const jsDriver = `import fs from 'node:fs'; import {analyzeJavaScript} from ${JSON.stringify(javascriptProvider)}; process.stdout.write(JSON.stringify(analyzeJavaScript(JSON.parse(fs.readFileSync(0,'utf8')))));`;
function analyze(language, sources) {
  const input = {
    identity: {snapshotId: 'dwscan_' + 'd'.repeat(64), repositoryId: 'e'.repeat(64), source: 'HEAD', tree: 'f'.repeat(40)},
    files: Object.entries(sources).map(([path, content]) => ({path, content, sourceSha256: createHash('sha256').update(content).digest('hex')})),
  };
  const command = language === 'python' ? python : process.execPath;
  const args = language === 'python' ? ['-I', '-S', pythonProvider] : ['--input-type=module', '-e', jsDriver];
  const result = spawnSync(command, args, {input: JSON.stringify(input), encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024});
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}
function site(result, path, line, expression) {
  const matches = result.callSites.filter(c => c.source.path === path && c.source.line === line && c.expression === expression);
  assert.equal(matches.length, 1, `Expected one ${path}:${line} ${expression} callsite`);
  return matches[0];
}
function noCertainTarget(result, call) {
  assert.notEqual(call.status, 'RESOLVED', `${call.source.path}:${call.source.line} ${call.expression}: ${call.reason}`);
  assert.ok(!result.edges.some(e => e.kind === 'CALLS' && e.callSiteId === call.id), 'Unqualified call must not retain a certain CALLS edge');
}
function targetNames(result, call) {
  return call.targetIds.map(id => result.nodes.find(n => n.id === id)?.qualifiedName);
}

test('independent Python: imports are unavailable before their executing statement', () => {
  const r = analyze('python', {'main.py': 'f()\nfrom helper import f\n', 'helper.py': 'def f():\n return 1\n'});
  noCertainTarget(r, site(r, 'main.py', 1, 'f'));
});

test('independent Python: local definitions are unavailable before initialization', () => {
  const r = analyze('python', {'main.py': 'def outer():\n f()\n def f():\n  return 1\n'});
  noCertainTarget(r, site(r, 'main.py', 2, 'f'));
});

test('independent Python: own default and class body cannot refer to their unfinished definition', () => {
  const r = analyze('python', {'main.py': 'def f(value=f()):\n return value\nclass C:\n C()\n'});
  noCertainTarget(r, site(r, 'main.py', 1, 'f'));
  noCertainTarget(r, site(r, 'main.py', 4, 'C'));
});

test('independent Python: relative import cannot escape its top-level package', () => {
  const r = analyze('python', {'pkg/consumer.py': 'from ..helper import f\nf()\n', 'helper.py': 'def f():\n return 1\n'});
  noCertainTarget(r, site(r, 'pkg/consumer.py', 2, 'f'));
});

test('independent Python: dotted filename does not establish an importable package path', () => {
  const r = analyze('python', {'helpers.math.py': 'def f():\n return 1\n', 'main.py': 'from helpers.math import f\nf()\n'});
  noCertainTarget(r, site(r, 'main.py', 2, 'f'));
});

test('independent Python: module and package with the same name cannot be chosen with certainty', () => {
  const r = analyze('python', {'helper.py': 'def f():\n return 1\n', 'helper/__init__.py': 'def f():\n return 2\n', 'main.py': 'from helper import f\nf()\n'});
  noCertainTarget(r, site(r, 'main.py', 2, 'f'));
});

test('independent Python: aliased exec invalidates later callable bindings', () => {
  const r = analyze('python', {'main.py': 'def f():\n return 1\ndef g():\n return 2\nrun=exec\nrun("f=g")\nf()\n'});
  noCertainTarget(r, site(r, 'main.py', 7, 'f'));
});

test('independent Python: qualified builtin reflection cannot preserve certain targets', () => {
  const r = analyze('python', {'main.py': 'import builtins\ndef f():\n return 1\ndef g():\n return 2\nbuiltins.exec("f=g")\nf()\n'});
  noCertainTarget(r, site(r, 'main.py', 7, 'f'));
});

test('independent Python: delete, global, and nonlocal rebinding invalidate certain targets', () => {
  const fixtures = {
    'deleted.py': 'def f():\n return 1\ndel f\nf()\n',
    'global.py': 'def f():\n return 1\ndef use():\n global f\n f=other\n f()\n',
    'nonlocal.py': 'def outer():\n def f():\n  return 1\n def use():\n  nonlocal f\n  f=other\n  f()\n',
  };
  const r = analyze('python', fixtures);
  for (const [path, line] of [['deleted.py', 4], ['global.py', 6], ['nonlocal.py', 7]]) noCertainTarget(r, site(r, path, line, 'f'));
});

test('independent Python: methods and comprehension bodies skip class namespace', () => {
  const r = analyze('python', {'scope.py': 'def target():\n return 1\nclass C:\n def target():\n  return 2\n def use(self):\n  return target()\n values=[target() for _ in items]\n'});
  for (const line of [7, 8]) assert.deepEqual(targetNames(r, site(r, 'scope.py', line, 'target')), ['scope.target']);
});

test('independent Python: qualified aliases and in-package imports preserve exact target', () => {
  const r = analyze('python', {'pkg/helpers.py': 'def target():\n return 1\n', 'pkg/main.py': 'from .helpers import target as imported\nalias=imported\nalias()\n'});
  assert.deepEqual(targetNames(r, site(r, 'pkg/main.py', 3, 'alias')), ['pkg.helpers.target']);
});

test('independent Python: renamed import of builtin exec invalidates callable bindings', () => {
  const r = analyze('python', {'main.py': 'from builtins import exec as run\ndef f():\n return 1\ndef g():\n return 2\nrun("f=g")\nf()\n'});
  noCertainTarget(r, site(r, 'main.py', 7, 'f'));
});

test('independent Python: decorator calls cannot borrow uninitialized definitions or imports', () => {
  const r = analyze('python', {
    'own.py': '@f()\ndef f():\n return 1\n',
    'pending.py': '@wrap()\ndef f():\n return 1\nfrom helpers import wrap\n',
    'helpers.py': 'def wrap():\n return lambda f: f\n',
  });
  noCertainTarget(r, site(r, 'own.py', 1, 'f'));
  noCertainTarget(r, site(r, 'pending.py', 1, 'wrap'));
});

test('independent Python: default expressions cannot see declarations inside the function body', () => {
  const r = analyze('python', {'main.py': 'def target():\n return 1\ndef run(x=target()):\n def target():\n  return 2\n return x\n'});
  assert.deepEqual(targetNames(r, site(r, 'main.py', 3, 'target')), ['main.target']);
});

test('independent Python: method defaults see initialized class locals but not later methods', () => {
  const r = analyze('python', {
    'available.py': 'class C:\n def target():\n  return 2\n def run(x=target()):\n  return x\n',
    'pending.py': 'class C:\n def run(x=target()):\n  return x\n def target():\n  return 1\n',
  });
  assert.deepEqual(targetNames(r, site(r, 'available.py', 4, 'target')), ['available.C.target']);
  noCertainTarget(r, site(r, 'pending.py', 2, 'target'));
});

test('independent JS: default parameter initializer uses outer scope, not function body declarations', () => {
  const r = analyze('javascript', {'scope.mjs': 'function target(){}\nfunction run(value=target()){function target(){} return value;}\nrun();'});
  assert.deepEqual(targetNames(r, site(r, 'scope.mjs', 2, 'target')), ['scope.mjs.target']);
});

test('independent JS: switch lexical declarations cannot leak outside the switch', () => {
  const r = analyze('javascript', {'scope.mjs': 'switch(key){case 0: const target=()=>{}; target(); break;}\ntarget();'});
  noCertainTarget(r, site(r, 'scope.mjs', 2, 'target'));
});

for (const [name, assignment] of [['array', '[...target]=list'], ['object', '({...target}=value)']]) {
  test(`independent JS: ${name} rest assignment invalidates callable binding`, () => {
    const r = analyze('javascript', {'scope.mjs': `function target(){}\n${assignment};\ntarget();`});
    noCertainTarget(r, site(r, 'scope.mjs', 3, 'target'));
  });
}

test('independent TypeScript: enum initializer mutation cannot leave a false certain target', () => {
  const r = analyze('javascript', {'scope.ts': 'export {};\nfunction target(){}\nenum E { X=(()=>{target=other;return 1;})() }\ntarget();'});
  noCertainTarget(r, site(r, 'scope.ts', 4, 'target'));
  assert.ok(r.callSites.some(c => c.source.line === 3), 'Runtime enum initializer call must remain in the observed callsite denominator');
});

test('independent JS: class binding is unavailable before its declaration completes', () => {
  const r = analyze('javascript', {'scope.mjs': 'new C();\nclass C{}'});
  noCertainTarget(r, site(r, 'scope.mjs', 1, 'C'));
});

test('independent JS: alias initializer cannot borrow a later lexical value', () => {
  const r = analyze('javascript', {'scope.mjs': 'const a=b;\nconst b=()=>{};\na();'});
  noCertainTarget(r, site(r, 'scope.mjs', 3, 'a'));
});

test('independent JS: captured static block mutation invalidates callable binding', () => {
  const r = analyze('javascript', {'scope.mjs': 'function target(){}\nclass C {static {target=other;}}\ntarget();'});
  noCertainTarget(r, site(r, 'scope.mjs', 3, 'target'));
});

test('independent JS: namespaces and external properties cannot substitute same-spelling lexical targets', () => {
  const r = analyze('javascript', {'scope.ts': 'export {};\nnamespace N {export function hidden(){}}\nhidden();\nN.hidden();'});
  for (const [line, expression] of [[3, 'hidden'], [4, 'N.hidden']]) noCertainTarget(r, site(r, 'scope.ts', line, expression));
});

for (const [name, path, middle] of [
  ['class heritage', 'scope.mjs', 'class C extends (target=other, Base) {}'],
  ['computed method name', 'scope.mjs', 'class C { [target=other]() {} }'],
  ['class decorator', 'scope.ts', '@((target=other), decorator) class C {}'],
  ['parameter destructuring default', 'scope.mjs', 'function run({x=(target=other)}) {}\nrun({});'],
  ['variable destructuring default', 'scope.mjs', 'const {x=(target=other)}=value;'],
]) {
  test(`independent JS: ${name} mutation must be visited`, () => {
    const content = `export {}; function target(){}\n${middle}\ntarget();`;
    const r = analyze('javascript', {[path]: content});
    noCertainTarget(r, site(r, path, content.split('\n').length, 'target'));
  });
}
