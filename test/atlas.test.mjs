import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {buildAtlas,projectAtlas,emptyOverlay,mergeAtlas,exportMermaid,digest} from '../src/atlas-graph.mjs';
import {readAtlasOverlay,saveAtlasOverlay,validateOverlay,atlasHistory,atlasRevision} from '../src/atlas-store.mjs';
import {atlasApi} from '../src/atlas-api.mjs';
import {createServer} from '../src/server.mjs';
import {atlasFixtureModel,tempAtlasFixture,writeAtlasFixture} from '../scripts/atlas-fixture.mjs';
const uid=n=>'user_'+String(n).padStart(16,'0');
const fixture=t=>{const f=tempAtlasFixture();t.after(f.close);return {...f,graph:buildAtlas(f.model)};};
const request=(g,overlay,expectedRevision=null)=>({snapshotId:g.identity.snapshotId,graphDigest:g.graphDigest,expectedRevision,overlay});
const url=q=>new URL('http://127.0.0.1/api/atlas'+(q?'?'+q:''));

test('atlas retains file/symbol provenance and treats imports as static inferred candidates',()=>{
  const g=buildAtlas(atlasFixtureModel());assert.equal(g.nodes.length,9);assert.equal(g.edges.length,8);assert.equal(g.proof,'UNKNOWN');
  for(const n of g.nodes){assert.equal(n.origin,'core-scan');assert.equal(n.authority,'OBSERVED');assert.equal(n.source.snapshotId,g.identity.snapshotId);assert.match(n.source.sourceSha256,/^[a-f0-9]{64}$/);}
  for(const e of g.edges.filter(e=>e.kind==='imports')){assert.equal(e.authority,'INFERRED');assert.equal(e.resolution,'unique-static-candidate');}
  assert.equal(g.capabilities.automaticInheritance,false);assert.equal(g.capabilities.executionTraces,false);
});
test('class view preserves lexical members without inventing inheritance or calls',()=>{
  const model=atlasFixtureModel();model.files[0].extraction.calls=[{name:'dynamic.run',line:4,epistemic_status:'INFERRED'}];
  const g=buildAtlas(model),v=projectAtlas(g,emptyOverlay(),{view:'classes'});
  assert.equal(v.nodes.length,3);assert.equal(v.nodes[0].members.length,1);assert.equal(v.edges.length,0);
  assert.equal(g.coverage.unresolvedCalls,1);assert.equal(g.unresolved[0].name,'dynamic.run');assert.equal(g.edges.filter(e=>e.kind==='calls').length,0);
});
test('ambiguous, missing and omitted targets stay unresolved, even if a plausible file exists',()=>{
  const m=atlasFixtureModel();m.edges[0].resolution='ambiguous';m.edges.push({...m.edges[1],id:'extra',to:null,reference:'dynamic_target',resolution:'unresolved'});
  const g=buildAtlas(m);assert.equal(g.coverage.ambiguousImports,1);assert.equal(g.coverage.unresolvedImports,1);
  assert.equal(g.nodes.filter(n=>n.kind==='unresolved').length,2);assert.equal(g.edges.filter(n=>n.kind==='imports').length,1);
});
test('reordering input does not change graph identity or content',()=>{
  const m=atlasFixtureModel(),g=buildAtlas(m);m.files.reverse();m.edges.reverse();for(const f of m.files)f.extraction.symbols.reverse();
  assert.deepEqual(buildAtlas(m),g);
});
test('same-named symbols in distinct files and distinct scopes do not collapse',()=>{
  const m=atlasFixtureModel();m.files.forEach(f=>f.extraction.symbols[0].qualified_name='same.Class');
  const g=buildAtlas(m);assert.equal(new Set(g.nodes.map(n=>n.id)).size,g.nodes.length);assert.equal(g.nodes.filter(n=>n.label==='same.Class').length,3);
});
test('duplicate file paths, unsafe source identities, and malformed symbols cannot become facts',()=>{
  const m=atlasFixtureModel();m.files.push(m.files[0]);assert.throws(()=>buildAtlas(m),/ATLAS_DUPLICATE_FILE/);
  const n=atlasFixtureModel();n.files[0].extraction.symbols[0].epistemic_status='VERIFIED';n.files[1].path='../outside';
  const g=buildAtlas(n);assert.equal(g.coverage.invalidFacts>0,true);assert.equal(g.nodes.some(n=>n.path==='../outside'),false);
});
test('large graph projection is bounded and exposes hidden boundary relationships',()=>{
  const g=buildAtlas(atlasFixtureModel({count:1000})),v=projectAtlas(g,emptyOverlay());
  assert.equal(v.nodes.length,200);assert.equal(v.projection.matchedNodes,1000);assert.equal(v.projection.hasMore,true);assert.equal(v.edges.length<=800,true);assert.equal(v.projection.boundaryRelations>0,true);
});
test('hard graph bounds disclose truncation rather than imply complete coverage',()=>{
  const g=buildAtlas(atlasFixtureModel({count:4000}));assert.equal(g.nodes.length,6000);assert.ok(g.coverage.nodeOverflow>0);assert.equal(g.coverage.complete,false);
});
test('focus, search and pagination have bounded validated scopes',()=>{
  const g=buildAtlas(atlasFixtureModel()),o=emptyOverlay(),id=g.nodes.find(n=>n.path==='src/pricing.py'&&n.kind==='module').id;
  const v=projectAtlas(g,o,{focus:id,depth:1});assert.equal(v.nodes.length,3);
  assert.equal(projectAtlas(g,o,{query:'pricing'}).nodes.length,1);
  assert.throws(()=>projectAtlas(g,o,{offset:-1}),/ATLAS_SCOPE/);assert.throws(()=>projectAtlas(g,o,{depth:100}),/ATLAS_SCOPE/);assert.throws(()=>projectAtlas(g,o,{focus:'unknown_1'}),/ATLAS_NODE/);
});
test('user edits never mutate extracted graph, authority, or source identity',t=>{
  const {graph:g}=fixture(t),before=JSON.stringify(g),o=emptyOverlay(),n=g.nodes[0];
  o.aliases=[{id:n.id,label:'A friendly title'}];o.notes=[{id:n.id,text:'An architectural hypothesis'}];o.positions=[{id:n.id,x:20,y:30}];
  o.nodes=[{id:uid(1),kind:'class',label:'Planned policy',members:['+ validate(input)']}];o.edges=[{id:uid(2),from:uid(1),to:n.id,kind:'dependency',label:'planned only'}];
  const m=mergeAtlas(g,validateOverlay(o,g));assert.equal(JSON.stringify(g),before);assert.equal(m.nodes.find(x=>x.id===n.id).label,n.label);assert.equal(m.nodes.find(x=>x.id===n.id).displayLabel,'A friendly title');assert.equal(m.nodes.at(-1).authority,'DECLARED');assert.equal(m.edges.at(-1).authority,'DECLARED');
});
test('overlay rejects attempts to inject proof, source changes, arbitrary edges or nonfinite layout',t=>{
  const {graph:g}=fixture(t),n=g.nodes[0];
  for(const bad of [
    {...emptyOverlay(),proof:'VERIFIED'},
    {...emptyOverlay(),nodes:[{id:uid(1),kind:'class',label:'x',members:[],authority:'OBSERVED'}]},
    {...emptyOverlay(),positions:[{id:n.id,x:Infinity,y:0}]},
    {...emptyOverlay(),positions:[{id:n.id,x:0,y:0,source:'new'}]},
    {...emptyOverlay(),hidden:['foreign_123']},
    {...emptyOverlay(),edges:[{id:uid(2),from:n.id,to:uid(1),kind:'dependency',label:'x'}]}
  ])assert.throws(()=>validateOverlay(bad,g),/ATLAS_OVERLAY/);
});
test('new model view is read-only on first load; no state directory is created',t=>{
  const {cwd,graph:g}=fixture(t);assert.equal(readAtlasOverlay(cwd,g).revision,null);assert.equal(fs.existsSync(path.join(cwd,'.idleproof','atlas')),false);
});
test('save/reload, unchanged idempotent save, history, reset and conflict preserve exact revisions',t=>{
  const {cwd,graph:g}=fixture(t),o=emptyOverlay();o.notes=[{id:g.nodes[0].id,text:'Review this boundary'}];
  const one=saveAtlasOverlay(cwd,g,request(g,o));assert.equal(one.sequence,1);assert.deepEqual(readAtlasOverlay(cwd,g),one);
  assert.equal(saveAtlasOverlay(cwd,g,request(g,o,one.revision)).revision,one.revision);
  assert.throws(()=>saveAtlasOverlay(cwd,g,request(g,emptyOverlay(),null)),/ATLAS_CONFLICT/);
  const two=saveAtlasOverlay(cwd,g,request(g,emptyOverlay(),one.revision));assert.equal(two.previous,one.revision);assert.equal(atlasHistory(cwd,g).revisions.length,2);
  assert.deepEqual(atlasRevision(cwd,g,one.revision).overlay,o);assert.equal(readAtlasOverlay(cwd,g).sequence,2);
});
test('edits bind to exact snapshot and graph digest; prior snapshots are never silently carried forward',t=>{
  const {cwd,graph:g}=fixture(t),o=emptyOverlay();o.hidden=[g.nodes[0].id];
  saveAtlasOverlay(cwd,g,request(g,o));const g2=buildAtlas(atlasFixtureModel({tag:'b'}));
  assert.equal(readAtlasOverlay(cwd,g2).revision,null);
  assert.throws(()=>saveAtlasOverlay(cwd,g2,request(g,o)),/ATLAS_STALE/);
});
test('corrupt revisions fail closed rather than displaying changed annotations as authentic',t=>{
  const {cwd,graph:g}=fixture(t),o=emptyOverlay();o.notes=[{id:g.nodes[0].id,text:'original'}];const r=saveAtlasOverlay(cwd,g,request(g,o));
  const file=path.join(cwd,'.idleproof','atlas',r.revision+'.json'),data=JSON.parse(fs.readFileSync(file));data.overlay.notes[0].text='changed';fs.writeFileSync(file,JSON.stringify(data));
  assert.throws(()=>readAtlasOverlay(cwd,g),/ATLAS_HISTORY_INVALID/);
});
test('symlink storage and publicly readable revision files are refused', {skip:process.platform==='win32'},t=>{
  const {cwd,graph:g}=fixture(t);const outside=path.join(cwd,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(cwd,'.idleproof','atlas'),'dir');
  assert.throws(()=>readAtlasOverlay(cwd,g),/ATLAS_STORAGE_UNSAFE/);assert.throws(()=>saveAtlasOverlay(cwd,g,request(g,emptyOverlay())),/ATLAS_STORAGE_UNSAFE/);
  fs.unlinkSync(path.join(cwd,'.idleproof','atlas'));const o=emptyOverlay();o.hidden=[g.nodes[0].id];const r=saveAtlasOverlay(cwd,g,request(g,o));fs.chmodSync(path.join(cwd,'.idleproof','atlas',r.revision+'.json'),0o644);assert.throws(()=>readAtlasOverlay(cwd,g),/ATLAS_STORAGE_UNSAFE/);
});
test('UML export labels manual relationships as declared and strips executable diagram syntax',()=>{
  const g=buildAtlas(atlasFixtureModel()),o=emptyOverlay();o.nodes=[{id:uid(1),kind:'class',label:'<script>alert(1)</script>"\nclick hack',members:['x\n%%{init: javascript}%%']},{id:uid(2),kind:'class',label:'Base',members:[]}];
  o.edges=[{id:uid(3),from:uid(1),to:uid(2),kind:'generalization',label:'hypothesis'}];validateOverlay(o,g);
  const s=exportMermaid(g,o,{view:'classes'});assert.match(s,/classDiagram/);assert.match(s,/DECLARED hypothesis/);assert.match(s,/<\|--/);assert.doesNotMatch(s,/<script>|%%\{|\nclick /);
});
test('no scan is reported explicitly; malformed API scopes rejected',async t=>{
  const f=tempAtlasFixture();t.after(f.close);fs.rmSync(path.join(f.cwd,'.idleproof','project-scans'),{recursive:true});
  const data=await atlasApi(f.cwd,{method:'GET'},url());assert.equal(data.status,'NO_SCAN');
  await assert.rejects(atlasApi(f.cwd,{method:'GET'},url('source=../')),/ATLAS_SCOPE_INVALID/);
});
test('HTTP feature is opt-in; foreign-origin editing denied; existing health stays functional',async t=>{
  const {cwd}=fixture(t),off=await createServer({cwd,port:0,experimentalAtlas:false});
  t.after(()=>new Promise(resolve=>off.server.close(resolve)));assert.equal((await fetch(off.url+'/api/atlas')).status,404);assert.equal((await fetch(off.url+'/atlas.html')).status,404);assert.equal((await fetch(off.url+'/api/health')).status,200);
  const on=await createServer({cwd,port:0,experimentalAtlas:true});t.after(()=>new Promise(resolve=>on.server.close(resolve)));
  const data=await (await fetch(on.url+'/api/atlas')).json();assert.equal(data.status,'READY');
  const response=await fetch(on.url+'/api/atlas',{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{}'});assert.notEqual(response.status,200);
  const bad=await fetch(on.url+'/api/atlas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',source:'HEAD',...request({identity:data.identity,graphDigest:data.graphDigest},data.overlay,'b'.repeat(64))})});assert.equal(bad.status,409);
});
test('graph generation benchmark records a bounded 1000-file projection without claiming a user latency',()=>{
  const m=atlasFixtureModel({count:1000});const begin=performance.now();const g=buildAtlas(m);const v=projectAtlas(g,emptyOverlay());const elapsed=performance.now()-begin;
  assert.equal(g.nodes.length,3000);assert.equal(v.nodes.length,200);assert.ok(elapsed<5000,'bounded local machine safety threshold');console.log(JSON.stringify({benchmark:'atlas-1000-files',files:1000,nodes:g.nodes.length,edges:g.edges.length,elapsedMs:elapsed,classification:'MACHINE',human:false}));
});

