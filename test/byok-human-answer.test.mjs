import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {questionChecklist,answerFirstPacket,humanAnswerSchema,unpackHumanAnswer,ANSWER_SCHEMA_BYTES} from '../src/byok-answer-plan.mjs';
import {groundedMessages,reviewReservations} from '../src/byok-review.mjs';
import {groundedPacket} from '../src/byok-grounding.mjs';
import {configureByok,byokStatus,previewByok,prepareByokPreview,interpretByok} from '../src/byok.mjs';
import {byokDirectory,writeByok} from '../src/byok-storage.mjs';
import {renderByokResult,renderByokPreview} from '../public/byok-view.js';

// Synthetic code and synthetic completions only. These are contract, coverage-
// link and rendering tests, NOT an evaluation of a live model's factual quality.
const KEY='sk-or-v1-SYNTHETIC_HUMAN_ANSWER_NEVER_TRANSMIT_1234567890';
const sha=s=>createHash('sha256').update(s).digest('hex');
const question='Explain what this does. Give the result for 239, then 240, and an inactive analyst at 240. Use simple English. Which calculation is used?';
const sid='dwscan_'+'b'.repeat(64);
const body='def discount(value):\n    return value * 0.75 if value >= 240 else value\n';
const entry={citation:'S1',snapshotId:sid,path:'tariff.py',sourceSha256:sha(body),role:'production',declarations:[],
  descriptions:[{name:'discount',clauses:[{line:2,text:'value * 0.75 if value >= 240 else value'}]}],
  ownerDeclarations:[{text:'Owner-declared objective',authority:'DECLARED'}],
  sourceExcerpt:{status:'captured-window',startLine:1,endLine:2,totalLines:2,truncated:false,code:body.trimEnd()}};
const packet=()=>answerFirstPacket({schema:'idleproof.byok-context.v1',question,includeSource:true,includeMemory:false,evidence:[structuredClone(entry)],recordedMemory:[],relations:[],unknowns:[]});
const legacy={claims:[{text:'Synthetic supported description.',citations:['S1']}],nextTests:[],unknowns:[]};
function wire(p,text='Synthetic explanation.') {
  return {claims:[{heading:'What happens',text,citations:['S1']}],nextTests:[],unknowns:[],
    coverage:p.answerPlan.points.map(({id})=>({questionId:id,kind:'answered',claims:[0],unknowns:[]}))};
}
function fixture(t) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'byok-human-answer-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const dir=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(dir,{recursive:true});
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId:sid,source:'HEAD',coverage:{inventoryEntries:1,read:1}},unknowns:[],edges:[],files:[{
    path:'tariff.py',role:'production',sourceSha256:sha(body),extraction:{parsed:true,symbols:[{qualified_name:'discount',line:1,end_line:2}],
      description:{behaviors:[{symbol:'discount',line:1,clauses:[{kind:'return-expression',line:2,text:'value * 0.75 if value >= 240 else value'}]}],intent:[],dependencies:[]}}}]};
  const data=JSON.stringify(model);fs.writeFileSync(path.join(dir,sid+'.json'),data);
  fs.writeFileSync(path.join(dir,'HEAD.json'),JSON.stringify({snapshotId:sid,root:fs.realpathSync(cwd),sha256:sha(data)}));
  configureByok(cwd,{model:'test/answer-first',budgetUsd:1,maxRequestUsd:.02,maxTokens:2000},KEY);
  const readSource=async(_cwd,e)=>({schema:'structure-source-1',snapshotId:sid,path:e.path,sourceSha256:e.sourceSha256,authority:'OBSERVED',totalLines:2,
    lines:body.trimEnd().split('\n').map((text,i)=>({line:i+1,text,truncated:false}))});
  return {cwd,readSource};
}
async function attempt(t,makeAnswer=(p,i)=>wire(p,i?'FINAL':'DRAFT'),opts={}) {
  const f=fixture(t),options={quality:true,includeSource:true,question,...opts};
  const preview=await prepareByokPreview(f.cwd,options,{readSource:f.readSource}),posts=[];
  const response=value=>new Response(JSON.stringify(value),{status:200});
  const fetchImpl=async(url,req)=>{
    if(url.endsWith('/models'))return response({data:[{id:'test/answer-first',supported_parameters:['structured_outputs'],pricing:{prompt:'0.00000001',completion:'0.0000001',request:'0'}}]});
    if(url.endsWith('/key'))return response({data:{limit:1,limit_remaining:1}});
    const sent=JSON.parse(req.body);posts.push(sent);assert.ok(posts.length<=2);
    return response({model:'test/answer-first',choices:[{finish_reason:'stop',message:{content:JSON.stringify(makeAnswer(preview.packet,posts.length-1))}}],usage:{prompt_tokens:100,completion_tokens:200,cost:.0001}});
  };
  const result=await interpretByok(f.cwd,{...options,consentDigest:preview.digest},{readSource:f.readSource,fetchImpl});
  return {...f,options,preview,posts,result};
}

