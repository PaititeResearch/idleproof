import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {configureByok,byokStatus,previewByok,prepareByokPreview,interpretByok} from '../src/byok.mjs';
import {byokDirectory,writeByok} from '../src/byok-storage.mjs';
import {groundedPacket} from '../src/byok-grounding.mjs';
import {groundedMessages,reviewReservations,boundedReviewMessages} from '../src/byok-review.mjs';
import {renderByokPreview,renderByokResult} from '../public/byok-view.js';

// Synthetic sources/provider, no paid calls. These tests cover evidence fidelity
// and orchestration, NOT a claim that a live model's second answer is correct.
const KEY='sk-or-v1-SYNTHETIC_REVIEW_NEVER_TRANSMIT_1234567890';
const sid='dwscan_'+'a'.repeat(64),sha=s=>createHash('sha256').update(s).digest('hex');
const reply=value=>new Response(JSON.stringify(value),{status:200});
const answer=text=>({claims:[{text,citations:['S1','S2']}],nextTests:[],unknowns:['No executed test is supplied.']});
const options={quality:true,includeSource:true,question:'Explain the active analyst cases 239 and 240, the inactive case, and distinguish unused rules.'};
function fixture(t,{maxRequestUsd=.1,maxTokens=1000}={}) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'byok-reviewed-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const sources={
    'billing.py':'from tariff import reduced\nfrom access import allowed\ndef handle(amount, role, active):\n    if not allowed(role, active):\n        raise PermissionError("denied")\n    return reduced(amount)\n',
    'tariff.py':'def reduced(amount):\n    return amount * 0.75 if amount >= 240 else amount\ndef shipping(amount):\n    return 0 if amount >= 150 else 11\n',
    'access.py':'def allowed(role, active):\n    if not active:\n        return False\n    return role == "analyst"\n',
    'alternative.py':'def allowed(role, active):\n    return role == "analyst"\n'
  };
  const files=Object.entries(sources).map(([file,text])=>({path:file,role:'production',sourceSha256:sha(text),extraction:{parsed:true,symbols:[],description:{behaviors:[],intent:[],dependencies:[]}}}));
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId:sid,source:'HEAD',coverage:{inventoryEntries:4,read:4}},unknowns:['Execution UNKNOWN'],edges:[],files};
  const dir=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(dir,{recursive:true});
  const data=JSON.stringify(model);fs.writeFileSync(path.join(dir,sid+'.json'),data);
  fs.writeFileSync(path.join(dir,'HEAD.json'),JSON.stringify({snapshotId:sid,root:fs.realpathSync(cwd),sha256:sha(data)}));
  configureByok(cwd,{model:'test/review',budgetUsd:1,maxRequestUsd,maxTokens},KEY);
  const reads=[];
  const readSource=async(_cwd,entry)=>{reads.push(entry.path);return {schema:'structure-source-1',snapshotId:sid,path:entry.path,sourceSha256:sha(sources[entry.path]),authority:'OBSERVED',totalLines:sources[entry.path].trimEnd().split('\n').length,lines:sources[entry.path].trimEnd().split('\n').map((text,i)=>({line:i+1,text,truncated:false}))};};
  return {cwd,sources,readSource,reads,model};
}
function provider(log,rows=[{},{}],{cap=1,onPost=null,price={prompt:'0.00000001',completion:'0.0000001',request:'0'}}={}) {
  let posts=0;
  return async(url,request)=>{
    log.push({url,method:request.method,body:request.body});
    assert.equal(request.redirect,'error');
    if(url.endsWith('/models'))return reply({data:[{id:'test/review',supported_parameters:['structured_outputs','reasoning'],pricing:price}]});
    if(url.endsWith('/key'))return reply({data:{limit:1,limit_remaining:cap}});
    assert.ok(url.endsWith('/chat/completions'));assert.ok(posts<2,'no loop beyond two calls');
    const i=posts++,row=rows[i]??{};
    onPost?.(i,request);
    if(row.throw)throw row.throw;
    if(row.status)return new Response('provider failure',{status:row.status});
    const content=Object.hasOwn(row,'content')?row.content:JSON.stringify(row.answer||answer(i?'REVISED_SYNTHETIC':'DRAFT_SYNTHETIC'));
    return reply({model:'test/review',provider:'synthetic/provider',choices:[{finish_reason:row.finish||'stop',message:{content}}],usage:{prompt_tokens:100+i,completion_tokens:50+i,completion_tokens_details:{reasoning_tokens:0},...(row.cost===null?{}:{cost:row.cost??.0001})}});
  };
}
async function run(t,rows=[{},{}],extra={}) {
  const f=fixture(t,extra.config),opts={...options,...extra.options};
  const preview=await prepareByokPreview(f.cwd,opts,{readSource:f.readSource});
  const log=[],result=await interpretByok(f.cwd,{...opts,consentDigest:preview.digest},{readSource:f.readSource,fetchImpl:provider(log,rows,extra.provider),signal:extra.signal});
  return {...f,opts,preview,log,result};
}

