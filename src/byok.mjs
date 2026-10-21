// Optional network interpretation. Never imported by a hook or normative Core path.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadProjectScan,projectScanView} from './project-scan.mjs';
import {excludeLocalState} from './state.mjs';
import {loadContinuityContext} from './continuity.mjs';
import {redactPortalText} from './portal-snapshot.mjs';
import {byokDirectory,readByok,writeByok,byokLock,saveCredential,loadCredential} from './byok-storage.mjs';

import {REQUEST_VERSION,selectEvidence,validateAnswer,unknownsFormatDetail,completionDiagnostics,reasoningOptions} from './byok-contract.mjs';
import {buildByokMessages} from './byok-prompt.mjs';
import {groundedPacket} from './byok-grounding.mjs';
import {ANSWER_FORMAT,answerFirstPacket,humanAnswerSchema,unpackHumanAnswer} from './byok-answer-plan.mjs';
import {groundedMessages,reviewReservations,boundedReviewMessages} from './byok-review.mjs';

const ENDPOINT='https://openrouter.ai/api/v1';
const UNKNOWN_DETAILS=new Set(['UNKNOWNS_NOT_ARRAY','UNKNOWNS_ITEM_LIMIT','UNKNOWN_NOT_STRING','UNKNOWN_EMPTY','UNKNOWN_TEXT_LIMIT']);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const modelName=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,160}$/.test(v);
const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const files=cwd=>{const dir=byokDirectory(cwd);return {dir,config:path.join(dir,'config.json'),meter:path.join(dir,'meter.json')};};
const config=cwd=>{
  const value=readByok(files(cwd).config,{optional:true});
  if(value&&(!modelName(value.model)||value.schema!=='idleproof.byok-config.v1'||!nonnegative(value.budgetUsd)||!nonnegative(value.maxRequestUsd)||value.maxRequestUsd>value.budgetUsd||!Number.isInteger(value.maxTokens)||value.maxTokens<64||value.maxTokens>4096))throw new Error('BYOK_CONFIG_INVALID');
  return value;
};

export function configureByok(cwd,{model,budgetUsd,maxRequestUsd,maxTokens=800},credential) {
  if(!modelName(model)||!nonnegative(budgetUsd)||budgetUsd<=0||budgetUsd>100||!nonnegative(maxRequestUsd)||maxRequestUsd<=0||maxRequestUsd>budgetUsd||!Number.isInteger(maxTokens)||maxTokens<64||maxTokens>4096)throw new Error('BYOK_CONFIG_INVALID');
  const release=byokLock(cwd);
  try {
    excludeLocalState(cwd);
    saveCredential(cwd,credential);
    writeByok(files(cwd).config,{schema:'idleproof.byok-config.v1',provider:'openrouter',model,budgetUsd,maxRequestUsd,maxTokens});
    // Rotation/configuration never resets previously reserved spend.
    return byokStatus(cwd);
  }finally{release();}
}
export function byokStatus(cwd) {
  const selected=config(cwd),meter=readByok(files(cwd).meter,{optional:true});
  return {configured:Boolean(selected),provider:'openrouter',model:selected?.model||null,budgetUsd:selected?.budgetUsd??null,
    maxRequestUsd:selected?.maxRequestUsd??null,maxTokens:selected?.maxTokens??null,
    reservedUsd:meter?.reservedUsd||0,automaticRequests:false,credentialReturned:false};
}
export function removeByok(cwd) {
  const release=byokLock(cwd);
  try{for(const name of ['credential.json','config.json'])fs.rmSync(path.join(files(cwd).dir,name),{force:true});return {configured:false,providerRevocation:'Operator must separately revoke the key in OpenRouter.'};}finally{release();}
}