test('the original multi-case question gets exact, stable spans without answer injection',()=>{
  const points=questionChecklist(question);
  assert.equal(points.length,6);
  assert.equal(points[1].text,'Give the result for 239,');
  assert.equal(points[2].text,'then 240,');
  assert.equal(points[3].text,'and an inactive analyst at 240.');
  for(const p of points)assert.equal(p.text,question.slice(p.start,p.end));
  assert.deepEqual(points,questionChecklist(question));
  assert.doesNotMatch(JSON.stringify(points),/180|PermissionError/,'no fixture answers injected');
});

test('decimal points, filenames, quoted code and call arguments are not split',()=>{
  const q='Read tariff.py and explain f(x, y) with 1.25 and 2,75. Explain `return "a, b. c"` next.';
  assert.equal(questionChecklist(q).length,2);
  assert.match(questionChecklist(q)[0].text,/f\(x, y\).*1\.25.*2,75/);
});

test('French apostrophes, non-Latin text and multiline lists keep their exact text',()=>{
  for(const q of ["Explique l'accès. Qui peut l'utiliser ?",'説明してください。 結果を示す。','Explain the role.\nShow the result;\nName the limitations.']) {
    const points=questionChecklist(q);assert.ok(points.length>=2);
    for(const p of points)assert.equal(p.text,q.slice(p.start,p.end));
  }
});

test('long outlines group overflow and do not silently drop trailing requests',()=>{
  const q=Array.from({length:30},(_,i)=>`Explain topic ${i}.`).join(' '),points=questionChecklist(q);
  assert.equal(points.length,16);assert.match(points.at(-1).text,/topic 29\.$/);
  assert.equal(points.map(p=>p.text).join(' '),q);
  assert.deepEqual(questionChecklist(''),[]);
});

test('complete code replaces duplicate clauses, but provenance, intentions and code stay exact',()=>{
  const before={question,includeSource:true,evidence:[structuredClone(entry)],recordedMemory:[]};
  const original=structuredClone(before),p=answerFirstPacket(before);
  assert.deepEqual(before,original,'no mutation of existing snapshot');
  assert.equal(p.evidence[0].sourceExcerpt.code,entry.sourceExcerpt.code);
  assert.equal(p.evidence[0].sourceSha256,entry.sourceSha256);
  assert.deepEqual(p.evidence[0].ownerDeclarations,entry.ownerDeclarations);
  assert.deepEqual(p.evidence[0].descriptions,[]);
  assert.match(p.evidence[0].descriptionRepresentation,/complete captured code/);
});

for(const [name,patch] of [['partial',{truncated:true}],['unknown-length',{totalLines:null}],['prefix',{startLine:2}],['redacted',{status:'redacted'}],['unavailable',{status:'unavailable'}]])test(`${name} source retains its available flattened description`,()=>{
  const e={...entry,sourceExcerpt:{...entry.sourceExcerpt,...patch}};
  const p=answerFirstPacket({question,includeSource:true,evidence:[e]});
  assert.deepEqual(p.evidence[0].descriptions,e.descriptions);
  assert.equal(p.evidence[0].descriptionRepresentation,undefined);
});