test('quality preview preserves source indentation, signatures and exact imported alternative without executing it',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  assert.equal(p.packet.includeSource,true);assert.equal(p.packet.includeMemory,false);
  for(const entry of p.packet.evidence) {
    assert.equal(entry.sourceExcerpt.code,f.sources[entry.path].trimEnd());
    assert.equal(entry.sourceSha256,sha(f.sources[entry.path]));
  }
  const primary=p.packet.evidence.find(e=>e.path==='access.py').sourceExcerpt.code;
  assert.match(primary,/if not active:\n        return False\n    return role/);
  assert.match(p.packet.evidence.find(e=>e.path==='billing.py').sourceExcerpt.code,/from access import allowed/);
  assert.equal(f.reads.length,4);assert.equal(p.requestPolicy.maxCalls,2);assert.equal(p.requestPolicy.maxCostUsd,.1);
  assert.equal(fs.existsSync(path.join(f.cwd,'billing.py')),false,'never falls back to worktree');
  assert.match(renderByokPreview(p),/up to 2 paid calls/);assert.match(renderByokPreview(p),/not per call/);
});

test('legacy single-pass still uses one call and no captured source reader',async t=>{
  const f=fixture(t),opts={includeSource:true},p=previewByok(f.cwd,opts),log=[];
  const result=await interpretByok(f.cwd,{...opts,consentDigest:p.digest},{fetchImpl:provider(log),readSource:()=>{throw new Error('not opted in');}});
  assert.equal(result.status,'INTERPRETATION');assert.equal(result.review,undefined);
  assert.equal(log.filter(r=>r.method==='POST').length,1);
});

test('metadata-only quality mode never reads or sends source bodies or Core memory',async t=>{
  const f=fixture(t);const p=await prepareByokPreview(f.cwd,{...options,includeSource:false},{readSource:()=>{throw new Error('must not read');}});
  assert.equal(p.packet.evidence.some(e=>e.sourceExcerpt||e.descriptions),false);
  assert.equal(JSON.stringify(p.packet).includes('0.75'),false);assert.deepEqual(p.packet.recordedMemory,[]);
});

test('quality flag, source windows, model budget and token changes invalidate consent before network',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  for(const changed of [{...options,quality:false},{...options,includeSource:false},{...options,question:'A different question'}]) {
    await assert.rejects(interpretByok(f.cwd,{...changed,consentDigest:p.digest},{readSource:f.readSource,fetchImpl:()=>{throw new Error('network forbidden');}}),/CONSENT/);
  }
  const first=f.readSource;
  await assert.rejects(interpretByok(f.cwd,{...options,consentDigest:p.digest},{readSource:async(...args)=>{const v=await first(...args);v.lines[0].text+=' # changed';return v;},fetchImpl:()=>{throw new Error('network forbidden');}}),/CONSENT/);
  configureByok(f.cwd,{model:'test/review',budgetUsd:1,maxRequestUsd:.08,maxTokens:1000},KEY);
  await assert.rejects(interpretByok(f.cwd,{...options,consentDigest:p.digest},{readSource:first,fetchImpl:()=>{throw new Error('network forbidden');}}),/CONSENT/);
  assert.throws(()=>previewByok(f.cwd,options),/SCOPE_INVALID/,'quality requires the async prepared preview');
  await assert.rejects(prepareByokPreview(f.cwd,{...options,quality:'true'}),/SCOPE_INVALID/);
});