test('saving atlas edits preserves all existing BYOK, proof, Core and policy files byte-for-byte',t=>{
  const {cwd,graph:g}=fixture(t);const files=['.idleproof/byok/meter.json','.idleproof/policy.json','.diffwitness/journal.jsonl','.idleproof/receipt.json'];
  for(const name of files){fs.mkdirSync(path.dirname(path.join(cwd,name)),{recursive:true});fs.writeFileSync(path.join(cwd,name),'SYNTHETIC_PROTECTED_'+name);}
  const before=files.map(name=>fs.readFileSync(path.join(cwd,name),'utf8'));const o=emptyOverlay();o.notes=[{id:g.nodes[0].id,text:'source annotation'}];saveAtlasOverlay(cwd,g,request(g,o));
  assert.deepEqual(files.map(name=>fs.readFileSync(path.join(cwd,name),'utf8')),before);
});
test('overlay data and excessive input cannot escape request and storage budgets',async t=>{
  const {cwd,graph:g}=fixture(t),o=emptyOverlay();o.notes=[{id:g.nodes[0].id,text:'x'.repeat(2001)}];assert.throws(()=>validateOverlay(o,g),/ATLAS_OVERLAY_INVALID/);
  const app=await createServer({cwd,port:0,experimentalAtlas:true});t.after(()=>new Promise(r=>app.server.close(r)));
  const r=await fetch(app.url+'/api/atlas',{method:'POST',headers:{'content-type':'application/json'},body:' '.repeat(100001)});assert.equal(r.status,400);assert.equal((await r.json()).error,'ATLAS_REQUEST_TOO_LARGE');
  assert.equal(fs.existsSync(path.join(cwd,'.idleproof','atlas')),false);
});
