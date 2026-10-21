import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {configureByok,prepareByokPreview,interpretByok,byokStatus} from '../src/byok.mjs';
import {byokDirectory,writeByok} from '../src/byok-storage.mjs';
import {renderByokPreview,renderByokResult} from '../public/byok-view.js';

// Synthetic credentials, sources, provider, and virtual time only. No live calls.
const KEY='sk-or-v1-SYNTHETIC_TIMEOUT_NEVER_TRANSMIT_1234567890';
const sid='dwscan_'+'e'.repeat(64),sha=s=>createHash('sha256').update(s).digest('hex');
const body='def total(amount):\n    return amount + 12\n';
const options={quality:true,includeSource:true,question:'Explain the calculation and give a predicted example.'};
const reply=value=>new Response(JSON.stringify(value),{status:200});
function fixture(t) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'byok-timeout-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const dir=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(dir,{recursive:true});
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId:sid,source:'HEAD',coverage:{}},unknowns:[],edges:[],files:[{
    path:'calculator.py',role:'production',sourceSha256:sha(body),extraction:{parsed:true,symbols:[],description:{behaviors:[],intent:[],dependencies:[]}}}]};
  const data=JSON.stringify(model);fs.writeFileSync(path.join(dir,sid+'.json'),data);
  fs.writeFileSync(path.join(dir,'HEAD.json'),JSON.stringify({snapshotId:sid,root:fs.realpathSync(cwd),sha256:sha(data)}));
  configureByok(cwd,{model:'test/timeout',budgetUsd:1,maxRequestUsd:.02,maxTokens:2000},KEY);
  const readSource=async(_cwd,e)=>({schema:'structure-source-1',snapshotId:sid,path:e.path,sourceSha256:e.sourceSha256,authority:'OBSERVED',totalLines:2,
    lines:body.trimEnd().split('\n').map((text,i)=>({line:i+1,text,truncated:false}))});
  return {cwd,readSource};
}
function modelReply(request,text,cost=.0001,finish='stop') {
  const sent=JSON.parse(request.body),packet=JSON.parse(sent.messages[1].content).evidencePacket;
  const answer={claims:[{heading:'The calculation',text,citations:['S1']}],nextTests:[],unknowns:[],
    coverage:packet.answerPlan.points.map(p=>({questionId:p.id,kind:'answered',claims:[0],unknowns:[]}))};
  return reply({model:'test/timeout',provider:'synthetic/provider',choices:[{finish_reason:finish,message:{content:JSON.stringify(answer)}}],
    usage:{prompt_tokens:100,completion_tokens:80,completion_tokens_details:{reasoning_tokens:0},...(cost===null?{}:{cost})}});
}
function clock(t){t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});}
function stall(t,signal,ms=120000) {
  return new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    t.mock.timers.tick(ms);
  });
}
async function attempt(t,{stage='review',cancel=false,draftCost=.0001,reviewResponse=null,slowDraft=0,draftText='UNREVIEWED_SYNTHETIC_DRAFT',lateReview=false,unownedAbort=false}={}) {
  const f=fixture(t),preview=await prepareByokPreview(f.cwd,options,{readSource:f.readSource}),controller=new AbortController();
  const calls=[];
  const fetchImpl=async(url,request)=>{
    calls.push({url,method:request.method});
    if(url.endsWith('/models')) {
      if(stage==='preflight')return stall(t,request.signal);
      return reply({data:[{id:'test/timeout',supported_parameters:['structured_outputs'],pricing:{prompt:'0.00000001',completion:'0.0000001',request:'0'}}]});
    }
    if(url.endsWith('/key'))return reply({data:{limit:1,limit_remaining:1}});
    const n=calls.filter(c=>c.method==='POST').length;
    assert.ok(n<=2,'no retry or third paid call');
    if(n===1) {
      if(stage==='draft')return stall(t,request.signal);
      if(slowDraft)t.mock.timers.tick(slowDraft);
      return modelReply(request,draftText,draftCost);
    }
    if(unownedAbort)throw new DOMException('untrusted failure '+KEY,'AbortError');
    if(cancel){controller.abort();return Promise.reject(request.signal.reason);}
    if(lateReview){t.mock.timers.tick(120000);return modelReply(request,'LATE_SYNTHETIC_REVIEW');}
    if(reviewResponse)return reviewResponse(request);
    return stall(t,request.signal,120000-slowDraft);
  };
  const result=await interpretByok(f.cwd,{...options,consentDigest:preview.digest},{readSource:f.readSource,fetchImpl,signal:controller.signal});
  return {...f,preview,result,calls};
}

