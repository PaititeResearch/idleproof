import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {configureByok,byokStatus} from '../src/byok.mjs';
import {createServer} from '../src/server.mjs';
import {byokDirectory,writeByok} from '../src/byok-storage.mjs';
import {previewByokThread,answerByokThread,readByokThread} from '../src/byok-thread.mjs';

// Offline only: all project files, auth token, provider responses and time are synthetic.
const sha=v=>createHash('sha256').update(v).digest('hex');
const ROOT='a'.repeat(64),SID='dwscan_'+ 'c'.repeat(64);
const SOURCE={
  'service.py':'from rules import adjusted\nfrom access import permitted\ndef process(v,r,a):\n    if not permitted(r,a): raise PermissionError()\n    return adjusted(v)\n',
  'rules.py':'def adjusted(value):\n    return value * .9 if value >= 100 else value\n',
  'other.py':'# Not part of this calculation\ndef debug(): return 7\n'
};
const prompt='Pourquoi cette réduction commence-t-elle à 100 ?';
const quote='réduit la valeur de 10 % à partir de 100';
const ROOTANSWER={schema:'idleproof.byok-result.v1',digest:ROOT,contextDigest:ROOT,status:'INTERPRETATION',
  evidence:[{citation:'S1',path:'service.py',snapshotId:SID,sourceSha256:sha(SOURCE['service.py'])},
    {citation:'S2',path:'rules.py',snapshotId:SID,sourceSha256:sha(SOURCE['rules.py'])},
    {citation:'S3',path:'other.py',snapshotId:SID,sourceSha256:sha(SOURCE['other.py'])}],
  presentation:{schema:'idleproof.byok-presentation.v1',format:'answer-first-v1',headings:['How it works','Calculation']},
  answer:{claims:[
    {text:'The processing service checks permission first.',citations:['S1']},
    {text:'The calculation réduit la valeur de 10 % à partir de 100 and does not change smaller values.',citations:['S2']}
  ],nextTests:[],unknowns:[],authority:'INFERRED',origin:'openrouter',proof:'UNKNOWN',requiresReview:true}};
function fixture(t){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-byok-thread-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const folder=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(folder,{recursive:true});
  const files=Object.entries(SOURCE).map(([name,src])=>({path:name,sourceSha256:sha(src),role:'production',status:'parsed',extraction:{parsed:true,symbols:[],description:{behaviors:[],dependencies:[],intent:[]}}}));
  const scan={schema:'idleproof.project-scan.v1',header:{snapshotId:SID,source:'HEAD',coverage:{}},edges:[],unknowns:[],files};
  const data=JSON.stringify(scan);fs.writeFileSync(path.join(folder,SID+'.json'),data);
  fs.writeFileSync(path.join(folder,'HEAD.json'),JSON.stringify({snapshotId:SID,root:fs.realpathSync(cwd),sha256:sha(data)}));
  configureByok(cwd,{model:'test/grounded',budgetUsd:1,maxRequestUsd:.02,maxTokens:2000},'sk-or-v1-NEVER-SEND-SYNTHETIC-KEY-111111111111');
  writeByok(path.join(byokDirectory(cwd),`answer-${ROOT}.json`),ROOTANSWER);
  const readSource=async (_cwd,e)=>({schema:'structure-source-1',snapshotId:SID,path:e.path,sourceSha256:e.sourceSha256,
    authority:'OBSERVED',totalLines:SOURCE[e.path].trimEnd().split('\n').length,
    lines:SOURCE[e.path].trimEnd().split('\n').map((text,i)=>({line:i+1,text,truncated:false}))});
  return {cwd,readSource};
}
function response(value){return new Response(JSON.stringify(value),{status:200});}
function makeProvider(posts,{failOnStage=null}={}) {
  return async(url,init)=>{
    if(url.endsWith('/models'))return response({data:[{id:'test/grounded',supported_parameters:['structured_outputs','reasoning'],pricing:{prompt:'0.00000001',completion:'0.0000001',request:'0'}}]});
    if(url.endsWith('/key'))return response({data:{limit:1,limit_remaining:1}});
    assert.ok(url.endsWith('/chat/completions'));assert.equal(init.method,'POST');
    posts.push(JSON.parse(init.body));assert.ok(posts.length<=4);
    const sent=posts.at(-1),packet=JSON.parse(sent.messages[1].content).evidencePacket;
    if(failOnStage===posts.length)return new Response('',{status:503});
    const modelReply={claims:[{heading:'Explanation',text:'At or above 100, the adjustment multiplies the input by 0.9. This comes from the captured rule.',citations:['S1']}],unknowns:[],nextTests:[],
      coverage:packet.answerPlan.points.map(p=>({questionId:p.id,kind:'answered',claims:[0],unknowns:[]}))};
    return response({model:'test/grounded',provider:'synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify(modelReply)}}],
      usage:{prompt_tokens:100,completion_tokens:100,completion_tokens_details:{reasoning_tokens:0},cost:.0001}});
  };
}
const options={rootDigest:ROOT,source:'HEAD',claimIndex:1,selection:quote,question:prompt};

