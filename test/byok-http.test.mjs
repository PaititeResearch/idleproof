import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readByokHttpError,byokHttpDiagnostics} from '../src/byok-http.mjs';
import {configureByok,prepareByokPreview,interpretByok,byokStatus} from '../src/byok.mjs';
import {REQUEST_VERSION} from '../src/byok-contract.mjs';
import {byokDirectory,writeByok} from '../src/byok-storage.mjs';
import {renderByokPreview,renderByokResult} from '../public/byok-view.js';

const KEY='sk-or-v1-SYNTHETIC_HTTP_NEVER_SEND_12345678901234567890';
const PRIVATE='PRIVATE_ERROR_BODY_MUST_NOT_PERSIST';
const sha=s=>createHash('sha256').update(s).digest('hex');
const sid='dwscan_'+'a'.repeat(64),body='def scale(value):\n    return value * 3\n';
const options={quality:true,includeSource:true,includeMemory:false,question:'Explain the behavior simply.'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const missing=(status=404,type)=>json({error:{code:status,message:`No endpoints found that match the request. ${PRIVATE} ${KEY}`,
  metadata:{...(type?{error_type:type}:{}),raw:PRIVATE,provider_name:PRIVATE},id:PRIVATE}},status);
function fixture(t) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'byok-http-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const dir=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(dir,{recursive:true});
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId:sid,source:'HEAD',coverage:{}},unknowns:[],edges:[],files:[{
    path:'calculation.py',role:'production',sourceSha256:sha(body),extraction:{parsed:true,symbols:[],description:{behaviors:[],intent:[],dependencies:[]}}}]};
  const data=JSON.stringify(model);fs.writeFileSync(path.join(dir,sid+'.json'),data);
  fs.writeFileSync(path.join(dir,'HEAD.json'),JSON.stringify({snapshotId:sid,root:fs.realpathSync(cwd),sha256:sha(data)}));
  configureByok(cwd,{model:'test/http',budgetUsd:1,maxRequestUsd:.02,maxTokens:2000},KEY);
  const readSource=async(_cwd,e)=>({schema:'structure-source-1',snapshotId:sid,path:e.path,sourceSha256:e.sourceSha256,authority:'OBSERVED',totalLines:2,
    lines:body.trimEnd().split('\n').map((text,i)=>({line:i+1,text,truncated:false}))});
  return {cwd,readSource};
}
function completion(request,text='SYNTHETIC_ADMITTED_DRAFT',cost=.0001,citation='S1') {
  const sent=JSON.parse(request.body),p=JSON.parse(sent.messages[1].content).evidencePacket;
  const answer={claims:[{heading:'The calculation',text,citations:[citation]}],nextTests:[],unknowns:[],
    coverage:p.answerPlan.points.map(p=>({questionId:p.id,kind:'answered',claims:[0],unknowns:[]}))};
  return json({model:'test/http',provider:'synthetic/first-provider',choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],
    usage:{prompt_tokens:100,completion_tokens:80,...(cost===null?{}:{cost})}});
}
async function attempt(t,{respond=()=>missing(),failStage='review',cancel=false,firstCost=.0001,firstCitation='S1',throwFake=false,draftText}={}) {
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource}),posts=[],controller=new AbortController();
  const fetchImpl=async(url,request)=>{
    if(url.endsWith('/models'))return failStage==='preflight'?respond():json({data:[{id:'test/http',supported_parameters:['structured_outputs','reasoning'],pricing:{prompt:'0.00000001',completion:'0.0000001',request:'0'}}]});
    if(url.endsWith('/key'))return json({data:{limit:1,limit_remaining:1}});
    assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(request.method,'POST');
    const sent=JSON.parse(request.body);posts.push(sent);assert.ok(posts.length<=2);
    if(posts.length===1&&failStage!=='draft')return completion(request,draftText,firstCost,firstCitation);
    if(cancel)controller.abort();
    if(throwFake)throw Object.assign(new Error('BYOK_HTTP_404'),{httpStatus:404,routingIssue:'NO_ENDPOINTS_FOUND',providerErrorType:'not_found'});
    return respond(request);
  };
  const result=await interpretByok(f.cwd,{...options,consentDigest:p.digest},{readSource:f.readSource,fetchImpl,signal:controller.signal});
  return {...f,p,result,posts};
}

test('bounded HTTP diagnostics retain only fixed fields, never free-form error text or provider identity',async()=>{
  const error=await readByokHttpError(missing(404,'not_found'));
  assert.equal(error.message,'BYOK_HTTP_404');
  const d=byokHttpDiagnostics(error);
  assert.deepEqual(d,{httpStatus:404,errorBody:'json',providerErrorType:'not_found',routingIssue:'NO_ENDPOINTS_FOUND'});
  d.httpStatus=200;assert.equal(byokHttpDiagnostics(error).httpStatus,404);
  assert.doesNotMatch(JSON.stringify({error,d}),/PRIVATE_ERROR|sk-or-v1/);
  assert.equal(byokHttpDiagnostics(Object.assign(new Error('BYOK_HTTP_404'),d)),null);
});

