import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {admitDeepResults} from '../src/atlas-deep.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=process.env.IDLEPROOF_DEEP_PYTHON||(process.platform==='win32'?'python':'python3');
const hash=s=>createHash('sha256').update(s).digest('hex');
function input(files){return {identity:{snapshotId:'dwscan_'+'a'.repeat(64),tree:'b'.repeat(40),source:'HEAD',repositoryId:'c'.repeat(64)},files:Object.entries(files).map(([p,content])=>({path:p,content,sourceSha256:hash(content)})),coverage:{}};}
function run(files,options={}){const value=input(files),p=spawnSync(python,['-I',path.join(root,'src/atlas-deep-python.py')],{input:JSON.stringify(value),encoding:'utf8',timeout:20000,maxBuffer:12*1024*1024,...options});assert.equal(p.error,undefined,p.error?.message);assert.equal(p.status,0,p.stderr+' '+p.stdout);const result=JSON.parse(p.stdout);admitDeepResults(value,[result]);return result;}
const calls=(r,expression)=>r.callSites.filter(c=>c.expression===expression);
const target=(r,c)=>c.targetIds.map(id=>r.nodes.find(n=>n.id===id)?.qualifiedName);
const certain=r=>r.edges.filter(e=>e.kind==='CALLS');

test('Python manually specified sixteen-site synthetic reference: every site and exact target, no hidden denominator',()=>{
 const dir=path.join(root,'test/fixtures/atlas-deep/python/qualified'),expected=JSON.parse(fs.readFileSync(path.join(dir,'expected.json'),'utf8'));
 const files=Object.fromEntries(fs.readdirSync(dir).filter(f=>f.endsWith('.py')).map(f=>[f,fs.readFileSync(path.join(dir,f),'utf8')]));
 const r=run(files),actual=r.callSites.map(c=>[c.source.path,c.source.line,c.expression,c.status,target(r,c)[0]||null]);
 assert.deepEqual(actual.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),expected.calls.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 assert.equal(r.callSites.length,16);assert.equal(certain(r).length,9);assert.equal(r.coverage.resolvedCalls,9);assert.equal(r.coverage.externalCalls,5);assert.equal(r.coverage.unresolvedCalls,2);
 assert.equal(r.coverage.semanticCompleteness,'UNKNOWN');assert.equal(r.coverage.complete,false);
});

test('Python direct aliases, explicit module imports, relative imports and recursive lexical targets',()=>{
 const r=run({'pkg/__init__.py':'','pkg/rules.py':'def adjusted(v):\n    return v\n','pkg/service.py':'from .rules import adjusted as tune\nimport pkg.rules as rules\nimport pkg.rules\ndef process(v):\n    alias = tune\n    return alias(v) + rules.adjusted(v) + pkg.rules.adjusted(v)\ndef recurse(v):\n    return recurse(v - 1) if v else v\n'});
 for(const name of ['alias','rules.adjusted','pkg.rules.adjusted'])assert.deepEqual(target(r,calls(r,name)[0]),['pkg.rules.adjusted']);
 assert.deepEqual(target(r,calls(r,'recurse')[0]),['pkg.service.recurse']);
});

test('Python closures resolve unique nested defs and preserve shadowing, free references and parameters',()=>{
 const r=run({'app.py':'def target(x):\n    return x\ndef outer(x):\n    def target(y):\n        return x + y\n    return target(x)\ndef shadow(target):\n    return target(1)\ndef later_local():\n    target(1)\n    target = 2\n'});
 const c=calls(r,'target');assert.equal(c.length,3);assert.deepEqual(c.map(x=>x.status).sort(),['RESOLVED','UNKNOWN','UNKNOWN']);
 assert.deepEqual(target(r,c.find(x=>x.status==='RESOLVED')),['app.outer.target']);
 assert.ok(r.edges.some(e=>e.kind==='CAPTURES'));
});

test('Python conditional, duplicate and reassigned bindings never receive certain CALLS',()=>{
 const r=run({'app.py':'def target():\n    return 1\nif flag:\n    def choose():\n        return 2\nelse:\n    def choose():\n        return 3\ndef main():\n    target = other\n    target()\n    choose()\n'});
 assert.equal(certain(r).length,0);assert.equal(calls(r,'choose')[0].status,'AMBIGUOUS');assert.equal(calls(r,'choose')[0].targetIds.length,2);
 assert.ok(r.edges.filter(e=>e.kind==='MAY_CALL').every(e=>e.authority==='POSSIBLE'));
});

test('Python unknown decorators, dynamic imports/getattr, monkey patches and higher-order functions stay uncertain',()=>{
 const r=run({'app.py':'def wrap(f):\n    return f\n@wrap\ndef target():\n    return 1\ndef main(callback, object):\n    target()\n    callback()\n    getattr(object, name)()\n    return factory()()\n'});
 assert.equal(certain(r).length,0);assert.equal(calls(r,'target')[0].status,'AMBIGUOUS');assert.equal(calls(r,'callback')[0].status,'UNKNOWN');
 const patch=run({'a.py':'def target():\n    return 1\n','b.py':'import a\na.target = replacement\ndef use():\n    return a.target()\n'});assert.equal(certain(patch).length,0);
 const dynamic=run({'a.py':'def target():\n    return 1\ndef use():\n    exec(code)\n    return target()\n'});assert.equal(certain(dynamic).length,0);
});