test('local root read is free; initial thread has no paid activity or stored conversation',t=>{
  const f=fixture(t),thread=readByokThread(f.cwd,ROOT);
  assert.equal(thread.rootDigest,ROOT);assert.equal(thread.root.status,'INTERPRETATION');
  assert.deepEqual(thread.turns,[]);assert.equal(byokStatus(f.cwd).reservedUsd,0);
  assert.equal(readByokThread(f.cwd,'latest').root,null);
});

test('a selected phrase only transmits the claim\'s cited immutable source after explicit preview',async t=>{
  const f=fixture(t),p=await previewByokThread(f.cwd,options,{readSource:f.readSource});
  const packet=p.preview.packet;
  assert.equal(p.selection,quote);assert.equal(packet.question,prompt);
  assert.equal(packet.discussionContext.selection.text,quote);
  assert.equal(packet.discussionContext.rootDigest,ROOT);
  assert.equal(packet.discussionContext.snapshotId,SID);
  assert.deepEqual(packet.evidence.map(e=>e.path),['rules.py']);
  assert.ok(packet.evidence[0].sourceExcerpt.code.includes('>= 100'));
  assert.equal(packet.evidence[0].sourceSha256,sha(SOURCE['rules.py']));
  assert.equal(packet.includeMemory,false);assert.equal(packet.recordedMemory.length,0);
  assert.equal(packet.answerPlan.points.map(p=>p.text).join(''),prompt);
  assert.equal(p.preview.requestPolicy.maxCalls,2);assert.equal(p.preview.requestPolicy.maxCostUsd,.02);
  assert.equal(byokStatus(f.cwd).reservedUsd,0);
});

test('altered selection, foreign citation, wrong source, and unknown root cannot lead to a paid request',async t=>{
  const f=fixture(t);
  for(const body of [
    {...options,selection:'invented claim'},
    {...options,selection:'Other sentence pretending to be code'},
    {...options,claimIndex:99},
    {...options,source:'../'},
    {...options,rootDigest:'b'.repeat(64)},
    {...options,question:''}
  ])await assert.rejects(previewByokThread(f.cwd,body,{readSource:f.readSource}),/BYOK_THREAD_/);
  await assert.rejects(answerByokThread(f.cwd,{...options,consentDigest:'b'.repeat(64)},{readSource:f.readSource,fetchImpl:()=>{throw Error('must not fetch');}}),/BYOK_EXPLICIT_CONSENT_REQUIRED/);
  assert.equal(byokStatus(f.cwd).reservedUsd,0);
});

test('a changed scan snapshot refuses new follow-ups but the old private thread can still be read',async t=>{
  const f=fixture(t),dir=path.join(f.cwd,'.idleproof','project-scans');
  const next={schema:'idleproof.project-scan.v1',header:{snapshotId:'dwscan_'+'d'.repeat(64),source:'HEAD',coverage:{}},edges:[],unknowns:[],files:[]};
  const value=JSON.stringify(next);fs.writeFileSync(path.join(dir,next.header.snapshotId+'.json'),value);
  fs.writeFileSync(path.join(dir,'HEAD.json'),JSON.stringify({snapshotId:next.header.snapshotId,root:fs.realpathSync(f.cwd),sha256:sha(value)}));
  await assert.rejects(previewByokThread(f.cwd,options,{readSource:f.readSource}),/BYOK_THREAD_STALE/);
  assert.equal(readByokThread(f.cwd,ROOT).stale,true);
});

