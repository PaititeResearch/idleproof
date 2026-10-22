// Independent integration review: synthetic inputs, no user repository execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {admitDeepResults,capturedDeepInput} from '../src/atlas-deep.mjs';
import {boundedProcess} from '../src/atlas-deep-process.mjs';
import {atlasDeepApi,cancelAtlasDeep} from '../src/atlas-deep-api.mjs';
import {writeAtlasFixture} from '../scripts/atlas-fixture.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const identity={snapshotId:`dwscan_${'a'.repeat(64)}`,tree:'b'.repeat(40),source:'HEAD'};
function sample(){
  const content='def caller():\n    target()\n\ndef target():\n    return 1\n';
  const input={identity,files:[{path:'service.py',sourceSha256:sha(content),content}],coverage:{complete:true}};
  const source={snapshotId:identity.snapshotId,path:'service.py',sourceSha256:sha(content),language:'python',provider:'fixture',providerVersion:'1',line:2,endLine:2,column:4,endColumn:12,locationScope:'exact-span'};
  const node=(id,kind,label)=>({id,kind,label,path:'service.py',authority:'OBSERVED',source:{...source}});
  const result={provider:{name:'fixture',version:'1'},nodes:[node('fn_caller','function','caller'),node('fn_target','function','target'),node('site_call','callsite','target()')],edges:[{id:'edge_call',kind:'CALLS',from:'fn_caller',to:'fn_target',callSiteId:'site_call',authority:'INFERRED',source:{...source}}],callSites:[{id:'site_call',callerId:'fn_caller',status:'RESOLVED',targetIds:['fn_target'],reason:'Synthetic fixture static binding',source:{...source}}],capabilities:{},coverage:{},limitations:['Independent synthetic admission check.']};
  return {input,result};
}

test('deep adversarial: a producer cannot substitute another source authority',()=>{
  const {input,result}=sample();
  assert.equal(admitDeepResults(input,[result]).nodes.length,3);
  result.nodes[0].source.provider='different-producer';
  assert.throws(()=>admitDeepResults(input,[result]),/ATLAS_DEEP_/);
});

test('deep adversarial: exact source ranges cannot contain impossible columns',()=>{
  const {input,result}=sample();
  result.nodes[0].source.column=-10;
  result.nodes[0].source.endColumn=999999;
  assert.throws(()=>admitDeepResults(input,[result]),/ATLAS_DEEP_/);
});

test('deep adversarial: positive columns outside the captured line are refused',()=>{
  const {input,result}=sample();
  result.nodes[0].source.endColumn=999999;
  assert.throws(()=>admitDeepResults(input,[result]),/ATLAS_DEEP_/);
});

test('deep adversarial: one result cannot borrow another producer provenance',()=>{
  const {input,result}=sample();
  const other={...result,provider:{name:'other-fixture',version:'1'}};
  const empty={...result,nodes:[],edges:[],callSites:[]};
  assert.throws(()=>admitDeepResults(input,[empty,other]),/ATLAS_DEEP_/);
});

test('deep adversarial: absent producer versions cannot become the string undefined',()=>{
  const {input,result}=sample();
  delete result.provider.version;
  for(const fact of [...result.nodes,...result.edges,...result.callSites])delete fact.source.providerVersion;
  assert.throws(()=>admitDeepResults(input,[result]),/ATLAS_DEEP_/);
});

test('deep adversarial: CALLS evidence must refer to its actual call-site source',()=>{
  const {input,result}=sample();
  result.edges[0].source.line=4;result.edges[0].source.endLine=4;
  assert.throws(()=>admitDeepResults(input,[result]),/ATLAS_DEEP_/);
});

test('deep adversarial: unavailable producer output is not a successful empty graph',()=>{
  const {input}=sample();
  const result={provider:{name:'fixture',version:'1'},status:'UNAVAILABLE',error:'INPUT_BYTE_LIMIT',nodes:[],edges:[],callSites:[],capabilities:{},coverage:{inputFiles:0,complete:false},limitations:[]};
  assert.throws(()=>admitDeepResults(input,[result]),/ATLAS_DEEP_/);
});

const python=['python3','python'].find(command=>spawnSync(command,['-I','-S','-c','pass'],{timeout:5000,stdio:'pipe'}).status===0);
test('deep adversarial: uppercase extensions are analyzed or explicitly counted unsupported', {skip:!python?'Python unavailable: NOT_RUN':false},async t=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-case-review-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');git('config','user.name','Synthetic reviewer');git('config','user.email','reviewer@example.invalid');git('config','core.autocrlf','false');
  const content='{"enabled":true}';fs.writeFileSync(path.join(cwd,'CONFIG.JSON'),content);git('add','.');git('commit','-qm','synthetic fixture');
  const model={schema:'idleproof.project-scan.v1',header:{...identity,tree:git('rev-parse','HEAD^{tree}')},files:[{path:'CONFIG.JSON',sourceSha256:sha(content),extraction:{parsed:true}}]};
  const input=await capturedDeepInput(cwd,model);
  if(input.files.length===0){assert.equal(input.coverage.unsupportedFiles,1);assert.equal(input.coverage.complete,false);return;}
  const worker=fileURLToPath(new URL('../src/atlas-deep-worker.mjs',import.meta.url));
  const result=JSON.parse((await boundedProcess(process.execPath,[worker],{input:JSON.stringify({...input,pythonCommand:python}),timeoutMs:5000})).toString('utf8'));
  assert.ok(result.some(r=>r.provider.name==='data-stdlib'&&r.nodes.some(n=>n.qualifiedName==='/enabled')));
});

