import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configureByok,byokStatus,removeByok,previewByok,interpretByok,testByokConnection} from '../src/byok.mjs';
import {loadCredential,byokDirectory,writeByok} from '../src/byok-storage.mjs';
import {createHash} from 'node:crypto';

const KEY='sk-or-v1-SYNTHETIC_DO_NOT_TRANSMIT_1234567890';
function fixture(t){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'byok-offline-fixture-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const dir=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(dir,{recursive:true});
  const sid='dwscan_'+'a'.repeat(64),model={schema:'idleproof.project-scan.v1',header:{snapshotId:sid,source:'HEAD',coverage:{inventoryEntries:1,read:1}},unknowns:['Execution UNKNOWN'],files:[{path:'logic.py',role:'production',sourceSha256:'b'.repeat(64),extraction:{parsed:true,symbols:[{qualified_name:'logic.compute',line:1,end_line:2}],description:{behaviors:[{symbol:'compute',line:1,clauses:[{kind:'return-expression',line:2,text:'value * 2'}]}],intent:[],dependencies:[]}}}]};
  fs.writeFileSync(path.join(dir,sid+'.json'),JSON.stringify(model));fs.writeFileSync(path.join(dir,'HEAD.json'),JSON.stringify({snapshotId:sid,root:fs.realpathSync(cwd),sha256:createHash('sha256').update(JSON.stringify(model)).digest('hex')}));
  configureByok(cwd,{model:'test/fixture',budgetUsd:1,maxRequestUsd:.1,maxTokens:100},KEY);
  return cwd;
}
const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function provider(log,{status=200,answer=null,cost=.0001}={}){
  return async(url,options)=>{
    log.push({url,method:options.method,body:options.body});
    assert.equal(options.headers.Authorization,'Bearer '+KEY);
    assert.equal(options.redirect,'error');
    if(url.endsWith('/models'))return reply({data:[{id:'test/fixture',supported_parameters:['structured_outputs'],pricing:{prompt:'0.000001',completion:'0.000002',request:'0'}}]});
    if(url.endsWith('/key'))return reply({data:{limit:1,limit_remaining:1}});
    if(status!==200)return new Response('credential must never be copied: '+KEY,{status});
    const payload=answer||{claims:[{text:'The supplied expression doubles its input.',citations:['S1']}],nextTests:[{text:'Test zero and negative inputs.',citations:['S1']}],unknowns:['Execution was not observed.']};
    return reply({model:'test/fixture',choices:[{message:{content:JSON.stringify(payload)}}],usage:{prompt_tokens:40,completion_tokens:30,cost}});
  };
}

