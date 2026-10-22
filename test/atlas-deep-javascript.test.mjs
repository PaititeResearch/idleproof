import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeJavaScript} from '../src/atlas-deep-javascript.mjs';
import {admitDeepResults} from '../src/atlas-deep.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function input(sources){return {identity:{snapshotId:'dwscan_'+'a'.repeat(64),repositoryId:'b'.repeat(64),tree:'c'.repeat(40),source:'HEAD'},files:Object.entries(sources).map(([path,content])=>({path,content,sourceSha256:hash(content)}))};}
const analyze=s=>analyzeJavaScript(input(s));
const targets=(r,c)=>c.targetIds.map(id=>r.nodes.find(n=>n.id===id)?.qualifiedName);
const sites=(r,expression)=>r.callSites.filter(c=>c.expression===expression);

test('JS: ESM aliases, named re-export, namespace and default import preserve exact target provenance',()=>{
  const r=analyze({'rules.ts':'export function adjusted(x: number) { return x * 2; }\nexport default function main() {}', 'barrel.ts':'export {adjusted as change} from "./rules";', 'service.ts':'import {change as apply} from "./barrel"; import * as rules from "./rules"; import main from "./rules"; export function process(value: number) { apply(value); rules.adjusted(value); main(); }'});
  assert.equal(r.callSites.length,3);assert.equal(r.coverage.resolved,3);
  assert.deepEqual(targets(r,sites(r,'apply')[0]),['rules.ts.adjusted']);assert.deepEqual(targets(r,sites(r,'rules.adjusted')[0]),['rules.ts.adjusted']);assert.deepEqual(targets(r,sites(r,'main')[0]),['rules.ts.main']);
  for(const c of r.callSites){assert.equal(c.source.path,'service.ts');assert.equal(c.source.providerVersion,'5.9.3');assert.ok(r.edges.some(e=>e.kind==='CALLS'&&e.callSiteId===c.id&&e.source===c.source));}
});
test('JS: recursion, nested lexical function, const closure, const alias and direct IIFE',()=>{
  const r=analyze({'a.mjs':'function recurse(){ recurse(); } function outer(){ function inner(){} inner(); } const arrow=()=>{}; const alias=arrow; alias(); (()=>{})();'});
  assert.equal(r.coverage.resolved,4);assert.deepEqual(targets(r,sites(r,'recurse')[0]),['a.mjs.recurse']);assert.deepEqual(targets(r,sites(r,'inner')[0]),['a.mjs.outer.inner']);assert.deepEqual(targets(r,sites(r,'alias')[0]),['a.mjs.arrow']);
});
test('JS: parameter, block, catch and loop shadowing prevent outer target substitution',()=>{
  const r=analyze({'a.mjs':'function target(){} function run(target){ target(); } { let target=unknown; target(); } try {} catch(target) {target();} for(let target of list){target();} target();'});
  const calls=sites(r,'target');assert.equal(calls.length,5);assert.equal(calls.filter(c=>c.status==='RESOLVED').length,1);assert.deepEqual(targets(r,calls.at(-1)),['a.mjs.target']);
});
test('JS: parameter initializers cannot see declarations in function body',()=>{
  const r=analyze({'a.mjs':'function target(){} function run(value=target()){function target(){} return value;} run();'});
  assert.deepEqual(targets(r,sites(r,'target')[0]),['a.mjs.target']);
});
test('JS: all captured assignments and mutable initializers withhold certain relations',()=>{
  const r=analyze({'a.mjs':'function f(){} function g(){} f(); if(flag) f=g; const alias=f; alias(); let mutable=g; mutable(); function run(){ [g]=list; } g();'});
  assert.equal(r.coverage.resolved,0);assert.ok(r.callSites.every(c=>c.targetIds.length===0));
});
test('JS: import live binding mutation invalidates imported target',()=>{
  const r=analyze({'a.mjs':'export function f(){}; f=other;', 'b.mjs':'import {f} from "./a.mjs"; f();'});assert.equal(sites(r,'f')[0].status,'UNKNOWN');
});
test('JS: type-only imports and exports never become runtime dependency or call edges',()=>{
  const r=analyze({'a.ts':'export function f(){}', 'barrel.ts':'export type {f} from "./a";', 'b.ts':'import type {f} from "./a"; f();', 'c.ts':'import {type f} from "./a"; f();', 'd.ts':'import {f} from "./barrel"; f();'});
  assert.equal(r.coverage.resolved,0);assert.equal(r.edges.filter(e=>e.kind==='TYPE_IMPORTS').length,2);assert.ok(!r.edges.some(e=>e.kind==='IMPORTS'&&['b.ts','c.ts'].includes(e.source.path)));
});
test('JS: computed dispatch, methods, callbacks and returned functions remain unknown',()=>{
  const r=analyze({'a.mjs':'function f(){} function factory(){return f;} const object={f}; object.f(); object["f"](); factory()(); function withCallback(cb){cb();} import("./b.mjs"); require("missing");'});
  assert.equal(sites(r,'object.f')[0].status,'UNKNOWN');assert.equal(sites(r,'object["f"]')[0].status,'UNKNOWN');assert.equal(sites(r,'factory()')[0].status,'UNKNOWN');assert.equal(sites(r,'cb')[0].status,'UNKNOWN');assert.equal(sites(r,'factory')[0].status,'RESOLVED');assert.ok(!r.edges.some(e=>e.kind==='CALLS'&&e.to===r.nodes.find(n=>n.qualifiedName==='a.mjs.f')?.id));
});
test('JS: ambiguous extension candidates and missing dependencies stay in denominator',()=>{
  const r=analyze({'a.ts':'export function f(){}', 'a.js':'export function f(){}', 'b.ts':'import {f} from "./a"; import {readFile} from "node:fs"; f(); readFile("x");'});
  assert.equal(r.coverage.callSites,2);assert.equal(r.coverage.resolved,0);assert.equal(sites(r,'f')[0].status,'UNKNOWN');assert.equal(sites(r,'readFile')[0].status,'EXTERNAL');
});
test('JS: simple class construction qualified, inheritance and decorators withheld',()=>{
  const r=analyze({'a.ts':'export class A{}; class B extends A{}; @replace class C{}; new A(); new B(); new C(); A();'});
  const calls=sites(r,'A');assert.equal(calls[0].status,'RESOLVED');assert.equal(calls[1].status,'UNKNOWN');assert.equal(sites(r,'B')[0].status,'UNKNOWN');assert.equal(sites(r,'C')[0].status,'UNKNOWN');
});
test('JS: malformed sources retain parse diagnostics and emit no semantic relations',()=>{
  const r=analyze({'bad.ts':'export function f( {', 'use.ts':'import {f} from "./bad"; f();'});assert.equal(r.coverage.syntaxErrorFiles.length,1);assert.equal(r.coverage.parsedFiles,1);assert.equal(sites(r,'f')[0].status,'UNKNOWN');assert.equal(r.nodes.filter(n=>n.path==='bad.ts').length,1);
});
test('JS: direct eval disables lexical resolution without executing it',()=>{
  const r=analyze({'a.mjs':'function f(){} eval("f=other"); f();'});assert.equal(r.coverage.resolved,0);assert.equal(r.callSites.length,2);
});
test('JS: shared scripts do not acquire assumed module/global semantics',()=>{
  const r=analyze({'script.js':'function f(){}; f();'});assert.equal(r.callSites[0].status,'UNKNOWN');assert.match(r.callSites[0].reason,/Shared-script/);
});
test('JS: namespace declarations cannot leak unqualified functions into outer scope',()=>{
  const r=analyze({'a.ts':'export {}; namespace NS { export function hidden(){} } hidden(); NS.hidden();'});assert.equal(r.coverage.resolved,0);
});
test('JS: preinitialization and cyclic aliases do not get certain targets',()=>{
  const r=analyze({'a.mjs':'early(); const early=()=>{}; const a=b; const b=a; a();'});assert.equal(r.coverage.resolved,0);
});
test('JS: identical snapshots are deterministic; source hashes and snapshot IDs change identity',()=>{
  const i=input({'a.mjs':'export function f(){}; f();'}),first=analyzeJavaScript(i),again=analyzeJavaScript(i);assert.deepEqual(first,again);assert.equal(admitDeepResults(i,[first]).graphDigest,admitDeepResults(i,[again]).graphDigest);
  const changed=input({'a.mjs':'export function f(){}; f();\n'});assert.notEqual(admitDeepResults(i,[first]).graphDigest,admitDeepResults(changed,[analyzeJavaScript(changed)]).graphDigest);
  const other=structuredClone(i);other.identity.snapshotId='dwscan_'+'d'.repeat(64);assert.notEqual(first.nodes[0].id,analyzeJavaScript(other).nodes[0].id);
});
test('JS: syntax observations do not claim runtime event, branch or value coverage',()=>{
  const r=analyze({'a.mjs':'export async function process(x){if(x){await external(x);} return x;} emitter.on("ready",process);'});
  assert.ok(r.edges.some(e=>e.kind==='AWAITS'));assert.ok(r.edges.some(e=>e.kind==='BRANCH'));assert.ok(r.edges.some(e=>e.kind==='PASSES_ARGUMENT'));assert.ok(r.edges.some(e=>e.kind==='RETURNS_TO'));assert.ok(!r.edges.some(e=>['EMITS','SUBSCRIBES','CONTROL_FLOW'].includes(e.kind)));assert.equal(r.capabilities.runtime,'UNSUPPORTED');assert.equal(r.coverage.semanticCompleteness,'UNKNOWN');
});
test('JS: bounds, invalid hashes, unsafe paths and duplicates are rejected',()=>{
  const i=input({'a.mjs':'export {};'});i.files[0].sourceSha256='0'.repeat(64);assert.throws(()=>analyzeJavaScript(i),/SOURCE_INVALID/);
  assert.throws(()=>analyzeJavaScript(input({'../a.mjs':'export {};'})),/SOURCE_INVALID/);
  assert.throws(()=>analyzeJavaScript(input({'a.mjs':'x'.repeat(262145)})),/BYTE_LIMIT/);
  const duplicate=input({'a.mjs':'export {};'});duplicate.files.push(duplicate.files[0]);assert.throws(()=>analyzeJavaScript(duplicate),/SOURCE_INVALID/);
});
test('JS: malicious target program and package scripts are only parsed, not executed',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-js-noexec-')),sentinel=path.join(dir,'MUST_NOT_EXIST');
  try {const r=analyze({'target.mjs':`import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(sentinel)},'bad'); throw new Error('target executed');`, 'package.json':'{"scripts":{"postinstall":"exit 99"}}'});assert.equal(fs.existsSync(sentinel),false);assert.equal(r.coverage.callSites,2);assert.equal(r.coverage.resolved,0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