test('deep adversarial: cache identity changes when captured tree changes', {skip:!python?'Python unavailable: NOT_RUN':false},async t=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-cache-review-'));
  t.after(()=>{cancelAtlasDeep(cwd);fs.rmSync(cwd,{recursive:true,force:true});});
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');git('config','user.name','Synthetic reviewer');git('config','user.email','reviewer@example.invalid');git('config','core.autocrlf','false');
  const content='{"enabled":true}\n';fs.writeFileSync(path.join(cwd,'config.json'),content);git('add','.');git('commit','-qm','synthetic fixture');
  const model={schema:'idleproof.project-scan.v1',header:{...identity,tree:git('rev-parse','HEAD^{tree}'),profile:{syntheticFixture:true},coverage:{inventoryEntries:1,read:1}},files:[{path:'config.json',sourceSha256:sha(content),extraction:{parsed:true,symbols:[],calls:[]}}],edges:[]};
  writeAtlasFixture(cwd,model);
  const url=new URL('http://127.0.0.1/api/atlas-deep');
  await atlasDeepApi(cwd,{method:'POST'},url,{action:'analyze',source:'HEAD',snapshotId:identity.snapshotId});
  let state;
  for(let i=0;i<100;i++){
    state=await atlasDeepApi(cwd,{method:'GET'},url);
    if(state.status!=='RUNNING')break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(state.status,'READY',JSON.stringify(state));
  writeAtlasFixture(cwd,{...model,header:{...model.header,tree:'c'.repeat(40)}});
  const changed=await atlasDeepApi(cwd,{method:'GET'},url);
  assert.notEqual(changed.status,'READY','Old tree results must not be reused under a different current identity');
});

test('deep adversarial: missing promisor blobs never launch a configured fetch helper', {skip:process.platform==='win32'?'POSIX synthetic helper probe only':false},async t=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-promisor-review-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');git('config','user.name','Synthetic reviewer');git('config','user.email','reviewer@example.invalid');git('config','core.autocrlf','false');
  const content='{"key":1}\n';fs.writeFileSync(path.join(cwd,'config.json'),content);git('add','.');git('commit','-qm','synthetic fixture');
  const tree=git('rev-parse','HEAD^{tree}'),blob=git('rev-parse','HEAD:config.json');
  // Entirely local synthetic upload-pack: only writes a marker, never networks.
  const helper=path.join(cwd,'synthetic-upload-pack');
  fs.writeFileSync(helper,'#!/bin/sh\nprintf touched > "$0.marker"\nexit 1\n',{mode:0o700});
  git('config','remote.origin.url',cwd);
  git('config','remote.origin.uploadpack',helper);
  git('config','remote.origin.promisor','true');
  git('config','extensions.partialClone','origin');
  git('config','protocol.file.allow','always');
  fs.unlinkSync(path.join(cwd,'.git','objects',blob.slice(0,2),blob.slice(2)));
  const model={schema:'idleproof.project-scan.v1',header:{...identity,tree},files:[{path:'config.json',sourceSha256:sha(content),extraction:{parsed:true}}]};
  await assert.rejects(capturedDeepInput(cwd,model),/ATLAS_DEEP_/);
  assert.equal(fs.existsSync(helper+'.marker'),false,'Source lookup must fail closed without executing a configured helper');
});

test('deep adversarial: group timeout still kills a descendant after parent closes', {skip:process.platform==='win32'?'POSIX process-group probe only':false},async t=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-process-review-')),pidfile=path.join(cwd,'synthetic-child.pid');
  let descendant;
  t.after(()=>{if(descendant)try{process.kill(descendant,'SIGKILL');}catch{}fs.rmSync(cwd,{recursive:true,force:true});});
  const childCode=`process.on('SIGTERM',()=>{});let count=0;const fs=require('node:fs');const write=()=>{fs.writeFileSync(process.argv[1]+'.next',JSON.stringify({pid:process.pid,count:count++}));fs.renameSync(process.argv[1]+'.next',process.argv[1]);};write();setInterval(write,50);`;
  const parentCode=`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)},process.argv[1]],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`;
  await assert.rejects(boundedProcess(process.execPath,['-e',parentCode,pidfile],{timeoutMs:1000,processGroup:true}),/TIMEOUT/);
  assert.ok(fs.existsSync(pidfile),'Synthetic descendant started');
  descendant=JSON.parse(fs.readFileSync(pidfile,'utf8')).pid;
  // Allow the documented 500ms hard-kill grace period to finish.
  await new Promise(resolve=>setTimeout(resolve,650));
  const before=JSON.parse(fs.readFileSync(pidfile,'utf8')).count;
  await new Promise(resolve=>setTimeout(resolve,150));
  const after=JSON.parse(fs.readFileSync(pidfile,'utf8')).count;
  assert.equal(after,before,'The analyzer descendant must not continue work after the deadline');
});
