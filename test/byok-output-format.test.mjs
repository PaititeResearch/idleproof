import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {configureByok, byokStatus, previewByok, interpretByok} from '../src/byok.mjs';
import {byokDirectory, writeByok} from '../src/byok-storage.mjs';
import {renderByokResult} from '../public/byok-view.js';

// Synthetic provider responses only. Reproduces each possible UNKNOWNS_FORMAT
// rejection, not the unavailable original HUMAN completion. No live network.
const KEY='sk-or-v1-SYNTHETIC_FORMAT_DO_NOT_TRANSMIT_1234567890';
const PRIVATE='UNTRUSTED_COMPLETION_MUST_NOT_APPEAR_IN_DIAGNOSTICS';
const valid={claims:[{text:'The supplied expression increments its input.',citations:['S1']}],nextTests:[],unknowns:[]};
const response=value=>new Response(JSON.stringify(value),{status:200});
function fixture(t) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'byok-format-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const dir=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(dir,{recursive:true});
  const sid='dwscan_'+'e'.repeat(64);
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId:sid,source:'HEAD',coverage:{inventoryEntries:1,read:1}},unknowns:['Execution UNKNOWN'],edges:[],files:[{
    path:'counter.py',role:'production',sourceSha256:'f'.repeat(64),extraction:{parsed:true,symbols:[{qualified_name:'increment',line:1,end_line:2}],
      description:{behaviors:[{symbol:'increment',line:1,clauses:[{kind:'return-expression',line:2,text:'value + 1'}]}],intent:[],dependencies:[]}}}]};
  const data=JSON.stringify(model);
  fs.writeFileSync(path.join(dir,sid+'.json'),data);
  fs.writeFileSync(path.join(dir,'HEAD.json'),JSON.stringify({snapshotId:sid,root:fs.realpathSync(cwd),sha256:createHash('sha256').update(data).digest('hex')}));
  configureByok(cwd,{model:'test/format',budgetUsd:1,maxRequestUsd:.1,maxTokens:1000},KEY);
  return cwd;
}
function provider(log,answer,{cost=.00018765792,finish='stop'}={}) {
  return async(url,options)=>{
    log.push({url,method:options.method,body:options.body});
    assert.equal(options.redirect,'error');
    if(url.endsWith('/models'))return response({data:[{id:'test/format',supported_parameters:['structured_outputs'],pricing:{prompt:'0.000001',completion:'0.000001',request:'0'}}]});
    if(url.endsWith('/key'))return response({data:{limit:1,limit_remaining:1}});
    assert.ok(url.endsWith('/chat/completions'),'no repair model or extra request');
    return response({model:'test/format',choices:[{finish_reason:finish,message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:642,completion_tokens_details:{reasoning_tokens:0},...(cost===null?{}:{cost})}});
  };
}
async function attempt(cwd,answer,extra={}) {
  const options={includeSource:true,question:'Explain the effect in French and say what is missing.'};
  const preview=previewByok(cwd,options),log=[];
  const result=await interpretByok(cwd,{...options,consentDigest:preview.digest},{fetchImpl:provider(log,answer,extra)});
  return {result,preview,options,log};
}

test('the sent policy explicitly defines required arrays and plain string unknowns with their unchanged limits',async t=>{
  const {log,result}=await attempt(fixture(t),valid);
  assert.equal(result.status,'INTERPRETATION');
  const sent=JSON.parse(log.find(row=>row.method==='POST').body),policy=sent.messages[0].content;
  assert.match(policy,/All three keys are required/);
  assert.match(policy,/unknowns must be an array of plain strings/);
  assert.match(policy,/never objects or null/);
  assert.match(policy,/500/);assert.match(policy,/1000/);
  assert.match(policy,/use \[\] when no proposed check is useful/);
  assert.doesNotMatch(policy,/nextTests is optional/);
  assert.match(policy,/at most 6 claims, 2 proposed checks and 3 unknowns/);
  const schema=sent.response_format.json_schema.schema;
  assert.equal(sent.response_format.json_schema.strict,true);
  assert.deepEqual(schema.required,['claims','nextTests','unknowns']);
  assert.equal(schema.properties.unknowns.type,'array');
  assert.equal(schema.properties.unknowns.maxItems,8);
  assert.equal(schema.properties.unknowns.items.type,'string');
  assert.equal(schema.properties.unknowns.items.maxLength,500);
  assert.match(schema.properties.unknowns.description,/plain strings/);
  assert.equal(schema.properties.claims.items.properties.text.maxLength,1000);
  assert.equal(sent.max_tokens,1000);assert.equal(sent.provider.require_parameters,true);
  assert.equal(sent.provider.data_collection,'deny');
  assert.equal(log.filter(row=>row.method==='POST').length,1);
});

const malformed=[
  ['null',null,'UNKNOWNS_NOT_ARRAY','must be a list'],
  ['single string',PRIVATE,'UNKNOWNS_NOT_ARRAY','must be a list'],
  ['object',{[PRIVATE]:KEY},'UNKNOWNS_NOT_ARRAY','must be a list'],
  ['too many entries',Array.from({length:9},()=>PRIVATE),'UNKNOWNS_ITEM_LIMIT','more than 8'],
  ['structured entry',[{text:PRIVATE,citations:['S1'],[KEY]:true}],'UNKNOWN_NOT_STRING','plain text'],
  ['null entry',[null],'UNKNOWN_NOT_STRING','plain text'],
  ['empty entry',['   \t\n'],'UNKNOWN_EMPTY','empty'],
  ['long entry',[PRIVATE.repeat(20)],'UNKNOWN_TEXT_LIMIT','500'],
];
for(const [label,unknowns,detail,wording] of malformed)test(`rejects ${label} unknowns with safe detail, retained cost and no automatic retry`,async t=>{
  const cwd=fixture(t),{result,preview,options,log}=await attempt(cwd,{...valid,unknowns});
  assert.equal(result.status,'FALLBACK');assert.equal(result.code,'BYOK_ANSWER_REJECTED');
  assert.equal(result.answer,null);assert.equal(result.limitations,undefined);
  assert.equal(result.diagnostics.validationReason,'UNKNOWNS_FORMAT');
  assert.equal(result.diagnostics.validationDetail,detail);
  assert.equal(result.reportedCostUsd,.00018765792);assert.equal(result.reservedUsd,.00018765792);
  assert.equal(result.diagnostics.finishReason,'stop');assert.equal(result.diagnostics.outputTokens,642);
  const before=byokStatus(cwd).reservedUsd;
  const cached=await interpretByok(cwd,{...options,consentDigest:preview.digest},{fetchImpl:()=>{throw new Error('no second charge');}});
  assert.equal(cached.cached,true);assert.equal(cached.diagnostics.validationDetail,detail);
  assert.equal(byokStatus(cwd).reservedUsd,before);assert.equal(log.filter(row=>row.method==='POST').length,1);
  const stored=fs.readFileSync(path.join(byokDirectory(cwd),`answer-${preview.digest}.json`),'utf8');
  for(const text of [JSON.stringify(result),stored,renderByokResult(result)]) {
    assert.equal(text.includes(KEY),false);assert.equal(text.includes(PRIVATE),false);
    assert.equal(text.includes(valid.claims[0].text),false);
  }
  assert.match(renderByokResult(result),new RegExp(wording));
  assert.doesNotMatch(renderByokResult(result),/Explanation for review|More context is needed/);
});

test('valid empty and exact-boundary unknown lists still pass without normalization',async t=>{
  for(const unknowns of [[],['A missing detail.'],Array.from({length:8},()=> 'x'.repeat(500))]) {
    const {result}=await attempt(fixture(t),{...valid,unknowns});
    assert.equal(result.status,'INTERPRETATION');assert.deepEqual(result.answer.unknowns,unknowns);
    assert.equal(result.diagnostics.validationDetail,undefined);
  }
});

test('root, citation and truncation failures keep their precedence and never expose unknowns',async t=>{
  const invalid=[
    [{claims:valid.claims,nextTests:[]},'stop','BYOK_ANSWER_REJECTED','ROOT_FIELDS'],
    [{...valid,claims:[{text:PRIVATE,citations:['S999']}],unknowns:[{text:KEY}]},'stop','BYOK_ANSWER_REJECTED','UNKNOWN_CITATION'],
    [{...valid,unknowns:[{text:PRIVATE}]},'length','BYOK_OUTPUT_TRUNCATED',undefined],
  ];
  for(const [answer,finish,code,reason] of invalid) {
    const {result}=await attempt(fixture(t),answer,{finish});
    assert.equal(result.code,code);assert.equal(result.diagnostics.validationReason,reason);
    assert.equal(result.diagnostics.validationDetail,undefined);assert.equal(result.answer,null);
    assert.equal(JSON.stringify(result).includes(PRIVATE),false);assert.equal(JSON.stringify(result).includes(KEY),false);
  }
});

test('rejected unknowns with absent provider cost retain their reservation',async t=>{
  const cwd=fixture(t),{result}=await attempt(cwd,{...valid,unknowns:null},{cost:null});
  assert.equal(result.code,'BYOK_ANSWER_REJECTED');assert.equal(result.reportedCostUsd,null);
  assert.ok(result.reservedUsd>0);assert.equal(byokStatus(cwd).reservedUsd,result.reservedUsd);
});

test('format-policy update refuses v5 consent without payment and preserves the prior rejected attempt',async t=>{
  const cwd=fixture(t),options={includeSource:true,question:'Explain the effect.'},preview=previewByok(cwd,options);
  const oldDigest=createHash('sha256').update(JSON.stringify({packet:preview.packet,model:preview.model,maxTokens:preview.requestPolicy.maxTokens,version:5})).digest('hex');
  const oldFile=path.join(byokDirectory(cwd),`answer-${oldDigest}.json`);
  writeByok(oldFile,{schema:'idleproof.byok-result.v1',digest:oldDigest,contextDigest:oldDigest,status:'FALLBACK',code:'BYOK_ANSWER_REJECTED',diagnostics:{validationReason:'UNKNOWNS_FORMAT'},reportedCostUsd:.00018765792,answer:null});
  writeByok(path.join(byokDirectory(cwd),'meter.json'),{schema:'idleproof.byok-meter.v1',reservedUsd:.00018765792});
  const original=fs.readFileSync(oldFile),log=[];
  assert.notEqual(preview.digest,oldDigest);
  await assert.rejects(interpretByok(cwd,{...options,consentDigest:oldDigest},{fetchImpl:provider(log,valid)}),/CONSENT/);
  assert.equal(log.length,0);assert.equal(byokStatus(cwd).reservedUsd,.00018765792);
  assert.deepEqual(fs.readFileSync(oldFile),original);
  assert.throws(()=>previewByok(cwd,{...options,retryOf:oldDigest}),/RETRY_INVALID/);
});

test('legacy unknowns errors stay readable and unrecognized detail is not trusted as prose',()=>{
  const result={status:'FALLBACK',code:'BYOK_ANSWER_REJECTED',reportedCostUsd:.00018765792,diagnostics:{validationReason:'UNKNOWNS_FORMAT'}};
  assert.match(renderByokResult(result),/Invalid unknowns format/);
  const html=renderByokResult({...result,diagnostics:{...result.diagnostics,validationDetail:'<script>BAD</script>'}});
  assert.match(html,/Invalid unknowns format/);assert.doesNotMatch(html,/<script>/);
});


test('a foreign thrown error cannot inject arbitrary new diagnostic detail into the persisted result',async t=>{
  const cwd=fixture(t),options={includeSource:true,question:'Explain the rule.'},preview=previewByok(cwd,options),log=[];
  const base=provider(log,valid);
  const result=await interpretByok(cwd,{...options,consentDigest:preview.digest},{fetchImpl:async(url,request)=>{
    if(url.endsWith('/chat/completions')) {
      const error=new Error('BYOK_ANSWER_REJECTED');
      error.validationReason='UNKNOWNS_FORMAT';error.validationDetail=PRIVATE+KEY;throw error;
    }
    return base(url,request);
  }});
  assert.equal(result.diagnostics.validationDetail,undefined);
  const stored=fs.readFileSync(path.join(byokDirectory(cwd),`answer-${preview.digest}.json`),'utf8');
  assert.equal(stored.includes(PRIVATE),false);assert.equal(stored.includes(KEY),false);
});
