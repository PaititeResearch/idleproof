// Pure presentation/coverage contract for the opt-in reviewed mode.
// A linked question is NOT a verified answer. No model, network or source reads.
import {validateAnswer,unknownsFormatDetail} from './byok-contract.mjs';
import {redactPortalText} from './portal-snapshot.mjs';

export const ANSWER_FORMAT='answer-first-v1';
export const ANSWER_SCHEMA_BYTES=4096;
const MAX_POINTS=16;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join(',')===expected;
const bytes=value=>Buffer.byteLength(JSON.stringify(value));

// Exact spans of the already-approved question, not a semantic parser. Quoted
// code, decimal separators and nested expressions stay together. Overflow is
// grouped into the last point, never dropped; the original question also stays.
export function questionChecklist(question='') {
  const text=String(question),spans=[];
  let start=0,quote=null,depth=0;
  const add=end=>{
    let a=start,b=end;
    while(a<b&&/\s/u.test(text[a]))a++;
    while(b>a&&/\s/u.test(text[b-1]))b--;
    if(a<b)spans.push({start:a,end:b,text:text.slice(a,b)});
    start=end;
  };
  for(let i=0;i<text.length;i++) {
    const c=text[i],prev=text[i-1]||'',next=text[i+1]||'';
    if(quote){if(c===quote&&prev!=='\\')quote=null;continue;}
    if(c==='`'||c==='"'||(c==="'"&&!/[\p{L}\p{N}]/u.test(prev))){quote=c;continue;}
    if('([{'.includes(c)){depth++;continue;}
    if(')]}'.includes(c)){depth=Math.max(0,depth-1);continue;}
    if(depth)continue;
    const decimal=(c==='.'||c===',')&&/\d/u.test(prev)&&/\d/u.test(next);
    const boundary=c==='\n'||c===';'||(!decimal&&c===','&&/\s/u.test(next))||(!decimal&&/[.!?。！？]/u.test(c)&&(!next||/\s/u.test(next)));
    if(boundary)add(i+1);
  }
  add(text.length);
  if(spans.length>MAX_POINTS){const tail=spans[MAX_POINTS-1];spans.splice(MAX_POINTS-1,Infinity,{start:tail.start,end:text.trimEnd().length,text:text.slice(tail.start).trimEnd()});}
  return spans.map((part,i)=>({id:`Q${i+1}`,...part}));
}

export function answerFirstPacket(packet) {
  const result=structuredClone(packet);
  // Keep immutable bytes and provenance. Only omit duplicate flattened behavior
  // descriptions when the complete captured file is present. Partial windows
  // retain descriptions which may contain useful expressions outside the window.
  for(const entry of result.evidence||[]) {
    const s=entry.sourceExcerpt;
    const complete=packet.includeSource===true&&s?.status==='captured-window'&&s.startLine===1&&s.truncated===false&&Number.isInteger(s.totalLines)&&s.endLine===s.totalLines;
    if(complete&&Array.isArray(entry.descriptions)&&entry.descriptions.length) {
      entry.descriptions=[];
      entry.descriptionRepresentation='complete captured code replaces duplicate flattened clauses';
    }
  }
  result.answerPlan={schema:'idleproof.question-checklist.v1',points:questionChecklist(result.question),
    meaning:'Exact question spans, including presentation instructions. Linking a response is model-reported, not semantic verification.'};
  if(bytes(result)>24*1024)throw new Error('BYOK_CONTEXT_BUDGET');
  return result;
}