for(const [name,response,bodyState,type] of [
  ['empty',()=>new Response('',{status:404}),'empty'],
  ['HTML',()=>new Response('<html>'+PRIVATE+'</html>',{status:404}),'invalid-json'],
  ['invalid UTF8',()=>new Response(new Uint8Array([255]),{status:404}),'invalid-json'],
  ['too large',()=>new Response('x'.repeat(8193),{status:404}),'oversized'],
  ['different resource',()=>json({error:{code:404,message:'Resource not found '+PRIVATE}},404),'json'],
  ['mismatched code',()=>json({error:{code:403,message:'No endpoints found'}},404),'json'],
  ['unsupported error type',()=>missing(404,PRIVATE),'json'],
  ['policy refusal',()=>missing(404,'content_policy_violation'),'json','content_policy_violation'],
  ['wrong HTTP status',()=>missing(403,'not_found'),'json','not_found'],
  ['message too long',()=>json({error:{code:404,message:'No endpoints found '+PRIVATE.repeat(100)}},404),'json'],
])test(`no routing recovery is authorized by ${name}`,async()=>{
  const e=await readByokHttpError(response()),d=byokHttpDiagnostics(e);
  assert.equal(d.errorBody,bodyState);assert.equal(d.routingIssue,undefined);assert.equal(d.providerErrorType,type);
  assert.doesNotMatch(JSON.stringify(d),/PRIVATE_ERROR|sk-or-v1/);
});

test('the error reader stops a hung body within its small deadline and cancels it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let cancelled=false;
  const r=new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:404});
  const work=readByokHttpError(r);t.mock.timers.tick(501);
  const error=await work;assert.equal(byokHttpDiagnostics(error).errorBody,'deadline');assert.equal(cancelled,true);
});

test('a body with endless empty chunks cannot starve the deadline',async()=>{
  let reads=0,cancelled=false;
  const r=new Response(new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array());},cancel(){cancelled=true;}}),{status:404});
  const error=await readByokHttpError(r);assert.equal(byokHttpDiagnostics(error).errorBody,'chunk-limit');
  assert.ok(reads<=257);assert.equal(cancelled,true);
});

test('explicit no-endpoints rejection keeps the admitted draft separate and both uncertain accounting and original routing',async t=>{
  const x=await attempt(t),r=x.result;
  assert.equal(r.code,'BYOK_HTTP_404');assert.equal(r.status,'FALLBACK');assert.equal(r.answer,null);
  assert.equal(r.review.completed,false);assert.equal(r.review.semanticVerified,false);assert.equal(r.retryable,false);
  assert.equal(r.diagnostics.failureStage,'review');assert.equal(r.diagnostics.routingIssue,'NO_ENDPOINTS_FOUND');
  assert.equal(r.diagnostics.finishReason,undefined);assert.equal(r.passes[0].diagnostics.finishReason,'stop');
  assert.equal(r.passes[1].diagnostics.httpStatus,404);assert.equal(r.passes[1].provider,null);
  assert.equal(r.unreviewedDraft.status,'UNREVIEWED');assert.equal(r.unreviewedDraft.answer.proof,'UNKNOWN');
  assert.equal(r.unreviewedDraft.answer.requiresReview,true);assert.equal(r.unreviewedDraft.answer.claims[0].text,'SYNTHETIC_ADMITTED_DRAFT');
  assert.equal(r.reportedCostUsd,null);assert.equal(r.accounting.knownReportedCostUsd,.0001);
  assert.ok(r.accounting.unresolvedReservedUsd>0);
  assert.ok(Math.abs(r.reservedUsd-r.accounting.knownReportedCostUsd-r.accounting.unresolvedReservedUsd)<1e-12);
  assert.equal(byokStatus(x.cwd).reservedUsd,r.reservedUsd);
  assert.equal(x.posts.length,2);assert.deepEqual(x.posts[0].provider,x.posts[1].provider);
  assert.deepEqual(x.posts[0].provider,{require_parameters:true,data_collection:'deny',max_price:{prompt:.01,completion:.1,request:0}});
  assert.ok(x.posts.every(p=>p.model==='test/http'&&p.max_tokens===2000));
  assert.deepEqual(x.posts[0].response_format,x.posts[1].response_format);
  const file=path.join(byokDirectory(x.cwd),`answer-${x.p.digest}.json`),saved=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(saved,/PRIVATE_ERROR_BODY|sk-or-v1|"choices"/);
  const html=renderByokResult(r);assert.match(html,/Corrective review unavailable/);assert.match(html,/no eligible endpoint/);
  assert.match(html,/not a confirmed charge/);assert.match(html,/Unreviewed draft/);assert.match(html,/data-ai-source="calculation.py"/);
  assert.doesNotMatch(html,/<h3>Explanation for review|<details[^>]*\bopen[\s>]/);
  const before=byokStatus(x.cwd).reservedUsd;
  const cached=await interpretByok(x.cwd,{...options,consentDigest:x.p.digest},{readSource:x.readSource,fetchImpl:()=>{throw new Error('cached failure must not pay again');}});
  assert.deepEqual(cached,{...r,cached:true});assert.equal(byokStatus(x.cwd).reservedUsd,before);
});