test('answer-first preparation never exceeds the existing packet cap or reads extra data',()=>{
  assert.throws(()=>answerFirstPacket({question,evidence:[],padding:'x'.repeat(24*1024)}),/CONTEXT_BUDGET/);
  const p=answerFirstPacket({question,includeSource:false,evidence:[{citation:'S1',path:'tariff.py'}],recordedMemory:[]});
  assert.equal(p.evidence[0].sourceExcerpt,undefined);
  assert.doesNotMatch(JSON.stringify(p),/0\.75/);
});

test('titles and coverage are additional strict fields without weakening original answer admission',()=>{
  const p=packet(),value=wire(p),u=unpackHumanAnswer(value,p);
  assert.deepEqual(u.base,{...legacy,claims:[{text:'Synthetic explanation.',citations:['S1']}]});
  assert.deepEqual(u.presentation.headings,['What happens']);
  assert.deepEqual(u.presentation.questionCoverage.missing,[]);
  assert.equal(u.presentation.questionCoverage.semanticVerified,false);
  assert.equal(u.presentation.questionCoverage.basis,'model-reported-links');
  assert.throws(()=>unpackHumanAnswer({...value,extra:'not allowed'},p),e=>e.validationReason==='ROOT_FIELDS');
});

for(const [name,mutate,reason] of [
  ['missing heading',v=>delete v.claims[0].heading,'HEADING_FORMAT'],
  ['empty heading',v=>v.claims[0].heading=' ','HEADING_FORMAT'],
  ['long heading',v=>v.claims[0].heading='h'.repeat(81),'HEADING_FORMAT'],
  ['unknown citation',v=>v.claims[0].citations=['S999'],'UNKNOWN_CITATION'],
  ['oversized text',v=>v.claims[0].text='x'.repeat(1001),'TEXT_LIMIT'],
  ['non-string gap',v=>v.unknowns=[{text:'not a string'}],'UNKNOWNS_FORMAT'],
  ['foreign question',v=>v.coverage[0].questionId='Q999','COVERAGE_FORMAT'],
  ['duplicate question',v=>v.coverage.push(v.coverage[0]),'COVERAGE_FORMAT'],
  ['missing answer section',v=>v.coverage[0].claims=[7],'COVERAGE_FORMAT'],
  ['negative index',v=>v.coverage[0].claims=[-1],'COVERAGE_FORMAT'],
  ['duplicate indexes',v=>v.coverage[0].claims=[0,0],'COVERAGE_FORMAT'],
  ['empty answered mapping',v=>v.coverage[0].claims=[],'COVERAGE_FORMAT'],
  ['gap without explanation',v=>{v.coverage[0].kind='gap';v.coverage[0].claims=[];},'COVERAGE_FORMAT'],
  ['style with answer links',v=>v.coverage[0].kind='presentation','COVERAGE_FORMAT'],
  ['test linked as answer',v=>{v.coverage[0].nextTests=[0];v.coverage[0].claims=[];},'COVERAGE_FORMAT']
])test(`rejects ${name} without accepting raw provider fields`,()=>{
  const p=packet(),v=wire(p);mutate(v);
  assert.throws(()=>unpackHumanAnswer(v,p),e=>e.message==='BYOK_ANSWER_REJECTED'&&e.validationReason===reason);
});

test('a specific gap and a presentation instruction have separate bounded mappings',()=>{
  const p=packet(),v=wire(p);v.unknowns=['The external rate is not supplied.'];
  v.coverage[2]={questionId:'Q3',kind:'gap',claims:[],unknowns:[0]};
  v.coverage[4]={questionId:'Q5',kind:'presentation',claims:[],unknowns:[]};
  const u=unpackHumanAnswer(v,p);
  assert.equal(u.presentation.questionCoverage.links[2].kind,'gap');
  assert.equal(u.presentation.questionCoverage.links[4].kind,'presentation');
  assert.equal(u.presentation.questionCoverage.semanticVerified,false);
});