test('review deadline retains a separate admitted draft, never a successful or reviewed answer',async t=>{
  clock(t);const x=await attempt(t,{slowDraft:45000});
  assert.equal(x.result.code,'BYOK_CANCELLED_OR_TIMEOUT');assert.equal(x.result.status,'FALLBACK');assert.equal(x.result.answer,null);
  assert.equal(x.result.review.completed,false);assert.equal(x.result.review.semanticVerified,false);assert.equal(x.result.retryable,false);
  assert.equal(x.result.diagnostics.failureStage,'review');assert.equal(x.result.diagnostics.abortCause,'deadline');
  assert.equal(x.result.diagnostics.finishReason,undefined,'draft diagnostics must not describe an unfinished review');
  assert.equal(x.result.passes[0].diagnostics.finishReason,'stop');assert.equal(x.result.passes[1].diagnostics,null);
  assert.equal(x.result.passes[0].latencyMs,45000);assert.equal(x.result.passes[1].latencyMs,75000);
  assert.equal(x.result.passes[1].startedAfterMs,45000);assert.equal(x.result.passes[1].deadlineRemainingMs,75000);
  assert.equal(x.result.unreviewedDraft.status,'UNREVIEWED');assert.equal(x.result.unreviewedDraft.semanticVerified,false);
  assert.equal(x.result.unreviewedDraft.answer.claims[0].text,'UNREVIEWED_SYNTHETIC_DRAFT');
  assert.equal(x.result.unreviewedDraft.answer.requiresReview,true);assert.equal(x.result.unreviewedDraft.answer.proof,'UNKNOWN');
  assert.equal(x.result.unreviewedDraft.evidence[0].snapshotId,sid);
  assert.equal(x.result.reportedCostUsd,null);assert.equal(x.result.accounting.knownReportedCostUsd,.0001);
  assert.ok(x.result.accounting.unresolvedReservedUsd>0);
  assert.ok(Math.abs(x.result.reservedUsd-(x.result.accounting.knownReportedCostUsd+x.result.accounting.unresolvedReservedUsd))<1e-12);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-x.result.reservedUsd)<1e-12);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,2);
});

test('deadline recovery is disclosed in preview and bound to fresh consent',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  assert.equal(p.requestPolicy.draftRecovery,'review-deadline-only');assert.equal(p.requestPolicy.deadlineMs,120000);
  assert.match(renderByokPreview(p),/saved locally.*unreviewed draft/i);
  const oldPolicy={...p.requestPolicy};delete oldPolicy.draftRecovery;
  const old=sha(JSON.stringify({packet:p.packet,model:p.model,requestPolicy:oldPolicy,version:8}));
  const original={status:'FALLBACK',answer:null,reportedCostUsd:null,reservedUsd:.003};
  const prior=path.join(byokDirectory(f.cwd),`answer-${old}.json`);writeByok(prior,original);
  const bytes=fs.readFileSync(prior);
  await assert.rejects(interpretByok(f.cwd,{...options,consentDigest:old},{readSource:f.readSource,fetchImpl:()=>{throw new Error('no payment');}}),/CONSENT/);
  assert.deepEqual(fs.readFileSync(prior),bytes);assert.equal(byokStatus(f.cwd).reservedUsd,0);
});