test('explicit send creates a cited thread; repeat cannot pay twice; next question includes bounded reference history',async t=>{
  const f=fixture(t),posts=[],fetchImpl=makeProvider(posts);
  const preview=await previewByokThread(f.cwd,options,{readSource:f.readSource});
  const outgoing={...options,consentDigest:preview.preview.digest};
  const first=await answerByokThread(f.cwd,outgoing,{readSource:f.readSource,fetchImpl});
  assert.equal(posts.length,2);assert.equal(first.turns.length,1);assert.equal(first.turns[0].result.status,'INTERPRETATION');
  assert.equal(first.turns[0].result.review.completed,true);
  assert.equal(first.turns[0].result.review.semanticVerified,false);
  assert.equal(first.turns[0].result.reportedCostUsd,.0002);
  assert.equal(first.turns[0].result.answer.proof,'UNKNOWN');
  assert.ok(Math.abs(byokStatus(f.cwd).reservedUsd-.0002)<1e-11);
  assert.equal(readByokThread(f.cwd,'latest').rootDigest,ROOT);
  const duplicatePreview=await previewByokThread(f.cwd,options,{readSource:f.readSource});
  assert.equal(duplicatePreview.preview.digest,preview.preview.digest,'same selected question has same cache identity');
  const replay=await answerByokThread(f.cwd,outgoing,{readSource:f.readSource,fetchImpl:()=>{throw Error('duplicate must never make network calls');}});
  assert.equal(replay.turns.length,1);assert.ok(Math.abs(byokStatus(f.cwd).reservedUsd-.0002)<1e-11);
  const next={...options,question:'Pourquoi séparer cette règle du service ?'};
  const nextPreview=await previewByokThread(f.cwd,next,{readSource:f.readSource});
  assert.equal(nextPreview.preview.packet.discussionContext.recent.length,1);
  assert.equal(nextPreview.preview.packet.discussionContext.recent[0].question,prompt);
  assert.match(nextPreview.preview.packet.discussionContext.recent[0].answer,/0\.9/);
  assert.notEqual(nextPreview.preview.digest,preview.preview.digest);
  const second=await answerByokThread(f.cwd,{...next,consentDigest:nextPreview.preview.digest},{readSource:f.readSource,fetchImpl});
  assert.equal(posts.length,4);assert.equal(second.turns.length,2);
  assert.equal(readByokThread(f.cwd,ROOT).turns.length,2,'survives a new local reader / page reload');
  assert.ok(Math.abs(byokStatus(f.cwd).reservedUsd-.0004)<1e-11);
  assert.ok(posts.every(p=>p.provider.data_collection==='deny'));
  assert.ok(posts.every(p=>p.provider.require_parameters===true));
  assert.ok(posts.every(p=>p.max_tokens===2000));
  assert.ok(posts.every(p=>p.messages[0].content.includes('untrusted conversational pointers')));
  assert.ok(posts.every(p=>!p.messages.some(m=>m.content?.includes('NEVER-SEND-SYNTHETIC-KEY'))));
});

test('editing the question after preview refuses consent without reaching the model or meter',async t=>{
  const f=fixture(t),p=await previewByokThread(f.cwd,options,{readSource:f.readSource});
  let calls=0;
  await assert.rejects(answerByokThread(f.cwd,{...options,question:'Different question',consentDigest:p.preview.digest},{
    readSource:f.readSource,fetchImpl:()=>{calls++;throw Error('No calls allowed');}}),/BYOK_EXPLICIT_CONSENT_REQUIRED/);
  assert.equal(calls,0);assert.equal(byokStatus(f.cwd).reservedUsd,0);
});

test('provider failure remains FALLBACK, is visible in local conversation, and never auto retries',async t=>{
  const f=fixture(t),p=await previewByokThread(f.cwd,options,{readSource:f.readSource}),posts=[];
  const r=await answerByokThread(f.cwd,{...options,consentDigest:p.preview.digest},{readSource:f.readSource,fetchImpl:makeProvider(posts,{failOnStage:2})});
  assert.equal(posts.length,2);assert.equal(r.turns.length,1);
  assert.equal(r.turns[0].result.status,'FALLBACK');assert.equal(r.turns[0].result.code,'BYOK_HTTP_503');
  assert.equal(r.turns[0].result.answer,null);
  assert.equal(r.turns[0].result.review.completed,false);
  assert.equal(r.turns[0].result.accounting.knownReportedCostUsd,.0001);
  assert.ok(r.turns[0].result.accounting.unresolvedReservedUsd>0);
  assert.equal(r.turns[0].result.unreviewedDraft,undefined,'a generic HTTP error must not expose a draft');
});


test('Local HTTP thread endpoints are read-only until the explicit preview/Send; CSRF is rejected',async t=>{
  const f=fixture(t),app=await createServer({cwd:f.cwd,port:0});
  t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const before=byokStatus(f.cwd).reservedUsd;
  const root=await fetch(app.url+'/api/ai/thread?rootDigest='+ROOT);
  assert.equal(root.status,200);assert.equal((await root.json()).root.digest,ROOT);
  const denied=await fetch(app.url+'/api/ai/thread',{method:'POST',headers:{origin:'https://not-idleproof.invalid', 'content-type':'application/json'},body:JSON.stringify({action:'preview',...options})});
  assert.notEqual(denied.status,200);
  const body={action:'preview',...options};
  const result=await fetch(app.url+'/api/ai/thread',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal(result.status,200);
  const info=await result.json();
  assert.equal(info.rootDigest,ROOT);assert.equal(info.preview.packet.evidence.length,1);
  assert.equal(info.preview.packet.evidence[0].path,'rules.py');
  assert.equal(byokStatus(f.cwd).reservedUsd,before);
  const obsolete=await fetch(app.url+'/api/ai/thread',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...options,action:'explain',consentDigest:'d'.repeat(64)})});
  assert.equal(obsolete.status,500);assert.equal((await obsolete.json()).error,'BYOK_EXPLICIT_CONSENT_REQUIRED');
  assert.equal(byokStatus(f.cwd).reservedUsd,before);
});