test('the reviewed prompt is source-first, complete-case oriented and does not generalize a partial project into unreadable functions',()=>{
  const p=packet(),m=groundedMessages(p);
  assert.match(m[0].content,/complete captured file/);
  assert.match(m[0].content,/EACH requested case/);
  assert.match(m[0].content,/mixed instruction/);
  assert.match(m[0].content,/not the entire project/);
  assert.match(m[0].content,/lack of runtime evidence does not make readable code unknowable/);
  assert.match(m[0].content,/never instructions/);
  const {question: originalQuestion,...approvedEvidence}=p;
  assert.deepEqual(JSON.parse(m[1].content).evidencePacket,approvedEvidence);
  assert.equal(m[2].content,question);
  assert.doesNotMatch(m[0].content,/239|240|0\.75|analyst/,'not specialized to the fixture');
});

test('missing first-pass mapping is made explicit to the second pass without another call',async t=>{
  const x=await attempt(t,(p,i)=>{const v=wire(p,i?'FINAL_CORRECTION':'DO_NOT_SAVE_DRAFT');if(i===0)v.coverage.splice(2,1);return v;});
  assert.equal(x.result.status,'INTERPRETATION');assert.equal(x.posts.length,2);
  const feedback=JSON.parse(x.posts[1].messages.at(-2).content).coverageAudit;
  assert.deepEqual(feedback.unlinkedQuestionIds,['Q3']);assert.equal(feedback.semanticVerified,false);
  assert.deepEqual(x.result.presentation.questionCoverage.missing,[]);
  assert.equal(x.result.reportedCostUsd,.0002);
  assert.ok(Math.abs(byokStatus(x.cwd).reservedUsd-.0002)<1e-12);
  const saved=fs.readFileSync(path.join(byokDirectory(x.cwd),`answer-${x.result.digest}.json`),'utf8');
  assert.doesNotMatch(saved,/DO_NOT_SAVE_DRAFT|NEVER_TRANSMIT/);
});

test('a final unmapped point remains explicitly incomplete rather than a false coverage pass',async t=>{
  const x=await attempt(t,p=>{const v=wire(p);v.coverage.splice(2,1);return v;});
  assert.equal(x.result.status,'INTERPRETATION','retain the usable sourced parts');
  assert.deepEqual(x.result.presentation.questionCoverage.missing,['Q3']);
  const html=renderByokResult(x.result);
  assert.match(html,/needs completion/);assert.match(html,/then 240/);
  assert.match(html,/model-reported, not verified/);
  assert.equal(x.result.review.semanticVerified,false);assert.equal(x.result.review.callsMade,2);
});

test('malformed new mappings still fail closed with retained charged cost and safe diagnostics',async t=>{
  const x=await attempt(t,(p,i)=>{const v=wire(p);if(i)v.coverage[0].claims=[7];return v;});
  assert.equal(x.result.code,'BYOK_ANSWER_REJECTED');assert.equal(x.result.answer,null);
  assert.equal(x.result.diagnostics.validationReason,'COVERAGE_FORMAT');
  assert.equal(x.result.reportedCostUsd,.0002);assert.equal(x.posts.length,2);
  assert.equal(x.result.presentation,undefined);
});

test('new presentation renders the answer first and keeps checks secondary without altering prose or links',async t=>{
  const x=await attempt(t,p=>({...wire(p,'First paragraph.\nSecond line.'),nextTests:[{text:'Additional useful check.',citations:['S1']}],unknowns:['External rate is not supplied.']}));
  const html=renderByokResult(x.result);
  assert.match(html,/<h4>What happens<\/h4>/);assert.match(html,/First paragraph\. Second line\./,'existing whitespace/redaction policy remains intact');
  assert.match(html,/<details><summary>Suggested checks — not executed/);
  assert.match(html,/data-ai-source="tariff.py"/);assert.match(html,/id="aiSourceDetail" hidden/);
  assert.ok(html.indexOf('What happens')<html.indexOf('What the selected sources do not establish'));
  assert.ok(html.indexOf('What happens')<html.indexOf('Suggested checks'));
  assert.match(html,/Technical details and provenance/);
});