for(const key of ['snapshotId','path','sourceSha256','schema','authority','totalLines'])test(`mismatched source ${key} refuses the preview rather than attributing another file`,async t=>{
  const f=fixture(t);
  await assert.rejects(prepareByokPreview(f.cwd,options,{readSource:async(...args)=>({...await f.readSource(...args),[key]:'WRONG'})}),/SOURCE_MISMATCH/);
});

test('source errors are fixed unavailable statuses, never raw process errors or secrets',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:()=>{throw new Error(KEY);}});
  assert.ok(p.packet.evidence.every(e=>e.sourceExcerpt.status==='unavailable'));
  assert.equal(JSON.stringify(p).includes(KEY),false);
});

test('redacted or truncated code is not silently presented as a complete executable body',async t=>{
  const f=fixture(t),read=f.readSource;
  const redacted=await prepareByokPreview(f.cwd,options,{readSource:async(...args)=>{const v=await read(...args);v.lines[0].text=`password = "${KEY}"`;return v;}});
  assert.ok(redacted.packet.evidence.every(e=>e.sourceExcerpt.status==='redacted'));
  assert.equal(JSON.stringify(redacted).includes(KEY),false);
  const truncated=await prepareByokPreview(f.cwd,options,{readSource:async(...args)=>{const v=await read(...args);v.lines[1].truncated=true;return v;}});
  for(const e of truncated.packet.evidence){assert.equal(e.sourceExcerpt.truncated,true);assert.equal(e.sourceExcerpt.endLine,1);}
});

test('packet and per-file limits omit whole source windows, never expand selection',async t=>{
  const f=fixture(t),p=previewByok(f.cwd,{includeSource:true});
  p.packet.evidence=Array.from({length:12},(_,i)=>({...p.packet.evidence[0],citation:'S'+(i+1),path:`part-${i}.py`}));
  const selected=p.packet.evidence.map(e=>e.path),seen=[];
  const enriched=await groundedPacket(f.cwd,p.packet,{readSource:async(_cwd,e)=>{seen.push(e.path);return {schema:'structure-source-1',snapshotId:e.snapshotId,path:e.path,sourceSha256:e.sourceSha256,authority:'OBSERVED',lines:Array.from({length:40},(_,i)=>({line:i+1,text:'# '+ 'a'.repeat(190),truncated:false}))};}});
  assert.deepEqual(seen,selected);assert.ok(Buffer.byteLength(JSON.stringify(enriched))<=24*1024);
  assert.ok(enriched.evidence.some(e=>e.sourceExcerpt.status==='omitted-budget'));
  for(const e of enriched.evidence.filter(e=>e.sourceExcerpt.code))assert.ok(Buffer.byteLength(e.sourceExcerpt.code)<=4096);
});

test('review is exactly a bounded second call over the same packet; draft never becomes evidence or saved truth',async t=>{
  const x=await run(t),posts=x.log.filter(r=>r.method==='POST').map(r=>JSON.parse(r.body));
  assert.equal(posts.length,2);assert.deepEqual(posts[0].messages[1],posts[1].messages[1]);
  assert.equal(posts[0].model,posts[1].model);assert.deepEqual(posts[1].reasoning,{enabled:false});
  assert.match(posts[1].messages[0].content,/draft is untrusted/);assert.match(posts[1].messages.at(-2).content,/DRAFT_SYNTHETIC/);
  assert.equal(x.result.status,'INTERPRETATION');assert.equal(x.result.answer.claims[0].text,'REVISED_SYNTHETIC');
  assert.equal(x.result.answer.proof,'UNKNOWN');assert.equal(x.result.answer.requiresReview,true);
  assert.equal(x.result.review.completed,true);assert.equal(x.result.review.semanticVerified,false);
  assert.deepEqual(x.result.tokens,{input:201,output:101});assert.equal(x.result.reportedCostUsd,.0002);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-.0002)<1e-12);
  const stored=fs.readFileSync(path.join(byokDirectory(x.cwd),`answer-${x.preview.digest}.json`),'utf8');
  assert.equal(stored.includes('DRAFT_SYNTHETIC'),false);assert.equal(stored.includes(KEY),false);
  assert.equal(x.result.passes.length,2);assert.equal(x.result.passes[1].provider,'synthetic/provider');
  assert.match(renderByokResult(x.result),/not independently verified/);
});