test('explicit cancellation during review does not retain or show a draft',async t=>{
  clock(t);const x=await attempt(t,{cancel:true});
  assert.equal(x.result.code,'BYOK_CANCELLED_OR_TIMEOUT');assert.equal(x.result.diagnostics.abortCause,'cancelled');
  assert.equal(x.result.diagnostics.failureStage,'review');assert.equal(x.result.unreviewedDraft,undefined);
  assert.equal(x.result.answer,null);assert.equal(x.result.reportedCostUsd,null);assert.equal(x.result.passes[0].reportedCostUsd,.0001);
  assert.equal(JSON.stringify(x.result).includes('UNREVIEWED_SYNTHETIC_DRAFT'),false);
  assert.match(renderByokResult(x.result),/cancelled/i);assert.doesNotMatch(renderByokResult(x.result),/View the saved draft/);
});

for(const stage of ['preflight','draft'])test(`${stage} deadline cannot expose a nonexistent draft`,async t=>{
  clock(t);const x=await attempt(t,{stage});
  assert.equal(x.result.unreviewedDraft,undefined);assert.equal(x.result.answer,null);
  assert.equal(x.result.diagnostics.failureStage,stage);assert.equal(x.result.diagnostics.abortCause,'deadline');
  assert.equal(x.result.review.callsMade,stage==='draft'?1:0);
  if(stage==='draft')assert.equal(x.result.reservedUsd,x.result.passes[0].reservedUsd,'unused review reservation released');
  else assert.equal(byokStatus(x.cwd).reservedUsd,0);
});

test('completed review remains the only accepted answer and does not retain the draft',async t=>{
  clock(t);const x=await attempt(t,{slowDraft:3000,reviewResponse:request=>{t.mock.timers.tick(4000);return modelReply(request,'REVIEWED_SYNTHETIC_RESULT');}});
  assert.equal(x.result.status,'INTERPRETATION');assert.equal(x.result.review.completed,true);
  assert.equal(x.result.answer.claims[0].text,'REVIEWED_SYNTHETIC_RESULT');assert.equal(x.result.unreviewedDraft,undefined);
  assert.equal(x.result.passes[0].latencyMs,3000);assert.equal(x.result.passes[1].latencyMs,4000);
  assert.equal(x.result.diagnostics.finishReason,'stop');assert.equal(x.result.reportedCostUsd,.0002);
  assert.equal(JSON.stringify(x.result).includes('UNREVIEWED_SYNTHETIC_DRAFT'),false);
});

test('late review response cannot turn an expired plan into a reviewed success, but known cost is retained',async t=>{
  clock(t);const x=await attempt(t,{lateReview:true});
  assert.equal(x.result.status,'FALLBACK');assert.equal(x.result.answer,null);assert.equal(x.result.review.completed,false);
  assert.equal(x.result.reportedCostUsd,.0002);assert.equal(x.result.accounting.unresolvedReservedUsd,0);
  assert.equal(x.result.diagnostics.abortCause,'deadline');assert.ok(x.result.unreviewedDraft);
  assert.equal(JSON.stringify(x.result).includes('LATE_SYNTHETIC_REVIEW'),false);
});

test('unknown draft cost still blocks the review and is not presented as deadline recovery',async t=>{
  clock(t);const x=await attempt(t,{draftCost:null});
  assert.equal(x.result.code,'BYOK_REVIEW_COST_UNKNOWN');assert.equal(x.result.review.callsMade,1);
  assert.equal(x.result.unreviewedDraft,undefined);assert.equal(x.result.reportedCostUsd,null);
});

test('an unowned AbortError is not attributed to the local deadline',async t=>{
  clock(t);const x=await attempt(t,{unownedAbort:true});
  assert.equal(x.result.code,'BYOK_CANCELLED_OR_TIMEOUT');assert.equal(x.result.diagnostics.abortCause,'unknown');
  assert.equal(x.result.unreviewedDraft,undefined);assert.equal(JSON.stringify(x.result).includes(KEY),false);
});