export function previewByok(cwd,{source='HEAD',paths=[],includeSource=false,includeMemory=false,question='Explain the known behavior, unknowns and next discriminating tests.',retryOf=null,quality=false}={}) {
  if(quality!==false)throw new Error('BYOK_SCOPE_INVALID');
  if(typeof question!=='string'||question.length>1200||!Array.isArray(paths)||paths.length>12||typeof includeSource!=='boolean'||typeof includeMemory!=='boolean')throw new Error('BYOK_SCOPE_INVALID');
  const selected=config(cwd);
  const model=loadProjectScan(cwd,source);
  if(!model)throw new Error('BYOK_SCAN_REQUIRED');
  const candidates=model.files.filter(f=>f.extraction);
  if(paths.some(p=>!candidates.some(f=>f.path===p)))throw new Error('BYOK_SCOPE_INVALID');
  const chosen=selectEvidence(model,paths);
  const chosenPaths=new Set(chosen.map(f=>f.path));
  const relations=(model.edges||[]).filter(e=>chosenPaths.has(e.from)&&chosenPaths.has(e.to)).slice(0,48).map(e=>({from:redactPortalText(e.from,4096),to:redactPortalText(e.to,4096),meaning:'Static import reference; execution and coverage UNKNOWN'}));
  if(chosen.some(f=>redactPortalText(f.path,4096)!==f.path))throw new Error('BYOK_SENSITIVE_PATH');
  const evidence=chosen.map((file,i)=>({citation:`S${i+1}`,snapshotId:model.header.snapshotId,path:file.path,sourceSha256:file.sourceSha256,
    role:file.role,roleAuthority:'INFERRED',parsed:file.extraction.parsed,
    declarations:file.extraction.symbols.slice(0,24).map(s=>({name:redactPortalText(s.qualified_name,200),line:s.line,endLine:s.end_line})),
    ...(includeSource?{descriptions:file.extraction.description.behaviors.slice(0,8).map(b=>({name:redactPortalText(b.symbol,200),line:b.line,
      clauses:b.clauses.slice(0,8).map(c=>({kind:c.kind,line:c.line,text:redactPortalText(c.text,300)}))})),
      ownerDeclarations:file.extraction.description.intent.slice(0,12).map(s=>({text:redactPortalText(s.text,400),line:s.line,authority:'DECLARED'}))}:{}),
    dependencies:file.extraction.description.dependencies.slice(0,16).map(d=>({name:redactPortalText(d.name,160),scope:d.scope,authority:'DECLARED'}))}));
  // The full preview is displayed before consent. It is never a canonical event.
  const context=includeMemory?loadContinuityContext(cwd,question,{timeoutMs:5000}):null;
  const recordedMemory=context?['objectives','decisions','invariants','failedApproaches','tasks'].flatMap(k=>context[k]||[]).filter(item=>redactPortalText(item.id,200)===item.id).slice(0,8).map((item,i)=>({citation:`M${i+1}`,id:item.id,kind:item.kind,label:redactPortalText(item.label,300),authority:item.epistemicStatus,source:item.source?{kind:'project-event',eventId:item.source.eventId,eventHash:item.source.eventHash}:null})):[];
  const taskId=projectScanView(cwd,source).task?.id||null;
  const packet={schema:'idleproof.byok-context.v1',snapshotId:model.header.snapshotId,source,question:redactPortalText(question,1200),
    includeSource,evidence,relations,selection:{mode:paths.length?'explicit':'balanced-static',selected:chosen.length,eligible:candidates.length,omitted:candidates.length-chosen.length,relationsOmitted:Math.max(0,(model.edges||[]).filter(e=>chosenPaths.has(e.from)&&chosenPaths.has(e.to)).length-relations.length)},coverage:model.header.coverage,unknowns:model.unknowns,
    task:taskId&&redactPortalText(taskId,200)===taskId?taskId:null,includeMemory,recordedMemory,memoryStatus:includeMemory?(context?'BOUNDED_RECORDED_CONTEXT':'UNAVAILABLE_OR_NO_MATCH'):'NOT_SELECTED'};
  if(Buffer.byteLength(JSON.stringify(packet))>24*1024)throw new Error('BYOK_CONTEXT_BUDGET');
  const contextDigest=hash({packet,model:selected?.model||null,maxTokens:selected?.maxTokens||null,version:REQUEST_VERSION});
  if(retryOf!==null) {
    if(typeof retryOf!=='string'||! /^[a-f0-9]{64}$/.test(retryOf))throw new Error('BYOK_RETRY_INVALID');
    const prior=readByok(path.join(files(cwd).dir,`answer-${retryOf}.json`),{optional:true});
    if(!prior||prior.contextDigest!==contextDigest||prior.status!=='FALLBACK')throw new Error('BYOK_RETRY_INVALID');
  }
  const digest=retryOf?hash({contextDigest,retryOf}):contextDigest;
  return {digest,contextDigest,packet,retryOf,requestPolicy:{maxTokens:selected?.maxTokens||null,reasoning:'disabled-when-supported',automaticRetries:false},configured:Boolean(selected),model:selected?.model||null,
    warning:'Explicit remote transmission of this redacted packet to OpenRouter. Source descriptions are included only when selected. Interpretation cannot establish Proof, debt or human mastery.'};
}

