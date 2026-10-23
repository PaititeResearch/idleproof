// Synthetic contract records are fabricated, not observed runtime qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runtimeFixture,runtimeAvailability,runRuntimeFixture,buildRuntimeDemo,validateRuntimeTrace,reconcileRuntime,RUNTIME_SCHEMA} from '../src/atlas-deep-runtime.mjs';

function records() {
  const f=runtimeFixture(),a=f.files.find(x=>x.path==='service.py'),b=f.files.find(x=>x.path==='rules.py');
  const from={path:a.path,sourceSha256:a.sourceSha256,line:2,qualifiedName:'process',kind:'function'},to={path:b.path,sourceSha256:b.sourceSha256,line:1,qualifiedName:'adjusted',kind:'function'};
  const site={path:a.path,sourceSha256:a.sourceSha256,line:3};
  const trace={schema:RUNTIME_SCHEMA,kind:'OBSERVED_RUNTIME',proof:'UNKNOWN',status:'COMPLETED',sessionId:'00000000-0000-4000-8000-000000000001',identity:f.identity,provider:{name:'atlas-python-sys-settrace',version:'1'},sources:f.files.map(({path,sourceSha256})=>({path,sourceSha256})),events:[
    {sequence:0,event:'CALL',atNs:0,invocation:0,function:from,caller:null,callSite:null},
    {sequence:1,event:'CALL',atNs:10,invocation:1,function:to,caller:from,callSite:site},
    {sequence:2,event:'RETURN',atNs:15,invocation:1,durationNs:5,function:to,caller:from,callSite:site},
    {sequence:3,event:'RETURN',atNs:20,invocation:0,durationNs:20,function:from,caller:null,callSite:null}
  ]};
  const source=r=>({...r,snapshotId:f.identity.snapshotId});
  const nodes=[{id:'fn_process',kind:'function',source:source(from)},{id:'fn_adjusted',kind:'function',source:source(to)},...f.files.map(x=>({id:x.path,kind:'module',source:source({...x,line:100})}))];
  const graph={identity:f.identity,nodes,edges:[{id:'edge_call',kind:'CALLS',from:'fn_process',to:'fn_adjusted',source:source(site)}]};
  return {f,trace,graph};
}

