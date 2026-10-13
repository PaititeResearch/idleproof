import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEvidence,validateAnswer,completionDiagnostics,reasoningOptions} from '../src/byok-contract.mjs';
import {renderByokPreview,renderByokResult} from '../public/byok-view.js';
const file=(path,role='production',intent=[])=>({path,role,extraction:{description:{intent,behaviors:[{clauses:[{text:'value'}]}]}}});

test('balanced selection retains declared intentions, linked production and test candidates beyond alphabetic first twelve',()=>{
  const model={files:[...Array.from({length:15},(_,i)=>file(`a-config-${i}.json`,'configuration')),file('docs/intent.md','declared-document',['intent']),file('rules.py'),file('service.py'),file('view.py'),file('access_policy.py'),file('tests/test_rules.py','test'),file('tests/test_service.py','test')],edges:[{from:'service.py',to:'rules.py'},{from:'service.py',to:'access_policy.py'},{from:'view.py',to:'service.py'}],intentMap:{statements:[{components:[{path:'rules.py'},{path:'service.py'}]}]}};
  const selected=selectEvidence(model).map(f=>f.path);
  for(const p of ['docs/intent.md','rules.py','service.py','view.py','access_policy.py','tests/test_rules.py','tests/test_service.py'])assert.ok(selected.includes(p),p);
  assert.equal(selected.length,12);assert.deepEqual(selectEvidence(model,['rules.py']).map(f=>f.path),['rules.py']);
});
test('strict validation distinguishes missing and unknown citations and malformed roots',()=>{
  const known=new Set(['S1']);
  assert.equal(validateAnswer(null,known),'ROOT_FIELDS');
  assert.equal(validateAnswer({claims:[{text:'ok',citations:[]}],nextTests:[],unknowns:[]},known),'CITATIONS_REQUIRED');
  assert.equal(validateAnswer({claims:[{text:'ok',citations:['S9']}],nextTests:[],unknowns:[]},known),'UNKNOWN_CITATION');
  assert.equal(validateAnswer({claims:[{text:'ok',citations:['S1']}],nextTests:[],unknowns:[]},known),null);
});
test('diagnostics keep token counts without persisting reasoning, raw output or injected finish text',()=>{
  const d=completionDiagnostics({choices:[{finish_reason:'secret',message:{content:'raw secret',reasoning:'private'}}],usage:{completion_tokens:2000,completion_tokens_details:{reasoning_tokens:2000}}});
  assert.equal(d.finishReason,'unknown');assert.equal(d.reasoningTokens,2000);assert.equal(JSON.stringify(d).includes('secret'),false);
  assert.deepEqual(reasoningOptions({supported_parameters:[]}),{});
  assert.deepEqual(reasoningOptions({supported_parameters:['reasoning']}),{reasoning:{enabled:false}});
  assert.throws(()=>reasoningOptions({supported_parameters:['reasoning'],reasoning:{mandatory:true}}),/REASONING_REQUIRED/);
});
test('result renders sourced prose, escaped text and honest failure states with collapsed technical details',()=>{
  const evidence=[{citation:'S1',path:'rules.py',snapshotId:'snap'}];
  const html=renderByokResult({status:'INTERPRETATION',reportedCostUsd:.001,latencyMs:1234,evidence,answer:{claims:[{text:'<script>alert(1)</script>',citations:['S1']}],nextTests:[],unknowns:['No execution']}});
  assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/data-ai-source="rules.py"/);
  assert.match(html,/<details><summary>Détails techniques/);assert.ok(!html.includes('<details open'));
  const error=renderByokResult({status:'FALLBACK',code:'BYOK_OUTPUT_TRUNCATED',latencyMs:10,reportedCostUsd:null});
  assert.match(error,/atteint sa limite/);assert.match(error,/Coût réel inconnu/);
});
test('preview exposes all selected files and omitted count before consent',()=>{
  const html=renderByokPreview({model:'test/model',requestPolicy:{maxTokens:2000},packet:{evidence:[{citation:'S1',path:'rules.py'}],selection:{eligible:19,omitted:18},includeSource:true,includeMemory:false}});
  assert.match(html,/18 non transmis/);assert.match(html,/rules.py/);assert.match(html,/2000 tokens/);assert.match(html,/Voir exactement le contenu transmis/);
});