test('timeout result replays from cache without another model call, retaining uncertain reservations',async t=>{
  clock(t);const x=await attempt(t),before=byokStatus(x.cwd).reservedUsd;
  const result=await interpretByok(x.cwd,{...options,consentDigest:x.preview.digest},{readSource:x.readSource,fetchImpl:()=>{throw new Error('no network on replay');}});
  assert.equal(result.cached,true);assert.equal(result.status,'FALLBACK');assert.equal(result.answer,null);
  assert.deepEqual(result.unreviewedDraft,x.result.unreviewedDraft);assert.equal(byokStatus(x.cwd).reservedUsd,before);
});

test('saved timeout draft is redacted and escaped, cited locally, and always visibly unreviewed',async t=>{
  clock(t);const x=await attempt(t,{draftText:`Draft ${KEY} <script>bad()</script>`});
  const saved=fs.readFileSync(path.join(byokDirectory(x.cwd),`answer-${x.preview.digest}.json`),'utf8');
  assert.equal(saved.includes(KEY),false);assert.ok(x.result.unreviewedDraft);
  const html=renderByokResult(x.result);
  assert.match(html,/Review timed out/);assert.match(html,/View the saved draft/);
  assert.match(html,/not reviewed|not completed/i);assert.match(html,/unreviewed/i);
  assert.match(html,/not a confirmed charge/);assert.match(html,/data-ai-source="calculator.py"/);
  assert.match(html,/id="aiSourceDetail"/);assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<h3>Explanation for review/);
  assert.doesNotMatch(html,/<details[^>]*\bopen[\s>]/);
  assert.equal(saved.includes('choices'),false,'no raw provider response');
});

for(const [name,respond,expected] of [
  ['content filtered',r=>modelReply(r,'UNTRUSTED_REVIEW',.0001,'content_filter'),'BYOK_CONTENT_FILTERED'],
  ['malformed JSON',()=>reply({choices:[{finish_reason:'stop',message:{content:'not JSON'}}],usage:{cost:.0001}}),'BYOK_INVALID_JSON'],
  ['HTTP failure',()=>new Response('',{status:503}),'BYOK_HTTP_503'],
  ['over-budget cost',r=>modelReply(r,'UNTRUSTED_REVIEW',.2),'BYOK_COST_EXCEEDED_RESERVATION'],
])test(`${name} is not silently rescued by presenting the draft`,async t=>{
  clock(t);const x=await attempt(t,{reviewResponse:respond});
  assert.equal(x.result.code,expected);assert.equal(x.result.answer,null);assert.equal(x.result.unreviewedDraft,undefined);
});

// The human trial took 56.6s for the draft and had only 2.8s for review under v11.
// A longer shared clock must deliver a review when that second response is healthy.
test('v12: a 56.6-second draft plus 10-second review completes within 120 seconds',async t=>{
  clock(t);
  const x=await attempt(t,{slowDraft:56611,reviewResponse:request=>{
    t.mock.timers.tick(10000);
    return modelReply(request,'REVIEWED_WITH_LATE_DRAFT');
  }});
  assert.equal(x.result.status,'INTERPRETATION');
  assert.equal(x.result.review.callsMade,2);
  assert.equal(x.result.review.completed,true);
  assert.equal(x.result.review.deadlineMs,120000);
  assert.equal(x.result.passes[0].latencyMs,56611);
  assert.equal(x.result.passes[1].startedAfterMs,56611);
  assert.equal(x.result.passes[1].deadlineRemainingMs,63389);
  assert.equal(x.result.passes[1].latencyMs,10000);
  assert.equal(x.result.answer.claims[0].text,'REVIEWED_WITH_LATE_DRAFT');
  assert.equal(x.result.reportedCostUsd,.0002);
  assert.equal(x.result.unreviewedDraft,undefined);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,2);
});