test('runtime fixture is fixed and deterministic with no caller-supplied entrypoint',()=>{
  const a=runtimeFixture(),b=runtimeFixture();assert.deepEqual(a,b);assert.equal(a.identity.source,'SYNTHETIC');assert.equal(a.files.length,3);a.files[0].content='changed';assert.notEqual(runtimeFixture().files[0].content,'changed');
});
test('admissible fabricated records preserve exact call order and unknown Proof',()=>{
  const {trace}=records();assert.equal(validateRuntimeTrace(trace),trace);assert.equal(trace.proof,'UNKNOWN');
});
test('reconciliation matches immutable identities and callsite, preserves unobserved relations',()=>{
  const {trace,graph}=records();graph.edges.push({...graph.edges[0],id:'unseen',source:{...graph.edges[0].source,line:99}});
  const result=reconcileRuntime(graph,trace);assert.equal(result.observed[0].status,'STATIC_DETERMINED_OBSERVED');assert.equal(result.observed[0].edgeId,'edge_call');assert.equal(result.staticRelations[1].status,'NOT_OBSERVED_IN_SESSION');assert.equal(result.coverage.complete,false);assert.equal(result.unresolved.length,1);
});
test('possible static target observed in one session retains its possible static meaning',()=>{
  const {trace,graph}=records();graph.edges[0].kind='MAY_CALL';assert.equal(reconcileRuntime(graph,trace).observed[0].status,'STATIC_POSSIBLE_OBSERVED');assert.equal(graph.edges[0].kind,'MAY_CALL');
});
test('dynamic target not resolved statically is kept distinct',()=>{
  const {trace,graph}=records();graph.edges=[];const r=reconcileRuntime(graph,trace);assert.equal(r.observed[0].status,'DYNAMIC_OBSERVED_STATIC_UNRESOLVED');assert.equal(r.observed[0].edgeId,null);
});
test('same-line duplicate callsites and function identities cannot be guessed',()=>{
  const {trace,graph}=records();graph.edges.push({...graph.edges[0],id:'second'});assert.equal(reconcileRuntime(graph,trace).unresolved[1].reason,'CALLSITE_AMBIGUOUS');
  graph.nodes.push({...graph.nodes[0],id:'duplicate'});assert.equal(reconcileRuntime(graph,trace).observed.length,0);
});
test('mismatched snapshot, tree, repository, hash and node snapshot are rejected',()=>{
  for(const key of ['snapshotId','tree','source','repositoryId']){const {trace,graph}=records();graph.identity={...graph.identity,[key]:'different'};assert.throws(()=>reconcileRuntime(graph,trace),/STALE/);}
  const {trace,graph}=records();graph.nodes[0].source.sourceSha256='c'.repeat(64);assert.throws(()=>reconcileRuntime(graph,trace),/MISMATCH|INVALID/);
  const r=records();r.graph.nodes[0].source.snapshotId='dwscan_'+'e'.repeat(64);assert.throws(()=>reconcileRuntime(r.graph,r.trace),/GRAPH_INVALID/);
});
test('trace cannot inject raw values in events or nested source references',()=>{
  for(const field of ['arguments','locals','returnValue','exceptionMessage','requestBody']){const {trace}=records();trace.events[0][field]='SECRET';assert.throws(()=>validateRuntimeTrace(trace),/SENSITIVE_FIELDS/);}
  const {trace}=records();trace.events[0].function.locals='SECRET';assert.throws(()=>validateRuntimeTrace(trace),/EVENT_INVALID/);
});
test('malformed sequence, monotonic time, invocation, source path, oversized record rejected',()=>{
  const mutations=[t=>t.events[1].sequence=99,t=>t.events[2].atNs=1,t=>t.events[2].invocation=99,t=>t.events[1].callSite.path='../service.py',t=>t.events[2].durationNs=10000,t=>t.events[0].function.sourceSha256='x'.repeat(64),t=>t.extra='x'.repeat(1048576)];
  for(const mutate of mutations){const {trace}=records();mutate(trace);assert.throws(()=>validateRuntimeTrace(trace),/ATLAS_RUNTIME_/);}
});
test('synthetic examples and asserted Proof cannot enter observed reconciliation',()=>{
  const {trace}=records();trace.kind='SYNTHETIC_EXAMPLE';assert.throws(()=>validateRuntimeTrace(trace),/INVALID/);trace.kind='OBSERVED_RUNTIME';trace.proof='VERIFIED';assert.throws(()=>validateRuntimeTrace(trace),/INVALID/);
});
test('exception event and return event do not claim a successful return value',()=>{
  const {trace}=records();trace.events.splice(2,0,{...trace.events[2],event:'EXCEPTION',atNs:12,durationNs:2});trace.events.forEach((e,i)=>e.sequence=i);assert.doesNotThrow(()=>validateRuntimeTrace(trace));assert.ok(trace.events.every(e=>!('returnValue'in e)));
});
test('cancelled qualification never launches a fixture and cleans temporary files',async()=>{
  const before=new Set(fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith('atlas-runtime-')));const controller=new AbortController();controller.abort();
  const a=await runtimeAvailability({signal:controller.signal}),r=await runRuntimeFixture({signal:controller.signal});assert.equal(a.status,'UNAVAILABLE');assert.equal(r.status,'UNAVAILABLE');assert.equal(r.executed,false);
  const after=fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith('atlas-runtime-')&&!before.has(n));assert.deepEqual(after,[]);
});
test('real isolation probe is explicit; no fixture execution is part of this test',async t=>{
  const result=await runtimeAvailability();assert.ok(['AVAILABLE','UNAVAILABLE'].includes(result.status));assert.equal(result.executed,false);t.diagnostic(JSON.stringify({status:result.status,reason:result.reason||null}));
});

test('definition on module first line is distinct from the module frame',()=>{
  const {trace,graph}=records();const first=graph.nodes[1].source;graph.nodes.push({id:'module_rules',kind:'module',source:{...first}});
  assert.equal(reconcileRuntime(graph,trace).observed[0].to,'fn_adjusted');
});
test('completed session cannot omit final returns',()=>{
  const {trace}=records();trace.events.pop();assert.throws(()=>validateRuntimeTrace(trace),/INCOMPLETE/);trace.status='INTERRUPTED';assert.doesNotThrow(()=>validateRuntimeTrace(trace));
});
test('end-to-end demo cancelled before isolation produces no graph or observation',async()=>{
  const c=new AbortController();c.abort();const r=await buildRuntimeDemo({signal:c.signal});assert.equal(r.executed,false);assert.equal(r.status,'UNAVAILABLE');assert.equal(r.graph,undefined);assert.equal(r.trace,undefined);
});