test('Python plain class direct methods resolved; constructors labeled binding only; instance/inherited dispatch uncertain',()=>{
 const r=run({'app.py':'class Plain:\n    def ordinary(self, v):\n        return v\n    @staticmethod\n    def stat(v):\n        return v\n    @classmethod\n    def cls(cls, v):\n        return v\nclass Child(Plain):\n    pass\ndef use(obj):\n    Plain()\n    Plain.ordinary(obj, 1)\n    Plain.stat(1)\n    Plain.cls(1)\n    obj.ordinary(1)\n    Child.stat(1)\n'});
 for(const name of ['Plain','Plain.ordinary','Plain.stat','Plain.cls'])assert.equal(calls(r,name)[0].status,'RESOLVED',name);
 for(const name of ['obj.ordinary','Child.stat'])assert.notEqual(calls(r,name)[0].status,'RESOLVED',name);
 assert.match(calls(r,'Plain')[0].reason,/constructor dispatch is not resolved/);
});

test('Python comprehension/exception/match/local binders shadow same-named functions',()=>{
 const r=run({'app.py':'def target():\n    return 1\ndef use(callbacks, value):\n    result = [target() for target in callbacks]\n    try:\n        pass\n    except Exception as target:\n        target()\n    match value:\n        case {"callback": selected}:\n            selected()\n'});
 assert.equal(certain(r).length,0);assert.equal(calls(r,'target').length,2);assert.ok(calls(r,'target').every(c=>c.status==='UNKNOWN'));
});

test('Python no sibling-method lookup, no name similarity lookup, no source-root guessing or external resolution',()=>{
 const r=run({'src/rules.py':'def adjust():\n    return 1\n','service.py':'from rules import adjust\nclass A:\n    def method(self):\n        return 1\n    def use(self):\n        return method()\ndef use():\n    return adjust()\n'});
 assert.equal(certain(r).length,0);assert.ok(r.callSites.every(c=>c.status==='EXTERNAL'));
});

test('Python syntactic branch, loop, return and argument flow preserve exact scopes and disclose gaps',()=>{
 const r=run({'app.py':'def adjust(v):\n    return v * 2\ndef process(raw):\n    value = raw + 1\n    if value > 5:\n        return adjust(value)\n    while value < 3:\n        value += 1\n        if value == 2:\n            break\n    try:\n        return adjust(raw)\n    finally:\n        pass\n    return raw\n'});
 assert.ok(r.edges.some(e=>e.kind==='CONTROL_FLOW'&&e.branch==='true'));assert.ok(r.edges.some(e=>e.kind==='CONTROL_FLOW'&&e.branch==='loop-body'));
 assert.ok(r.edges.some(e=>e.kind==='PASSES_ARGUMENT'));assert.ok(r.edges.some(e=>e.kind==='READS'));assert.ok(r.edges.some(e=>e.kind==='WRITES'));
 assert.equal(r.coverage.unsupportedControlStatements,1);assert.ok(r.edges.some(e=>e.kind==='CONTROL_FLOW'&&e.authority==='POSSIBLE'));
 assert.equal(r.capabilities.controlFlow,'NORMAL_SYNTAX_PARTIAL');
});

test('Python source identities deterministic, same-name scopes distinct, UTF-8 byte spans admitted',()=>{
 const files={'é.py':'def café(entrée):\n    return entrée\ndef one():\n    def same():\n        return café(1)\n    return same()\ndef two():\n    def same():\n        return café(2)\n    return same()\n'};
 const a=run(files),b=run(files);delete a.metrics;delete b.metrics;assert.deepEqual(a,b);
 const targets=calls(a,'same').map(c=>c.targetIds[0]);assert.equal(new Set(targets).size,2);
 assert.equal(new Set(a.nodes.map(n=>n.id)).size,a.nodes.length);
});

test('Python malformed source remains explicitly unsupported while other files still analyzed',()=>{
 const r=run({'bad.py':'def x(:\n','good.py':'def f():\n    return 1\ndef main():\n    return f()\n'});
 assert.equal(r.status,'PARTIAL');assert.equal(r.coverage.syntaxErrors.length,1);assert.equal(r.coverage.parsedFiles,1);assert.equal(certain(r).length,1);
});

test('Python never imports or executes source even when statements would write files',t=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-python-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 const r=run({'danger.py':'from pathlib import Path\nPath("MUST_NOT_EXIST").write_text("executed")\nraise RuntimeError("must not run")\n'}, {cwd});
 assert.equal(fs.existsSync(path.join(cwd,'MUST_NOT_EXIST')),false);assert.equal(r.callSites.length,3);
});

test('Python provider rejects mismatched content identity, duplicate paths and oversized files',()=>{
 for(const modify of [p=>p.files[0].sourceSha256='0'.repeat(64),p=>p.files.push(p.files[0]),p=>{p.files[0].content='x'.repeat(262145);p.files[0].sourceSha256=hash(p.files[0].content);}]){
  const p=input({'a.py':'pass\n'});modify(p);const r=spawnSync(python,['-I',path.join(root,'src/atlas-deep-python.py')],{input:JSON.stringify(p),encoding:'utf8'});assert.equal(r.status,2);assert.match(JSON.parse(r.stdout).error,/^ATLAS_DEEP_PYTHON_/);
 }
});