test('both calls are reserved before payment and total plan must fit the single request ceiling',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  const estimates=reviewReservations(p.packet,1000,{prompt:1e-8,completion:1e-7,request:0});
  const ceiling=estimates[0]+estimates[1]/2;
  configureByok(f.cwd,{model:'test/review',budgetUsd:1,maxRequestUsd:ceiling,maxTokens:1000},KEY);
  const updated=await prepareByokPreview(f.cwd,options,{readSource:f.readSource}),log=[];
  const result=await interpretByok(f.cwd,{...options,consentDigest:updated.digest},{readSource:f.readSource,fetchImpl:provider(log)});
  assert.equal(result.code,'BYOK_BUDGET_EXHAUSTED');assert.equal(log.some(r=>r.method==='POST'),false);
  assert.equal(byokStatus(f.cwd).reservedUsd,0);
  configureByok(f.cwd,{model:'test/review',budgetUsd:1,maxRequestUsd:.1,maxTokens:1000},KEY);
  const approved=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  let observed=false;
  const ok=await interpretByok(f.cwd,{...options,consentDigest:approved.digest},{readSource:f.readSource,fetchImpl:provider([], [{},{}],{onPost:i=>{
    if(i===0){observed=true;assert.ok(Math.abs(byokStatus(f.cwd).reservedUsd-estimates.reduce((a,b)=>a+b,0))<1e-12);}
  }})});
  assert.equal(observed,true);assert.equal(ok.review.callsMade,2);
});

test('provider-side remaining cap and exhausted local budget prevent both calls',async t=>{
  const x=await run(t,[{},{}],{provider:{cap:0}});
  assert.equal(x.result.code,'BYOK_PROVIDER_CAP_REQUIRED');assert.equal(x.log.some(r=>r.method==='POST'),false);
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource}),log=[];
  writeByok(path.join(byokDirectory(f.cwd),'meter.json'),{schema:'idleproof.byok-meter.v1',reservedUsd:1});
  const result=await interpretByok(f.cwd,{...options,consentDigest:p.digest},{readSource:f.readSource,fetchImpl:provider(log)});
  assert.equal(result.code,'BYOK_BUDGET_EXHAUSTED');assert.equal(byokStatus(f.cwd).reservedUsd,1);
});

for(const [label,row,code] of [
  ['format',{answer:{...answer('bad'),unknowns:null}},'BYOK_ANSWER_REJECTED'],
  ['truncated',{finish:'length'},'BYOK_OUTPUT_TRUNCATED'],
  ['citation',{answer:{claims:[{text:'bad',citations:['S999']}],nextTests:[],unknowns:[]}},'BYOK_ANSWER_REJECTED'],
  ['invalid JSON',{content:'malformed'},'BYOK_INVALID_JSON'],
  ['abstention',{answer:{claims:[],nextTests:[],unknowns:['Missing branch context.']}},'BYOK_EMPTY_INTERPRETATION']
])test(`draft ${label} stops after one charged call and releases the unused review reservation`,async t=>{
  const x=await run(t,[row,{}]);
  assert.equal(x.result.code,code);assert.equal(x.result.answer,null);assert.equal(x.result.review.callsMade,1);
  assert.equal(x.result.review.completed,false);assert.equal(x.result.reportedCostUsd,.0001);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-.0001)<1e-12);assert.equal(x.log.filter(r=>r.method==='POST').length,1);
});