for(const [name,config] of [
  ['unclassified 404',{respond:()=>new Response('',{status:404})}],
  ['policy 403',{respond:()=>missing(403,'permission_denied')}],
  ['policy disguised as 404',{respond:()=>missing(404,'refusal')}],
  ['arbitrary network error',{throwFake:true}],
  ['explicit cancellation',{cancel:true}],
  ['missing draft cost',{firstCost:null}],
  ['invalid first citation',{firstCitation:'S99'}],
  ['draft HTTP failure',{failStage:'draft'}],
  ['preflight HTTP failure',{failStage:'preflight'}],
])test(`${name} never exposes a saved draft or claims reviewed success`,async t=>{
  const x=await attempt(t,config);
  assert.equal(x.result.status,'FALLBACK');assert.equal(x.result.answer,null);assert.equal(x.result.unreviewedDraft,undefined);
  assert.equal(x.result.review.completed,false);assert.doesNotMatch(renderByokResult(x.result),/View the saved draft/);
  if(config.firstCost===null||config.firstCitation||config.failStage==='draft')assert.equal(x.posts.length,1);
  if(config.failStage==='preflight')assert.equal(x.posts.length,0);
});

test('a successful corrective answer is unchanged and retains no draft or HTTP diagnostics',async t=>{
  const x=await attempt(t,{respond:r=>completion(r,'FINAL_SYNTHETIC_REVIEW')});
  assert.equal(x.result.status,'INTERPRETATION');assert.equal(x.result.review.completed,true);
  assert.equal(x.result.answer.claims[0].text,'FINAL_SYNTHETIC_REVIEW');assert.equal(x.result.unreviewedDraft,undefined);
  assert.equal(x.result.diagnostics.httpStatus,undefined);assert.equal(x.result.reportedCostUsd,.0002);
});

test('preview discloses routing-draft retention and refuses v10 consent without rewriting state or spending',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  assert.equal(REQUEST_VERSION,11);assert.equal(p.requestPolicy.routingDraftRecovery,'explicit-no-endpoints-only');
  assert.equal(p.requestPolicy.draftRecovery,'review-deadline-only');assert.equal(p.requestPolicy.deadlineMs,60000);
  assert.match(renderByokPreview(p),/no eligible endpoint.*saved locally as unreviewed/);
  const oldPolicy={...p.requestPolicy};delete oldPolicy.routingDraftRecovery;
  const old=sha(JSON.stringify({packet:p.packet,model:p.model,requestPolicy:oldPolicy,version:10}));
  const dir=byokDirectory(f.cwd),prior=`answer-${old}.json`;
  writeByok(path.join(dir,prior),{schema:'idleproof.byok-result.v1',digest:old,status:'FALLBACK',code:'BYOK_HTTP_404',answer:null,reservedUsd:.003});
  writeByok(path.join(dir,'meter.json'),{schema:'idleproof.byok-meter.v1',reservedUsd:.019});
  const saved=new Map(['config.json','credential.json','meter.json',prior].map(n=>[n,fs.readFileSync(path.join(dir,n))]));
  await assert.rejects(interpretByok(f.cwd,{...options,consentDigest:old},{readSource:f.readSource,fetchImpl:()=>{throw new Error('no network before consent');}}),/CONSENT/);
  for(const [n,bytes] of saved)assert.deepEqual(fs.readFileSync(path.join(dir,n)),bytes);
  assert.equal(byokStatus(f.cwd).reservedUsd,.019);
});

test('local citation disclosure escapes draft HTML and never renders raw HTTP messages',async t=>{
  const x=await attempt(t,{draftText:`Draft ${KEY} <script>bad()</script>`}),html=renderByokResult(x.result);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|sk-or-v1|PRIVATE_ERROR_BODY/);
  assert.match(html,/id="aiSourceDetail"/);assert.match(html,/not a completed review/);
});

test('legacy 404 is readable but is not upgraded into a known routing reason or a recoverable draft',()=>{
  const html=renderByokResult({status:'FALLBACK',code:'BYOK_HTTP_404',answer:null,latencyMs:8853,
    reportedCostUsd:null,reservedUsd:.0023,diagnostics:{failureStage:'review'},review:{callsMade:2,completed:false},
    accounting:{knownReportedCostUsd:.00048,unresolvedReservedUsd:.00182}});
  assert.match(html,/HTTP 404/);assert.match(html,/does not identify the cause/);
  assert.match(html,/not a confirmed charge/);assert.doesNotMatch(html,/no eligible endpoint|View the saved draft/);
});