test('credentials stay protected locally; status is secret-free and removal is local only',t=>{
  const cwd=fixture(t),dir=byokDirectory(cwd);
  assert.equal(loadCredential(cwd),KEY);
  assert.equal(JSON.stringify(byokStatus(cwd)).includes(KEY),false);
  if(process.platform==='win32')assert.equal(fs.readFileSync(path.join(dir,'credential.json'),'utf8').includes(KEY),false);
  else assert.equal(fs.statSync(path.join(dir,'credential.json')).mode&0o777,0o600);
  const result=removeByok(cwd);assert.equal(result.configured,false);assert.match(result.providerRevocation,/separately revoke/);
  assert.equal(fs.existsSync(path.join(dir,'credential.json')),false);
});
test('explicit scoped preview is required, successful interpretation is cached and non-normative',async t=>{
  const cwd=fixture(t),options={includeSource:true,paths:['logic.py']},preview=previewByok(cwd,options),log=[];
  assert.match(JSON.stringify(preview.packet),/value \* 2/);
  assert.equal(JSON.stringify(previewByok(cwd).packet).includes('value * 2'),false);
  await assert.rejects(interpretByok(cwd,options,{fetchImpl:provider(log)}),/CONSENT/);assert.equal(log.length,0);
  const accepted=await interpretByok(cwd,{...options,consentDigest:preview.digest},{fetchImpl:provider(log)});
  assert.equal(accepted.status,'INTERPRETATION');assert.equal(accepted.answer.proof,'UNKNOWN');assert.equal(accepted.answer.authority,'INFERRED');
  assert.equal(accepted.reportedCostUsd,.0001);
  assert.equal((await interpretByok(cwd,{...options,consentDigest:preview.digest},{fetchImpl:()=>{throw new Error('must not call');}})).cached,true);
  assert.equal(log.filter(x=>x.method==='POST').length,1);
  await assert.rejects(interpretByok(cwd,{...options,question:'Changed question',consentDigest:preview.digest},{fetchImpl:provider(log)}),/CONSENT/);
});
test('auth/rate failures and forged citations fail closed, retaining deterministic output and uncertainty reservation',async t=>{
  for(const status of [401,403,429]){
    const cwd=fixture(t),preview=previewByok(cwd);
    const result=await interpretByok(cwd,{consentDigest:preview.digest},{fetchImpl:provider([],{status})});
    assert.equal(result.status,'FALLBACK');assert.equal(result.code,`BYOK_HTTP_${status}`);assert.equal(result.deterministicAvailable,true);assert.equal(JSON.stringify(result).includes(KEY),false);
    assert.ok(byokStatus(cwd).reservedUsd>0);
  }
  const cwd=fixture(t),preview=previewByok(cwd);
  const result=await interpretByok(cwd,{consentDigest:preview.digest},{fetchImpl:provider([],{answer:{claims:[{text:'Invented',citations:['S999']}],nextTests:[],unknowns:[]}})});
  assert.equal(result.code,'BYOK_ANSWER_REJECTED');assert.equal(result.answer,null);
});
test('exhausted budget and offline requests make no paid attempt',async t=>{
  const cwd=fixture(t),preview=previewByok(cwd),log=[];
  writeByok(path.join(byokDirectory(cwd),'meter.json'),{schema:'idleproof.byok-meter.v1',reservedUsd:1});
  let result=await interpretByok(cwd,{consentDigest:preview.digest},{fetchImpl:provider(log)});
  assert.equal(result.code,'BYOK_BUDGET_EXHAUSTED');assert.equal(log.some(x=>x.method==='POST'),false);
  result=await interpretByok(cwd,{consentDigest:preview.digest},{fetchImpl:async()=>{throw new TypeError(KEY);}});
  assert.equal(result.code,'BYOK_UNAVAILABLE');assert.equal(JSON.stringify(result).includes(KEY),false);
});

test('provider cap, cancellation and explicit connection test never generate without consent',async t=>{
  const cwd=fixture(t),preview=previewByok(cwd),log=[];
  const controller=new AbortController();controller.abort();
  let result=await interpretByok(cwd,{consentDigest:preview.digest},{signal:controller.signal,fetchImpl:provider(log)});
  assert.equal(result.code,'BYOK_CANCELLED_OR_TIMEOUT');assert.equal(log.length,0);
  const original=provider(log);
  result=await interpretByok(cwd,{consentDigest:preview.digest},{fetchImpl:async(url,options)=>url.endsWith('/key')?reply({data:{limit:null,limit_remaining:100}}):original(url,options)});
  assert.equal(result.code,'BYOK_PROVIDER_CAP_REQUIRED');assert.equal(log.some(x=>x.method==='POST'),false);
  await assert.rejects(testByokConnection(cwd,{fetchImpl:provider(log)}),/CONSENT/);
  const connected=await testByokConnection(cwd,{allowNetwork:true,fetchImpl:provider(log)});
  assert.equal(connected.status,'CONNECTED');assert.equal(connected.paidGeneration,false);assert.equal(connected.contextTransmitted,false);
  assert.equal(log.some(x=>x.method==='POST'),false);
});

test('malformed and oversized paid responses fail closed and cannot silently be charged twice',async t=>{
  const cwd=fixture(t);
  for(const [question,body,expected] of [['invalid','not-json','BYOK_INVALID_JSON'],['oversized','x'.repeat(128*1024+1),'BYOK_RESPONSE_BUDGET']]) {
    const options={question},preview=previewByok(cwd,options),log=[],original=provider(log);
    const result=await interpretByok(cwd,{...options,consentDigest:preview.digest},{fetchImpl:async(url,request)=>url.endsWith('/chat/completions')?new Response(body):original(url,request)});
    assert.equal(result.code,expected);assert.equal(result.answer,null);assert.ok(result.reservedUsd>0);
    const cached=await interpretByok(cwd,{...options,consentDigest:preview.digest},{fetchImpl:()=>{throw new Error('No retry authorized');}});
    assert.equal(cached.cached,true);assert.equal(cached.code,expected);
  }
});