for(const [label,row,code] of [
  ['invalid',{answer:{...answer('bad'),unknowns:null}},'BYOK_ANSWER_REJECTED'],
  ['truncated',{finish:'length'},'BYOK_OUTPUT_TRUNCATED'],
  ['citation',{answer:{claims:[{text:'bad',citations:['S999']}],nextTests:[],unknowns:[]}},'BYOK_ANSWER_REJECTED']
])test(`review ${label} never silently returns the draft as a completed review`,async t=>{
  const x=await run(t,[{},row]);
  assert.equal(x.result.code,code);assert.equal(x.result.answer,null);assert.equal(x.result.review.completed,false);
  assert.equal(x.result.review.callsMade,2);assert.equal(x.result.reportedCostUsd,.0002);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-.0002)<1e-12);
  assert.equal(JSON.stringify(x.result).includes('DRAFT_SYNTHETIC'),false);
});

test('missing draft cost stops review; missing review cost retains only its unresolved reservation',async t=>{
  const first=await run(t,[{cost:null},{}]);
  assert.equal(first.result.code,'BYOK_REVIEW_COST_UNKNOWN');assert.equal(first.result.reportedCostUsd,null);
  assert.equal(first.result.review.callsMade,1);assert.ok(first.result.reservedUsd>0);
  assert.ok(Math.abs(byokStatus(first.cwd).reservedUsd-first.result.reservedUsd)<1e-12);
  const second=await run(t,[{},{cost:null}]);
  assert.equal(second.result.status,'INTERPRETATION');assert.equal(second.result.reportedCostUsd,null);
  assert.ok(second.result.reservedUsd>.0001);assert.equal(second.result.passes[0].reportedCostUsd,.0001);
});

test('cost above reservation blocks further calls without hiding billed spend',async t=>{
  const x=await run(t,[{cost:.3},{}]);
  assert.equal(x.result.code,'BYOK_COST_EXCEEDED_RESERVATION');assert.equal(x.result.review.callsMade,1);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-.3)<1e-12);
  const meter=JSON.parse(fs.readFileSync(path.join(byokDirectory(x.cwd),'meter.json'),'utf8'));
  assert.equal(meter.blocked,true);assert.equal(x.result.reportedCostUsd,.3);
});

test('cancellation between passes does not send a review or discard the first cost',async t=>{
  const controller=new AbortController();
  const x=await run(t,[{},{}],{signal:controller.signal,provider:{onPost:i=>{if(i===0)controller.abort();}}});
  assert.equal(x.result.code,'BYOK_CANCELLED_OR_TIMEOUT');assert.equal(x.result.review.callsMade,1);
  assert.equal(x.result.answer,null);assert.equal(x.result.reportedCostUsd,.0001);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-.0001)<1e-12);
});

test('cached quality success or uncertainty never pays again; interrupted plan keeps its reservation',async t=>{
  for(const rows of [[{},{}],[{status:429},{}]]) {
    const x=await run(t,rows),before=byokStatus(x.cwd).reservedUsd;
    const cached=await interpretByok(x.cwd,{...options,consentDigest:x.preview.digest},{readSource:x.readSource,fetchImpl:()=>{throw new Error('no network');}});
    assert.equal(cached.cached,true);assert.equal(byokStatus(x.cwd).reservedUsd,before);
  }
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  writeByok(path.join(byokDirectory(f.cwd),'meter.json'),{schema:'idleproof.byok-meter.v1',reservedUsd:.02});
  writeByok(path.join(byokDirectory(f.cwd),`answer-${p.digest}.json`),{schema:'idleproof.byok-result.v1',status:'UNKNOWN',code:'BYOK_INTERRUPTED',reservedUsd:.02,answer:null});
  const cached=await interpretByok(f.cwd,{...options,consentDigest:p.digest},{readSource:f.readSource,fetchImpl:()=>{throw new Error('no network');}});
  assert.equal(cached.status,'UNKNOWN');assert.equal(cached.cached,true);assert.equal(byokStatus(f.cwd).reservedUsd,.02);
});