const answerSchema={type:'object',additionalProperties:false,required:['claims','nextTests','unknowns'],properties:{
  claims:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['text','citations'],properties:{text:{type:'string',maxLength:1000},citations:{type:'array',minItems:1,maxItems:8,items:{type:'string'}}}}},
  nextTests:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['text','citations'],properties:{text:{type:'string',maxLength:1000},citations:{type:'array',minItems:1,maxItems:8,items:{type:'string'}}}}},
  unknowns:{type:'array',description:'Required array of plain strings describing missing evidence; use [] when there are none. Never objects or null. At most 8 non-empty strings, each at most 500 characters.',maxItems:8,items:{type:'string',maxLength:500}}
}};
function admitAnswer(value,packet) {
  const known=new Set([...packet.evidence,...packet.recordedMemory].map(e=>e.citation));
  const reason=validateAnswer(value,known);
  if(reason){
    const error=new Error('BYOK_ANSWER_REJECTED');error.validationReason=reason;
    if(reason==='UNKNOWNS_FORMAT')error.validationDetail=unknownsFormatDetail(value.unknowns);
    throw error;
  }
  if(!value.claims.length) {
    // An abstention is not a successful interpretation. Preserve only schema-validated,
    // redacted limits so the user can fix the selection rather than pay for a blind retry.
    const error=new Error('BYOK_EMPTY_INTERPRETATION');
    if(value.unknowns.length)error.limitations=value.unknowns.map(v=>redactPortalText(v,500));
    throw error;
  }
  return {claims:value.claims.map(v=>({...v,text:redactPortalText(v.text,1000)})),nextTests:value.nextTests.map(v=>({...v,text:redactPortalText(v.text,1000)})),
    unknowns:value.unknowns.map(v=>redactPortalText(v,500)),authority:'INFERRED',origin:'openrouter',proof:'UNKNOWN',requiresReview:true};
}
async function boundedJson(response,limit) {
  if(!response.ok){await response.body?.cancel();throw new Error(`BYOK_HTTP_${response.status}`);}
  const reader=response.body.getReader(),parts=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw new Error('BYOK_RESPONSE_BUDGET');parts.push(value);}}
  catch(e){await reader.cancel();throw e;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{throw new Error('BYOK_INVALID_JSON');}
}
const safeCode=e=>/^BYOK_[A-Z0-9_]{1,50}$/.test(e?.message||'')?e.message:e?.name==='AbortError'?'BYOK_CANCELLED_OR_TIMEOUT':'BYOK_UNAVAILABLE';

