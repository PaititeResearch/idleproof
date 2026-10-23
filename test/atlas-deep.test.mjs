import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {capturedDeepInput,admitDeepResults,projectDeep} from '../src/atlas-deep.mjs';
import {boundedProcess} from '../src/atlas-deep-process.mjs';
import {createServer} from '../src/server.mjs';
import {atlasDeepApi,cancelAtlasDeep} from '../src/atlas-deep-api.mjs';
import {writeAtlasFixture} from '../scripts/atlas-fixture.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-boundary-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();git('init','-q');git('config','user.name','Deep fixture');git('config','user.email','fixture@example.invalid');git('config','core.autocrlf','false');
  const content='def target(value):\n    return value\ndef caller():\n    return target(1)\n';fs.writeFileSync(path.join(cwd,'service.py'),content);fs.writeFileSync(path.join(cwd,'excluded.py'),'raise RuntimeError("not selected")\n');git('add','.');git('commit','-qm','fixture');
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId:'dwscan_'+hash(content),tree:git('rev-parse','HEAD^{tree}'),source:'HEAD',profile:{syntheticFixture:true},coverage:{inventoryEntries:2,read:1}},files:[{path:'service.py',sourceSha256:hash(content),role:'production',extraction:{parsed:true,symbols:[],calls:[]}}],edges:[]};writeAtlasFixture(cwd,model);return {cwd,model,content,git};
}
test('deep boundary: only admitted immutable regular Git blobs, worktree changes ignored',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.cwd,'service.py'),'throw live file\n');const input=await capturedDeepInput(f.cwd,f.model);assert.equal(input.files.length,1);assert.equal(input.files[0].content,f.content);assert.equal(input.coverage.inventory.inventoryEntries,2);assert.equal(fs.existsSync(path.join(f.cwd,'not selected')),false);
  await assert.rejects(capturedDeepInput(f.cwd,{...f.model,header:{...f.model.header,source:'WORKTREE',tree:null}}),/WORKTREE_UNSUPPORTED/);
  await assert.rejects(capturedDeepInput(f.cwd,{...f.model,files:[{...f.model.files[0],sourceSha256:'0'.repeat(64)}]}),/SOURCE_MISMATCH/);
  await assert.rejects(capturedDeepInput(f.cwd,{...f.model,files:[...f.model.files,...f.model.files]}),/SOURCE_INVALID/);
  await assert.rejects(capturedDeepInput(f.cwd,{...f.model,files:[{...f.model.files[0],path:'../service.py'}]}),/SOURCE_INVALID/);
});
test('deep boundary: excluded names and symlinks cannot be promoted by tampered scan rows',async t=>{
  const f=fixture(t);await assert.rejects(capturedDeepInput(f.cwd,{...f.model,files:[{...f.model.files[0],path:'.env'}]}),/SOURCE_INVALID/);
  if(process.platform!=='win32'){fs.symlinkSync('service.py',path.join(f.cwd,'link.py'));f.git('add','link.py');f.git('commit','-qm','link');await assert.rejects(capturedDeepInput(f.cwd,{...f.model,header:{...f.model.header,tree:f.git('rev-parse','HEAD^{tree}')},files:[{...f.model.files[0],path:'link.py'}]}),/SOURCE_MISMATCH/);}
});
test('deep admission: wrong provenance, dangling targets and authority inflation are refused',async t=>{
  const f=fixture(t),input=await capturedDeepInput(f.cwd,f.model),source={snapshotId:input.identity.snapshotId,path:'service.py',sourceSha256:hash(f.content),line:1,endLine:2,provider:'test',providerVersion:'1',language:'python'};
  const result={provider:{name:'test',version:'1'},nodes:[{id:'n_target',kind:'function',label:'target',path:'service.py',authority:'OBSERVED',source},{id:'n_caller',kind:'function',label:'caller',path:'service.py',authority:'OBSERVED',source},{id:'n_call',kind:'callsite',label:'target()',path:'service.py',authority:'OBSERVED',source}],edges:[{id:'e_call',kind:'CALLS',from:'n_caller',to:'n_target',authority:'INFERRED',source,callSiteId:'n_call'}],callSites:[{id:'n_call',callerId:'n_caller',status:'RESOLVED',targetIds:['n_target'],reason:'fixture binding',source}],coverage:{},capabilities:{},limitations:['Synthetic admission test, not producer validation.']};
  const graph=admitDeepResults(input,[result]);assert.equal(graph.proof,'UNKNOWN');assert.equal(graph.coverage.calls.total,1);assert.equal(projectDeep(graph).status,'READY');
  for(const change of [x=>x.nodes[0].source.sourceSha256='f'.repeat(64),x=>x.nodes[0].authority='CERTIFIED',x=>x.edges[0].to='missing',x=>x.edges[0].authority='OBSERVED',x=>x.callSites[0].status='UNKNOWN']){const bad=structuredClone(result);change(bad);assert.throws(()=>admitDeepResults(input,[bad]),/ATLAS_DEEP_/);}
  assert.throws(()=>projectDeep(graph,{focus:'missing'}),/NODE_UNAVAILABLE/);assert.throws(()=>projectDeep(graph,{offset:-1}),/SCOPE_INVALID/);assert.equal(projectDeep(graph,{view:'runtime'}).nodes.length,0);
});
test('deep worker boundary: output cap, timeout and cancellation stop the analyzer',async()=>{
  await assert.rejects(boundedProcess(process.execPath,['-e','process.stdout.write("x".repeat(5000))'],{maxBytes:100}),/OUTPUT_LIMIT/);
  await assert.rejects(boundedProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:100}),/TIMEOUT/);
  const controller=new AbortController();controller.abort();await assert.rejects(boundedProcess(process.execPath,['-e','throw Error("never")'],{signal:controller.signal}),/CANCELLED/);
});
test('deep server: disabled bytes stay exact; enabled reads do not start analysis and foreign writes fail',async t=>{
  const f=fixture(t),apps=[];t.after(async()=>{for(const app of apps){app.server.closeAllConnections?.();await new Promise(resolve=>app.server.close(resolve));}});
  const disabled=await createServer({cwd:f.cwd,port:0,experimentalAtlas:true,experimentalAtlasDeep:false});apps.push(disabled);
  assert.equal(await (await fetch(disabled.url+'/atlas.html')).text(),fs.readFileSync(new URL('../public/atlas.html',import.meta.url),'utf8'));
  for(const p of ['/atlas-deep.html','/atlas-deep.js','/api/atlas-deep','/atlas-unified.js','/atlas-unified-embed.js'])
    assert.equal((await fetch(disabled.url+p)).status,404);
  const enabled=await createServer({cwd:f.cwd,port:0,experimentalAtlas:true,experimentalAtlasDeep:true});apps.push(enabled);
  const unified=await fetch(enabled.url+'/atlas.html'),unifiedHtml=await unified.text();
  assert.match(unifiedHtml,/id="atlasUnifiedNav"/);
  assert.match(unifiedHtml,/id="atlasUnifiedDeepFrame"/);
  assert.match(unifiedHtml,/id="annotation"/);
  assert.match(unifiedHtml,/id="historyDialog"/);
  assert.match(unifiedHtml,/\/atlas-unified\.js/);
  assert.equal(unified.headers.get('x-frame-options'),'DENY');
  const standalone=await fetch(enabled.url+'/atlas-deep.html');
  assert.equal(standalone.headers.get('x-frame-options'),'DENY');
  assert.match(standalone.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.doesNotMatch(await standalone.text(),/atlas-unified-embed/);
  const frame=await fetch(enabled.url+'/atlas-deep.html?embedded=1');
  assert.equal(frame.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(frame.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  assert.match(await frame.text(),/atlas-unified-embed\.js/);
  const outerFrame=await fetch(enabled.url+'/atlas.html?embedded=1');
  assert.equal(outerFrame.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(outerFrame.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  assert.equal((await fetch(enabled.url+'/')).headers.get('x-frame-options'),'DENY');
  for(let i=0;i<2;i++){const status=await (await fetch(enabled.url+'/api/atlas-deep')).json();assert.equal(status.status,'IDLE');assert.equal(status.identity.snapshotId,f.model.header.snapshotId);assert.equal(status.job,null);}
  const foreign=await fetch(enabled.url+'/api/atlas-deep',{method:'POST',headers:{origin:'https://foreign.invalid','content-type':'application/json'},body:JSON.stringify({action:'analyze',source:'HEAD',snapshotId:f.model.header.snapshotId})});assert.equal(foreign.status,403);
  const stale=await fetch(enabled.url+'/api/atlas-deep',{method:'POST',headers:{origin:enabled.url,'content-type':'application/json'},body:JSON.stringify({action:'analyze',source:'HEAD',snapshotId:'dwscan_'+'0'.repeat(64)})});assert.equal(stale.status,409);
});

// A capture can change while a worker is still starting. Its job remains visible
// and cancellable, but cannot publish a graph under the replacement identity.
test('deep jobs: changed snapshot keeps stale job cancellable without promoting its graph',async t=>{
  const f=fixture(t);t.after(()=>cancelAtlasDeep(f.cwd));
  const url=new URL('http://127.0.0.1/api/atlas-deep');
  const running=await atlasDeepApi(f.cwd,{method:'POST'},url,{action:'analyze',source:'HEAD',snapshotId:f.model.header.snapshotId});
  assert.equal(running.status,'RUNNING');assert.equal(running.job.stale,false);
  const updated=structuredClone(f.model);updated.header.snapshotId='dwscan_'+'a'.repeat(64);writeAtlasFixture(f.cwd,updated);
  const stale=await atlasDeepApi(f.cwd,{method:'GET'},url);assert.equal(stale.job.id,running.job.id);assert.equal(stale.job.stale,true);
  await assert.rejects(atlasDeepApi(f.cwd,{method:'POST'},url,{action:'cancel',source:'HEAD',snapshotId:updated.header.snapshotId,jobId:'not-the-running-job'}),/STALE/);
  const cancelled=await atlasDeepApi(f.cwd,{method:'POST'},url,{action:'cancel',source:'HEAD',snapshotId:updated.header.snapshotId,jobId:running.job.id});
  assert.equal(cancelled.status,'IDLE');assert.equal(cancelled.job,null);
  await assert.rejects(atlasDeepApi(f.cwd,{method:'GET'},new URL(url+'?action=graph')),/ANALYSIS_REQUIRED/);
});