export function humanAnswerSchema(baseSchema,packet) {
  const schema=structuredClone(baseSchema);
  const ids=(packet.answerPlan?.points||questionChecklist(packet.question)).map(p=>p.id);
  schema.required.push('coverage');
  schema.properties.claims.description='The complete direct answer: overview first, then short titled sections. Include every requested example and meaningful comparison here; do not substitute proposed tests.';
  schema.properties.claims.items.required.push('heading');
  schema.properties.claims.items.properties.heading={type:'string',minLength:1,maxLength:80,description:'A short helpful section title in the requested language.'};
  schema.properties.nextTests.description='Optional useful follow-up checks, never a substitute for answering the original question. Use [] when none are needed.';
  schema.properties.coverage={type:'array',maxItems:MAX_POINTS,description:'Link every Q point once to answer or gap indexes (zero-based). Use presentation only for language/style instructions. This is a coverage report, not a truth score.',items:{type:'object',additionalProperties:false,
    required:['questionId','kind','claims','unknowns'],properties:{
      questionId:{type:'string',...(ids.length?{enum:ids}:{})},kind:{type:'string',enum:['answered','gap','presentation']},
      claims:{type:'array',maxItems:8,items:{type:'integer',minimum:0,maximum:7}},
      unknowns:{type:'array',maxItems:8,items:{type:'integer',minimum:0,maximum:7}}
    }}};
  if(bytes(schema)>ANSWER_SCHEMA_BYTES)throw new Error('BYOK_CONTEXT_BUDGET');
  return schema;
}

function rejected(reason) {const error=new Error('BYOK_ANSWER_REJECTED');error.validationReason=reason;return error;}
const indexes=(values,length)=>Array.isArray(values)&&values.length<=8&&new Set(values).size===values.length&&values.every(n=>Number.isInteger(n)&&n>=0&&n<length);

// Admit legacy claims with the EXACT original validator, then admit new
// presentation data separately. Neither coverage nor a heading excuses an
// unsupported citation, malformed unknown, or overlong answer.
export function unpackHumanAnswer(value,packet) {
  if(!keys(value,'claims,coverage,nextTests,unknowns'))throw rejected('ROOT_FIELDS');
  const base={claims:Array.isArray(value.claims)?value.claims.map(c=>{
    if(!keys(c,'citations,heading,text'))return c;
    const {heading,...legacy}=c;return legacy;
  }):value.claims,nextTests:value.nextTests,unknowns:value.unknowns};
  const known=new Set([...(packet.evidence||[]),...(packet.recordedMemory||[])].map(e=>e.citation));
  const reason=validateAnswer(base,known);
  if(reason){const error=rejected(reason);if(reason==='UNKNOWNS_FORMAT')error.validationDetail=unknownsFormatDetail(value.unknowns);throw error;}
  if(value.claims.some(c=>typeof c.heading!=='string'||!c.heading.trim()||c.heading.length>80))throw rejected('HEADING_FORMAT');
  if(!Array.isArray(value.coverage)||value.coverage.length>MAX_POINTS)throw rejected('COVERAGE_FORMAT');
  const points=packet.answerPlan?.points||questionChecklist(packet.question),allowed=new Set(points.map(p=>p.id)),seen=new Set();
  for(const row of value.coverage) {
    if(!keys(row,'claims,kind,questionId,unknowns')||!allowed.has(row.questionId)||seen.has(row.questionId)||!['answered','gap','presentation'].includes(row.kind)||!indexes(row.claims,base.claims.length)||!indexes(row.unknowns,base.unknowns.length))throw rejected('COVERAGE_FORMAT');
    if((row.kind==='answered'&&(!row.claims.length||row.unknowns.length))||(row.kind==='gap'&&!row.unknowns.length)||(row.kind==='presentation'&&(row.claims.length||row.unknowns.length)))throw rejected('COVERAGE_FORMAT');
    seen.add(row.questionId);
  }
  const missing=points.filter(p=>!seen.has(p.id)).map(p=>p.id);
  return {base,presentation:{schema:'idleproof.byok-presentation.v1',format:ANSWER_FORMAT,
    headings:value.claims.map(c=>redactPortalText(c.heading,80)),
    questionCoverage:{basis:'model-reported-links',semanticVerified:false,points:points.map(({id,text})=>({id,text})),
      links:value.coverage.map(row=>({...row,claims:[...row.claims],unknowns:[...row.unknowns]})),missing}
  }};
}

export function wireHumanDraft(answer,presentation) {
  return {claims:answer.claims.map((c,i)=>({...c,heading:presentation?.headings?.[i]||'Draft section'})),nextTests:answer.nextTests,unknowns:answer.unknowns,
    coverage:presentation?.questionCoverage?.links||[]};
}