test('new titles, question text, missing mappings and answer text are escaped and secrets redacted',async t=>{
  const x=await attempt(t,p=>{const v=wire(p,'<img src=x onerror=alert(1)>');v.claims[0].heading='<script>title</script>';v.coverage=[];return v;},{question:'Explain <script>question</script>.'});
  const html=renderByokResult(x.result);
  assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);
  const p=packet(),v=wire(p);v.claims[0].heading=KEY;
  assert.equal(JSON.stringify(unpackHumanAnswer(v,p)).includes(KEY),false);
});

test('new output shape and schema fit the pre-reserved envelope; ordinary three-array schema is unchanged',async t=>{
  const x=await attempt(t),schema=x.posts[0].response_format.json_schema.schema;
  assert.deepEqual(schema.required,['claims','nextTests','unknowns','coverage']);
  assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.claims.maxItems,8);
  assert.equal(schema.properties.claims.items.properties.text.maxLength,1000);
  assert.equal(schema.properties.unknowns.items.maxLength,500);
  assert.equal(schema.properties.claims.items.properties.heading.maxLength,80);
  assert.ok(Buffer.byteLength(JSON.stringify(schema))<=ANSWER_SCHEMA_BYTES);
  assert.equal(x.posts[0].max_tokens,2000);assert.equal(x.posts[1].max_tokens,2000);
  assert.equal(x.result.review.maxCostUsd,.02);assert.equal(x.result.answer.requiresReview,true);
  assert.equal(x.result.answer.proof,'UNKNOWN');assert.equal(x.result.answer.authority,'INFERRED');
  assert.equal(x.preview.requestPolicy.answerFormat,'answer-first-v1');
  assert.match(renderByokPreview(x.preview),/Question checklist for the explanation/);
});

test('v7 consent and retained history cannot authorize the new format or reset previous spending',async t=>{
  const f=fixture(t),options={quality:true,includeSource:true,question},p=await prepareByokPreview(f.cwd,options,{readSource:f.readSource});
  const oldBase=previewByok(f.cwd,{...options,quality:false});
  const oldPacket=await groundedPacket(f.cwd,oldBase.packet,{readSource:f.readSource});
  const oldPolicy={...oldBase.requestPolicy,mode:'grounded-review',maxCalls:2,maxCostUsd:.02,deadlineMs:60000};
  const oldDigest=sha(JSON.stringify({packet:oldPacket,model:oldBase.model,requestPolicy:oldPolicy,version:7}));
  const old={schema:'idleproof.byok-result.v1',digest:oldDigest,status:'INTERPRETATION',answer:legacy};
  const file=path.join(byokDirectory(f.cwd),`answer-${oldDigest}.json`);writeByok(file,old);
  writeByok(path.join(byokDirectory(f.cwd),'meter.json'),{schema:'idleproof.byok-meter.v1',reservedUsd:.01});
  const bytes=fs.readFileSync(file);
  await assert.rejects(interpretByok(f.cwd,{...options,consentDigest:oldDigest},{readSource:f.readSource,fetchImpl:()=>{throw new Error('no network');}}),/CONSENT/);
  assert.notEqual(p.digest,oldDigest);assert.deepEqual(fs.readFileSync(file),bytes);
  assert.equal(byokStatus(f.cwd).reservedUsd,.01);
});

test('declared coverage is not a semantic verifier: a structurally linked but false statement is never marked verified',()=>{
  const p=packet(),v=wire(p,'This is a deliberately false statement for the contract test.');
  const u=unpackHumanAnswer(v,p);
  assert.equal(u.presentation.questionCoverage.semanticVerified,false);
  assert.equal(u.presentation.questionCoverage.verified,undefined);
});

test('historical v5-v7 responses keep their exact previous rendering',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/byok-legacy-render.json',import.meta.url),'utf8'));
  for(const example of fixture.examples)assert.equal(sha(renderByokResult(example.result)),example.expectedSha256);
});