test('oversized draft has no implicit truncation or third call',()=>{
  const draft={claims:Array.from({length:8},()=>({text:'界'.repeat(1000),citations:['S1']})),nextTests:[],unknowns:[]};
  assert.throws(()=>boundedReviewMessages({question:'Explain',evidence:[]},draft),/REVIEW_CONTEXT_BUDGET/);
});

test('4096 output ceiling requires explicit configuration; existing limits are not silently raised',async t=>{
  const f=fixture(t);assert.equal(byokStatus(f.cwd).maxTokens,1000);
  configureByok(f.cwd,{model:'test/review',budgetUsd:1,maxRequestUsd:.1,maxTokens:4096},KEY);
  const p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});assert.equal(p.requestPolicy.maxTokens,4096);
  assert.throws(()=>configureByok(f.cwd,{model:'test/review',budgetUsd:1,maxRequestUsd:.1,maxTokens:4097},KEY),/CONFIG_INVALID/);
});

test('revision failure preserves the first known cost plus only the uncertain second reservation',async t=>{
  const x=await run(t,[{},{status:429}]);
  assert.equal(x.result.code,'BYOK_HTTP_429');assert.equal(x.result.reportedCostUsd,null);
  assert.equal(x.result.review.callsMade,2);assert.equal(x.result.passes[0].reportedCostUsd,.0001);
  assert.equal(x.result.passes[1].reportedCostUsd,null);assert.equal(x.result.answer,null);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-x.result.reservedUsd)<1e-12);
});

test('concurrent approved quality requests cannot make duplicate paid calls',async t=>{
  const f=fixture(t),preview=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  const log=[],base=provider(log);let release,entered;
  const began=new Promise(r=>{entered=r;});
  const fetchImpl=async(url,request)=>{if(url.endsWith('/models')){entered();await new Promise(r=>{release=r;});}return base(url,request);};
  const first=interpretByok(f.cwd,{...options,consentDigest:preview.digest},{readSource:f.readSource,fetchImpl});
  await began;
  await assert.rejects(interpretByok(f.cwd,{...options,consentDigest:preview.digest},{readSource:f.readSource,fetchImpl:()=>{throw new Error('no duplicate');}}));
  release();const result=await first;assert.equal(result.status,'INTERPRETATION');
  assert.equal(log.filter(r=>r.method==='POST').length,2);
});

test('review escaping and the original question keep their boundaries',async t=>{
  const x=await run(t,[{}, {answer:answer('<script>not executable</script>')}]);
  const html=renderByokResult(x.result);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  const posts=x.log.filter(r=>r.method==='POST').map(r=>JSON.parse(r.body));
  for(const p of posts)assert.equal(p.messages[2].content,options.question);
  assert.equal(x.result.answer.authority,'INFERRED');
});


test('review metadata is escaped even for a malformed historical record',()=>{
  const html=renderByokResult({status:'FALLBACK',code:'BYOK_INTERRUPTED',latencyMs:0,reportedCostUsd:null,review:{callsMade:'<img src=x onerror=alert(1)>',completed:false}});
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});


test('captured code without flattened clauses is not mislabeled as structure-only in the prompt',async t=>{
  const f=fixture(t),p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  assert.ok(p.packet.evidence.every(e=>e.descriptions.length===0));
  const system=groundedMessages(p.packet)[0].content;
  assert.doesNotMatch(system,/No behavior expressions are supplied/);
  assert.match(system,/predicted examples without executed tests/);
  const bare=await prepareByokPreview(f.cwd,{...options,includeSource:false},{readSource:f.readSource});
  assert.match(groundedMessages(bare.packet)[0].content,/No behavior expressions are supplied/);
});


test('configuration changes during asynchronous captured-source preparation invalidate the plan',async t=>{
  const f=fixture(t);let changed=false;
  const readSource=async(...args)=>{
    if(!changed){changed=true;configureByok(f.cwd,{model:'test/other',budgetUsd:1,maxRequestUsd:.05,maxTokens:1000},KEY);}
    return f.readSource(...args);
  };
  await assert.rejects(prepareByokPreview(f.cwd,options,{readSource}),/EXPLICIT_CONSENT_REQUIRED/);
  assert.equal(byokStatus(f.cwd).reservedUsd,0);
});