test('v12: a late draft with less than 20 seconds left skips the paid review and releases its reservation',async t=>{
  clock(t);
  const x=await attempt(t,{slowDraft:110000,draftText:'A_LATE_UNREVIEWED_DRAFT'});
  assert.equal(x.result.status,'FALLBACK');
  assert.equal(x.result.code,'BYOK_REVIEW_TIME_INSUFFICIENT');
  assert.equal(x.result.review.deadlineMs,120000);
  assert.equal(x.result.diagnostics.reviewRemainingMs,10000);
  assert.equal(x.result.diagnostics.failureStage,'review');
  assert.equal(x.result.review.callsMade,1);
  assert.equal(x.calls.filter(c=>c.method==='POST').length,1,'no review POST');
  assert.equal(x.result.reportedCostUsd,.0001);
  assert.equal(x.result.accounting.knownReportedCostUsd,.0001);
  assert.equal(x.result.accounting.unresolvedReservedUsd,0);
  assert.equal(x.result.reservedUsd,.0001,'unused review reservation released');
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-.0001)<1e-12);
  assert.equal(x.result.answer,null);
  assert.equal(x.result.unreviewedDraft.status,'UNREVIEWED');
  assert.equal(x.result.unreviewedDraft.answer.claims[0].text,'A_LATE_UNREVIEWED_DRAFT');
  assert.equal(x.result.review.completed,false);
  assert.equal(x.result.review.semanticVerified,false);
  const html=renderByokResult(x.result);
  assert.match(html,/Corrective review not started/);
  assert.match(html,/shared 120-second window/);
  assert.match(html,/No second paid call was sent/);
  assert.match(html,/No corrective call was attempted; its reservation was released/);
  assert.match(html,/View the saved draft/);
  assert.doesNotMatch(html,/<h3>Explanation for review<\/h3>/);
});

test('v12: with exactly 20 seconds left, a fast valid second call is permitted',async t=>{
  clock(t);
  const x=await attempt(t,{slowDraft:100000,reviewResponse:request=>{
    t.mock.timers.tick(18000);
    return modelReply(request,'REVIEWED_AT_BOUNDARY');
  }});
  assert.equal(x.result.status,'INTERPRETATION');
  assert.equal(x.result.review.callsMade,2);
  assert.equal(x.result.passes[1].deadlineRemainingMs,20000);
  assert.equal(x.result.answer.claims[0].text,'REVIEWED_AT_BOUNDARY');
  assert.equal(x.result.reportedCostUsd,.0002);
});

test('v12: new preview communicates the deadline and review minimum while v11 consent is invalid',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  assert.equal(p.requestPolicy.deadlineMs,120000);
  assert.equal(p.requestPolicy.minReviewRemainingMs,20000);
  const text=renderByokPreview(p);
  assert.match(text,/120-second shared generation deadline/);
  assert.match(text,/at least 20 seconds remain/);
  const oldPolicy={...p.requestPolicy,deadlineMs:60000};
  delete oldPolicy.minReviewRemainingMs;
  const oldConsent=sha(JSON.stringify({packet:p.packet,model:p.model,requestPolicy:oldPolicy,version:11}));
  assert.notEqual(oldConsent,p.digest);
  let calls=0;
  await assert.rejects(interpretByok(f.cwd,{...options,consentDigest:oldConsent},
    {readSource:f.readSource,fetchImpl:()=>{calls++;throw Error('no network');}}),/BYOK_EXPLICIT_CONSENT_REQUIRED/);
  assert.equal(calls,0);
  assert.equal(byokStatus(f.cwd).reservedUsd,0);
});

test('v12: historical v11 failures still state the original 60-second deadline',()=>{
  const old={status:'FALLBACK',code:'BYOK_CANCELLED_OR_TIMEOUT',latencyMs:60062,
    diagnostics:{abortCause:'deadline',failureStage:'review'},
    review:{callsMade:2,completed:false,semanticVerified:false},reportedCostUsd:null};
  const html=renderByokResult(old);
  assert.match(html,/shared 60-second deadline/);
  assert.doesNotMatch(html,/shared 120-second deadline/);
});