test('human failures: truncation takes precedence, empty answers fail and diagnostics never contain raw output',async t=>{
  const cases=[
    ['length','not-json','BYOK_OUTPUT_TRUNCATED',null],
    ['length',JSON.stringify({claims:[],nextTests:[],unknowns:[]}),'BYOK_OUTPUT_TRUNCATED',null],
    ['stop','', 'BYOK_EMPTY_RESPONSE',null],
    ['stop','null','BYOK_ANSWER_REJECTED','ROOT_FIELDS'],
    ['stop',JSON.stringify({claims:[],nextTests:[],unknowns:['No execution observed']}),'BYOK_EMPTY_INTERPRETATION',null],
    ['stop',JSON.stringify({claims:[{text:KEY,citations:['S999']}],nextTests:[],unknowns:[]}),'BYOK_ANSWER_REJECTED','UNKNOWN_CITATION']
  ];
  const cwd=fixture(t);
  for(const [i,[finish,content,code,reason]] of cases.entries()) {
    const options={includeSource:true,question:`case ${i}`},p=previewByok(cwd,options),base=provider([]);
    const result=await interpretByok(cwd,{...options,consentDigest:p.digest},{fetchImpl:async(url,request)=>url.endsWith('/chat/completions')?reply({choices:[{finish_reason:finish,message:{content}}],usage:{cost:.00001,completion_tokens:2000,completion_tokens_details:{reasoning_tokens:2000}}}):base(url,request)});
    assert.equal(result.code,code);assert.equal(result.answer,null);
    assert.equal(result.reportedCostUsd,.00001);assert.equal(result.reservedUsd,.00001);
    assert.equal(result.diagnostics.reasoningTokens,2000);
    assert.equal(result.diagnostics.validationReason??null,reason);
    assert.equal(JSON.stringify(result).includes(KEY),false);
  }
});

test('reasoning is disabled when supported and the question is separate from untrusted project text',async t=>{
  const cwd=fixture(t),options={includeSource:true,question:'Explain this code in English'},p=previewByok(cwd,options),log=[],base=provider(log);
  const result=await interpretByok(cwd,{...options,consentDigest:p.digest},{fetchImpl:async(url,request)=>url.endsWith('/models')?reply({data:[{id:'test/fixture',supported_parameters:['reasoning','response_format'],pricing:{prompt:'0.000001',completion:'0.000002'}}]}):base(url,request)});
  assert.equal(result.status,'INTERPRETATION');
  const sent=JSON.parse(log.find(x=>x.method==='POST').body);
  assert.deepEqual(sent.reasoning,{enabled:false});assert.equal(sent.stream,false);
  assert.equal(sent.messages.at(-1).content,options.question);
  assert.match(sent.messages[0].content,/in English/);
  assert.equal(sent.provider.require_parameters,true);
});

test('explicit retry has fresh consent, preserves accounting and cannot replay a paid attempt',async t=>{
  const cwd=fixture(t),options={includeSource:true},p=previewByok(cwd,options),log=[];
  const failure=await interpretByok(cwd,{...options,consentDigest:p.digest},{fetchImpl:provider(log,{status:429})});
  const reserved=byokStatus(cwd).reservedUsd;
  const retryOptions={...options,retryOf:failure.digest},retry=previewByok(cwd,retryOptions);
  assert.notEqual(retry.digest,p.digest);assert.equal(byokStatus(cwd).reservedUsd,reserved);
  await assert.rejects(interpretByok(cwd,{...retryOptions,consentDigest:p.digest},{fetchImpl:provider(log)}),/CONSENT/);
  assert.throws(()=>previewByok(cwd,{...retryOptions,question:'different'}),/RETRY_INVALID/);
  const result=await interpretByok(cwd,{...retryOptions,consentDigest:retry.digest},{fetchImpl:provider(log)});
  assert.equal(result.status,'INTERPRETATION');assert.ok(Math.abs(byokStatus(cwd).reservedUsd-(reserved+.0001))<1e-12);
  const cached=await interpretByok(cwd,{...retryOptions,consentDigest:retry.digest},{fetchImpl:()=>{throw new Error('no duplicate charge');}});
  assert.equal(cached.cached,true);assert.equal(log.filter(x=>x.method==='POST').length,2);
  assert.throws(()=>previewByok(cwd,{...options,retryOf:result.digest}),/RETRY_INVALID/);
});