export async function testByokConnection(cwd,{allowNetwork=false,fetchImpl=fetch,signal=null}={}) {
  if(allowNetwork!==true)throw new Error('BYOK_EXPLICIT_NETWORK_CONSENT_REQUIRED');
  const selected=config(cwd);if(!selected)throw new Error('BYOK_NOT_CONFIGURED');
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(cancel,15000);
  try {
    const credential=loadCredential(cwd);
    const request=async(route,limit)=>{controller.signal.throwIfAborted();return boundedJson(await fetchImpl(ENDPOINT+route,{method:'GET',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${credential}`}}),limit);};
    const key=(await request('/key',16384)).data,catalogue=await request('/models',8*1024*1024);
    const model=catalogue.data?.find(m=>m.id===selected.model);
    return {status:'CONNECTED',model:selected.model,modelAvailable:Boolean(model),structuredOutputAvailable:Boolean(model?.supported_parameters?.some(p=>['structured_outputs','response_format'].includes(p))),
      providerCapAcceptable:nonnegative(key?.limit)&&key.limit<=selected.budgetUsd&&nonnegative(key?.limit_remaining),contextTransmitted:false,paidGeneration:false};
  }catch(e){return {status:'UNAVAILABLE',code:safeCode(e),contextTransmitted:false,paidGeneration:false};}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

export async function interpretByok(cwd,options,{fetchImpl=fetch,signal=null,readCredential=loadCredential,readSource}={}) {
  if(options?.quality!==undefined&&typeof options.quality!=='boolean')throw new Error('BYOK_SCOPE_INVALID');
  if(options?.quality===true) {
    const preview=await prepareByokPreview(cwd,options,{readSource,signal});
    return interpretReviewedByok(cwd,options,preview,{fetchImpl,signal,readCredential});
  }
  const preview=previewByok(cwd,options);
  if(options?.consentDigest!==preview.digest)throw new Error('BYOK_EXPLICIT_CONSENT_REQUIRED');
  const selected=config(cwd);if(!selected)throw new Error('BYOK_NOT_CONFIGURED');
  const release=byokLock(cwd),controller=new AbortController();
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(cancel,30000),started=Date.now();
  const cacheFile=path.join(files(cwd).dir,`answer-${preview.digest}.json`);
  let reserved=0,meter=null,paidStarted=false,reportedCost=null,diagnostics=null;
  try {
    const cached=readByok(cacheFile,{optional:true});if(cached)return {...cached,cached:true};
    const credential=readCredential(cwd);
    const request=async(route,body,limit)=>{controller.signal.throwIfAborted();return boundedJson(await fetchImpl(ENDPOINT+route,{method:body?'POST':'GET',redirect:'error',signal:controller.signal,
      headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),limit);};
    const catalogue=await request('/models',null,8*1024*1024);
    const model=catalogue.data?.find(m=>m.id===selected.model);
    if(!model||!model.supported_parameters?.some(p=>['structured_outputs','response_format'].includes(p)))throw new Error('BYOK_MODEL_UNAVAILABLE');
    const reasoning=reasoningOptions(model);
    const pricing=model.pricing;
    const price={prompt:Number(pricing?.prompt),completion:Number(pricing?.completion),request:Number(pricing?.request??0)};
    if(Object.values(price).some(v=>!nonnegative(v)))throw new Error('BYOK_PRICE_UNKNOWN');
    const messages=buildByokMessages(preview.packet);
    reserved=(Buffer.byteLength(JSON.stringify(messages))+2048)*price.prompt+selected.maxTokens*price.completion+price.request;
    const key=(await request('/key',null,16384)).data;
    if(!nonnegative(key?.limit)||!nonnegative(key?.limit_remaining)||key.limit>selected.budgetUsd||key.limit_remaining<reserved)throw new Error('BYOK_PROVIDER_CAP_REQUIRED');
    meter=readByok(files(cwd).meter,{optional:true})||{schema:'idleproof.byok-meter.v1',reservedUsd:0};
    if(meter.blocked||!nonnegative(meter.reservedUsd)||reserved>selected.maxRequestUsd||meter.reservedUsd+reserved>selected.budgetUsd)throw new Error('BYOK_BUDGET_EXHAUSTED');
    controller.signal.throwIfAborted();
    meter.reservedUsd+=reserved;writeByok(files(cwd).meter,meter);
    // Persist uncertainty before any paid call. A crash/retry never silently pays twice.
    const pending={schema:'idleproof.byok-result.v1',digest:preview.digest,contextDigest:preview.contextDigest,status:'UNKNOWN',code:'BYOK_INTERRUPTED',reservedUsd:reserved,answer:null,deterministicAvailable:true};
    writeByok(cacheFile,pending);paidStarted=true;
    const result=await request('/chat/completions',{model:selected.model,messages,max_tokens:selected.maxTokens,temperature:0,stream:false,...reasoning,
      provider:{require_parameters:true,data_collection:'deny',max_price:{prompt:price.prompt*1e6,completion:price.completion*1e6,request:price.request}},
      response_format:{type:'json_schema',json_schema:{name:'grounded_project_interpretation',strict:true,schema:answerSchema}}},128*1024);
    const usage=result.usage||{};reportedCost=nonnegative(usage.cost)?usage.cost:null;
    diagnostics=completionDiagnostics(result);
    if(reportedCost!==null&&reportedCost>reserved){meter.reservedUsd+=reportedCost-reserved;meter.blocked=true;writeByok(files(cwd).meter,meter);throw new Error('BYOK_COST_EXCEEDED_RESERVATION');}
    if(reportedCost!==null&&reportedCost<=reserved){meter.reservedUsd-=reserved-reportedCost;writeByok(files(cwd).meter,meter);}
    if(diagnostics.finishReason==='length')throw new Error('BYOK_OUTPUT_TRUNCATED');
    if(diagnostics.finishReason==='content_filter')throw new Error('BYOK_CONTENT_FILTERED');
    if(!diagnostics.contentPresent)throw new Error('BYOK_EMPTY_RESPONSE');
    let parsed;try{parsed=JSON.parse(result.choices?.[0]?.message?.content);}catch{throw new Error('BYOK_INVALID_JSON');}
    const answer=admitAnswer(parsed,preview.packet);
    const safe={schema:'idleproof.byok-result.v1',digest:preview.digest,contextDigest:preview.contextDigest,diagnostics,status:'INTERPRETATION',model:selected.model,
      reportedModel:typeof result.model==='string'?redactPortalText(result.model,160):null,
      generatedAt:new Date().toISOString(),latencyMs:Date.now()-started,reportedCostUsd:reportedCost,reservedUsd:reportedCost??reserved,
      tokens:{input:Number.isInteger(usage.prompt_tokens)&&usage.prompt_tokens>=0?usage.prompt_tokens:null,output:Number.isInteger(usage.completion_tokens)&&usage.completion_tokens>=0?usage.completion_tokens:null},
      answer,evidence:[...preview.packet.evidence.map(({citation,snapshotId,path,sourceSha256})=>({citation,snapshotId,path,sourceSha256})),...preview.packet.recordedMemory.map(({citation,id,authority,source})=>({citation,id,authority,source}))],deterministicAvailable:true};
    writeByok(cacheFile,safe);return safe;
  }catch(error){
    const fallback={schema:'idleproof.byok-result.v1',digest:preview.digest,contextDigest:preview.contextDigest,status:'FALLBACK',code:safeCode(error),latencyMs:Date.now()-started,
      retryable:paidStarted&&!error.limitations?.length,
      ...(error.message==='BYOK_EMPTY_INTERPRETATION'&&error.limitations?.length?{limitations:error.limitations}:{}),
      diagnostics:{...diagnostics,...(error.validationReason?{validationReason:error.validationReason}:{}),
        ...(error.validationReason==='UNKNOWNS_FORMAT'&&UNKNOWN_DETAILS.has(error.validationDetail)?{validationDetail:error.validationDetail}:{})},
      reportedCostUsd:reportedCost,reservedUsd:paidStarted?(reportedCost??reserved):0,answer:null,deterministicAvailable:true};
    if(paidStarted)writeByok(cacheFile,fallback);
    return fallback;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);release();}
}

// Async preparation is opt-in; the existing synchronous preview and single-call
// path remain available. New windows are always visible and consent-bound.
export async function prepareByokPreview(cwd,options={},dependencies={}) {
  if(options.quality!==undefined&&typeof options.quality!=='boolean')throw new Error('BYOK_SCOPE_INVALID');
  if(options.quality!==true)return previewByok(cwd,options);
  const configuration=JSON.stringify(config(cwd));
  const base=previewByok(cwd,{...options,quality:false,retryOf:null});
  const packet=answerFirstPacket(await groundedPacket(cwd,base.packet,dependencies));
  const selected=config(cwd);
  if(JSON.stringify(selected)!==configuration)throw new Error('BYOK_EXPLICIT_CONSENT_REQUIRED');
  const requestPolicy={...base.requestPolicy,mode:'grounded-review',maxCalls:2,maxCostUsd:selected?.maxRequestUsd??null,deadlineMs:60000,answerFormat:ANSWER_FORMAT};
  const contextDigest=hash({packet,model:base.model,requestPolicy,version:REQUEST_VERSION});
  const retryOf=options.retryOf??null;
  if(retryOf!==null) {
    if(typeof retryOf!=='string'||!/^[a-f0-9]{64}$/.test(retryOf))throw new Error('BYOK_RETRY_INVALID');
    const prior=readByok(path.join(files(cwd).dir,`answer-${retryOf}.json`),{optional:true});
    if(!prior||prior.contextDigest!==contextDigest||prior.status!=='FALLBACK')throw new Error('BYOK_RETRY_INVALID');
  }
  return {...base,packet,requestPolicy,contextDigest,retryOf,digest:retryOf?hash({contextDigest,retryOf}):contextDigest,
    warning:'Approve the displayed source windows and up to two calls sharing one request budget. The draft is untrusted and the review is not proof. No automatic retries.'};
}

async function interpretReviewedByok(cwd,options,preview,{fetchImpl,signal,readCredential}) {
  if(options?.consentDigest!==preview.digest)throw new Error('BYOK_EXPLICIT_CONSENT_REQUIRED');
  const release=byokLock(cwd),controller=new AbortController();
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const started=Date.now(),timer=setTimeout(cancel,60000),cacheFile=path.join(files(cwd).dir,`answer-${preview.digest}.json`);
  let meter=null,funded=false,steps=[],diagnostics=null,finalResult=null;
  const calls=()=>steps.filter(s=>s.attempted).length;
  const retained=()=>steps.reduce((total,s)=>total+s.held,0);
  const cost=()=>steps.filter(s=>s.attempted).every(s=>s.cost!==null)?steps.filter(s=>s.attempted).reduce((total,s)=>total+s.cost,0):null;
  const passes=()=>steps.filter(s=>s.attempted).map(({stage,cost,held,diagnostics,reportedModel,provider})=>({stage,reportedCostUsd:cost,reservedUsd:held,diagnostics,reportedModel,provider}));
  const review=completed=>({mode:'grounded-review',maxCalls:2,callsMade:calls(),completed,semanticVerified:false,maxCostUsd:preview.requestPolicy.maxCostUsd});
  const pending=()=>({schema:'idleproof.byok-result.v1',digest:preview.digest,contextDigest:preview.contextDigest,status:'UNKNOWN',code:'BYOK_INTERRUPTED',reservedUsd:retained(),reportedCostUsd:cost(),review:review(false),passes:passes(),answer:null,deterministicAvailable:true});
  function releaseUnused() {
    if(!funded)return;
    let amount=0;for(const step of steps)if(!step.attempted){amount+=step.held;step.held=0;}
    if(amount){meter.reservedUsd=Math.max(0,meter.reservedUsd-amount);writeByok(files(cwd).meter,meter);}
  }
  try {
    // Preparation awaits Core reads. Recheck under the same lock as configuration
    // writes so a model/budget change cannot send an unapproved plan.
    const selected=config(cwd);if(!selected)throw new Error('BYOK_NOT_CONFIGURED');
    if(selected.model!==preview.model||selected.maxTokens!==preview.requestPolicy.maxTokens||selected.maxRequestUsd!==preview.requestPolicy.maxCostUsd)throw new Error('BYOK_EXPLICIT_CONSENT_REQUIRED');
    const cached=readByok(cacheFile,{optional:true});if(cached)return {...cached,cached:true};
    const structuredSchema=humanAnswerSchema(answerSchema,preview.packet);
    const credential=readCredential(cwd);
    const request=async(route,body,limit)=>{controller.signal.throwIfAborted();return boundedJson(await fetchImpl(ENDPOINT+route,{method:body?'POST':'GET',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),limit);};
    const catalogue=await request('/models',null,8*1024*1024),model=catalogue.data?.find(m=>m.id===selected.model);
    if(!model||!model.supported_parameters?.some(p=>['structured_outputs','response_format'].includes(p)))throw new Error('BYOK_MODEL_UNAVAILABLE');
    const reasoning=reasoningOptions(model),pricing=model.pricing;
    const price={prompt:Number(pricing?.prompt),completion:Number(pricing?.completion),request:Number(pricing?.request??0)};
    if(Object.values(price).some(v=>!nonnegative(v)))throw new Error('BYOK_PRICE_UNKNOWN');
    steps=reviewReservations(preview.packet,selected.maxTokens,price).map((reserved,i)=>({stage:i?'review':'draft',reserved,held:reserved,cost:null,attempted:false,diagnostics:null,reportedModel:null,provider:null}));
    const total=retained(),key=(await request('/key',null,16384)).data;
    if(!nonnegative(key?.limit)||!nonnegative(key?.limit_remaining)||key.limit>selected.budgetUsd||key.limit_remaining<total)throw new Error('BYOK_PROVIDER_CAP_REQUIRED');
    meter=readByok(files(cwd).meter,{optional:true})||{schema:'idleproof.byok-meter.v1',reservedUsd:0};
    if(meter.blocked||!nonnegative(meter.reservedUsd)||total>selected.maxRequestUsd||meter.reservedUsd+total>selected.budgetUsd)throw new Error('BYOK_BUDGET_EXHAUSTED');
    controller.signal.throwIfAborted();
    meter.reservedUsd+=total;writeByok(files(cwd).meter,meter);funded=true;
    writeByok(cacheFile,pending()); // Reserve the complete plan before any payment.
    let answer=null,presentation=null;
    for(const step of steps) {
      controller.signal.throwIfAborted();
      const messages=step.stage==='draft'?groundedMessages(preview.packet):boundedReviewMessages(preview.packet,answer,presentation);
      step.attempted=true;writeByok(cacheFile,pending());
      const result=await request('/chat/completions',{model:selected.model,messages,max_tokens:selected.maxTokens,temperature:0,stream:false,...reasoning,
        provider:{require_parameters:true,data_collection:'deny',max_price:{prompt:price.prompt*1e6,completion:price.completion*1e6,request:price.request}},
        response_format:{type:'json_schema',json_schema:{name:'grounded_project_interpretation',strict:true,schema:structuredSchema}}},128*1024);
      finalResult=result;
      step.diagnostics=diagnostics=completionDiagnostics(result);
      step.reportedModel=typeof result.model==='string'?redactPortalText(result.model,160):null;
      step.provider=typeof result.provider==='string'?redactPortalText(result.provider,120):null;
      step.cost=nonnegative(result.usage?.cost)?result.usage.cost:null;
      if(step.cost!==null) {
        meter.reservedUsd+=step.cost-step.held;step.held=step.cost;
        if(step.cost>step.reserved)meter.blocked=true;
        writeByok(files(cwd).meter,meter);writeByok(cacheFile,pending());
        if(meter.blocked)throw new Error('BYOK_COST_EXCEEDED_RESERVATION');
      }
      if(diagnostics.finishReason==='length')throw new Error('BYOK_OUTPUT_TRUNCATED');
      if(diagnostics.finishReason==='content_filter')throw new Error('BYOK_CONTENT_FILTERED');
      if(!diagnostics.contentPresent)throw new Error('BYOK_EMPTY_RESPONSE');
      let parsed;try{parsed=JSON.parse(result.choices?.[0]?.message?.content);}catch{throw new Error('BYOK_INVALID_JSON');}
      const unpacked=unpackHumanAnswer(parsed,preview.packet);
      answer=admitAnswer(unpacked.base,preview.packet);presentation=unpacked.presentation;
      // No second paid request while the first one's cost remains uncertain.
      if(step.stage==='draft'&&step.cost===null)throw new Error('BYOK_REVIEW_COST_UNKNOWN');
    }
    const sumTokens=key=>steps.every(s=>Number.isInteger(s.diagnostics?.[key]))?steps.reduce((sum,s)=>sum+s.diagnostics[key],0):null;
    const safe={schema:'idleproof.byok-result.v1',digest:preview.digest,contextDigest:preview.contextDigest,diagnostics,status:'INTERPRETATION',model:selected.model,
      reportedModel:typeof finalResult?.model==='string'?redactPortalText(finalResult.model,160):null,generatedAt:new Date().toISOString(),latencyMs:Date.now()-started,
      reportedCostUsd:cost(),reservedUsd:retained(),review:review(true),passes:passes(),tokens:{input:sumTokens('inputTokens'),output:sumTokens('outputTokens')},
      answer,presentation,evidence:[...preview.packet.evidence.map(({citation,snapshotId,path,sourceSha256})=>({citation,snapshotId,path,sourceSha256})),...preview.packet.recordedMemory.map(({citation,id,authority,source})=>({citation,id,authority,source}))],deterministicAvailable:true};
    writeByok(cacheFile,safe);return safe;
  }catch(error) {
    releaseUnused();
    const fallback={schema:'idleproof.byok-result.v1',digest:preview.digest,contextDigest:preview.contextDigest,status:'FALLBACK',code:safeCode(error),latencyMs:Date.now()-started,retryable:false,
      ...(error.message==='BYOK_EMPTY_INTERPRETATION'&&error.limitations?.length?{limitations:error.limitations}:{}),
      diagnostics:{...diagnostics,...(error.validationReason?{validationReason:error.validationReason}:{}),...(error.validationReason==='UNKNOWNS_FORMAT'&&UNKNOWN_DETAILS.has(error.validationDetail)?{validationDetail:error.validationDetail}:{})},
      reportedCostUsd:calls()?cost():null,reservedUsd:funded?retained():0,review:review(false),passes:passes(),answer:null,deterministicAvailable:true};
    if(calls())writeByok(cacheFile,fallback);
    return fallback;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);release();}
}
