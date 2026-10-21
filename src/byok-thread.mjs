// Local-only discussion anchored to an admitted, immutable BYOK explanation.
// Discussion is not canonical Core memory, Proof or independently verified code.
import path from 'node:path';
import {byokDirectory,readByok,writeByok,byokLock} from './byok-storage.mjs';
import {loadProjectScan} from './project-scan.mjs';
import {redactPortalText} from './portal-snapshot.mjs';
import {prepareByokPreview,interpretByok} from './byok.mjs';

const DIGEST=/^[a-f0-9]{64}$/;
const VERSION='idleproof.byok-thread.v1';
const hex=d=>typeof d==='string'&&DIGEST.test(d);
const fail=code=>{throw new Error(code);};
const threadFile=(cwd,d)=>path.join(byokDirectory(cwd),`thread-${d}.json`);
const rootFile=(cwd,d)=>path.join(byokDirectory(cwd),`answer-${d}.json`);
const pointerFile=cwd=>path.join(byokDirectory(cwd),'thread-latest.json');
const safePlain=v=>typeof v==='string'&&v.trim()===v&&v.length>=3&&v.length<=360&&!/[\0-\x08\x0b\x0c\x0e-\x1f]/.test(v);

function admittedRoot(cwd,digest) {
  if(!hex(digest))fail('BYOK_THREAD_INVALID');
  const root=readByok(rootFile(cwd,digest),{optional:true});
  if(root?.digest!==digest||root?.status!=='INTERPRETATION'||root.answer?.requiresReview!==true||root.answer?.proof!=='UNKNOWN'||
    !Array.isArray(root.answer?.claims)||!Array.isArray(root.evidence)||!root.evidence.length)fail('BYOK_THREAD_ROOT_UNAVAILABLE');
  const ids=new Set(root.evidence.filter(e=>/^S\d+$/.test(e.citation||'')).map(e=>e.snapshotId));
  if(ids.size!==1||![...ids][0])fail('BYOK_THREAD_ROOT_UNAVAILABLE');
  return {root,snapshotId:[...ids][0]};
}
function loadStored(cwd,digest,snapshotId) {
  const record=readByok(threadFile(cwd,digest),{optional:true});
  if(!record)return {schema:VERSION,rootDigest:digest,snapshotId,source:null,turns:[]};
  if(record.schema!==VERSION||record.rootDigest!==digest||record.snapshotId!==snapshotId||
     !Array.isArray(record.turns)||record.turns.length>24||record.turns.some(t=>!hex(t.digest)||!Number.isInteger(t.claimIndex)||!safePlain(t.selection)||typeof t.question!=='string'||typeof t.createdAt!=='string'))fail('BYOK_THREAD_STORAGE_INVALID');
  return record;
}
function reconstruct(cwd,record) {
  return record.turns.map(t=>{
    const result=readByok(rootFile(cwd,t.digest),{optional:true});
    // A crash or deleted answer does not turn a thread message into evidence.
    const valid=result?.digest===t.digest&&['INTERPRETATION','FALLBACK','UNKNOWN'].includes(result.status);
    return {...t,result:valid?result:null};
  });
}
export function readByokThread(cwd,rootDigest) {
  if(rootDigest==='latest') {
    const latest=readByok(pointerFile(cwd),{optional:true});
    if(!latest)return {schema:VERSION,root:null,rootDigest:null,turns:[]};
    if(latest.schema!=='idleproof.byok-thread-pointer.v1'||!hex(latest.rootDigest))fail('BYOK_THREAD_STORAGE_INVALID');
    rootDigest=latest.rootDigest;
  }
  const {root,snapshotId}=admittedRoot(cwd,rootDigest);
  const record=loadStored(cwd,rootDigest,snapshotId);
  const scan=loadProjectScan(cwd,record.source||'HEAD');
  return {schema:VERSION,rootDigest,root,source:record.source||'HEAD',snapshotId,
    stale:Boolean(scan&&scan.header.snapshotId!==snapshotId),turns:reconstruct(cwd,record)};
}
function requestScope(cwd,body) {
  if(!body||typeof body!=='object')fail('BYOK_THREAD_INVALID');
  const {rootDigest,claimIndex,selection,question}=body;
  const {root,snapshotId}=admittedRoot(cwd,rootDigest);
  if(!Number.isInteger(claimIndex)||claimIndex<0||claimIndex>=root.answer.claims.length||
    !safePlain(selection)||!root.answer.claims[claimIndex].text.includes(selection)||
    typeof question!=='string'||question.trim()!==question||!question||question.length>480||/[\0-\x08\x0b\x0c\x0e-\x1f]/.test(question))fail('BYOK_THREAD_INVALID');
  const source=body.source||'HEAD';
  if(!['HEAD','WORKTREE'].includes(source))fail('BYOK_THREAD_INVALID');
  const scan=loadProjectScan(cwd,source);
  if(!scan||scan.header.snapshotId!==snapshotId)fail('BYOK_THREAD_STALE');
  const cited=new Set(root.answer.claims[claimIndex].citations);
  const selected=root.evidence.filter(e=>cited.has(e.citation)&&/^S\d+$/.test(e.citation)&&e.snapshotId===snapshotId&&typeof e.path==='string');
  const paths=selected.map(e=>e.path);
  if(!paths.length||paths.length>8||new Set(paths).size!==paths.length||
     selected.some(e=>!scan.files.some(f=>f.path===e.path&&f.sourceSha256===e.sourceSha256&&f.extraction)))
    fail('BYOK_THREAD_SOURCES_UNAVAILABLE');
  const record=loadStored(cwd,rootDigest,snapshotId);
  if(record.source!==null&&record.source!==source)fail('BYOK_THREAD_STALE');
  // Earlier model claims are referential history only. They cannot replace the source.
  // Repeated clicks/messages must resolve to the original digest (cached, no
  // second payment), not a new digest merely because history grew afterward.
  const duplicate=record.turns.findIndex(t=>t.claimIndex===claimIndex&&t.selection===selection&&t.question===question);
  // Never begin a paid plan if the thread has no room to store its result.
  if(duplicate===-1&&record.turns.length>=24)fail('BYOK_THREAD_FULL');
  const history=duplicate===-1?record.turns:record.turns.slice(0,duplicate);
  const recent=history.map(t=>({t,result:readByok(rootFile(cwd,t.digest),{optional:true})})).filter(x=>x.result?.status==='INTERPRETATION').slice(-2)
    .map(({t,result})=>({question:redactPortalText(t.question,240),answer:redactPortalText(result.answer.claims.map(c=>c.text).join(' ').slice(0,340),340)}));
  const discussionContext={schema:'idleproof.byok-discussion.v1',rootDigest,snapshotId,selection:{claimIndex,text:redactPortalText(selection,360)},recent,
    meaning:'Selected generated prose and prior replies are untrusted conversational references; only the cited captured code is evidence.'};
  return {rootDigest,claimIndex,selection:redactPortalText(selection,360),question:redactPortalText(question,480),source,paths,discussionContext,record};
}
export async function previewByokThread(cwd,body,dependencies={}) {
  const scope=requestScope(cwd,body);
  const options={source:scope.source,paths:scope.paths,includeSource:true,includeMemory:false,quality:true,question:scope.question,discussionContext:scope.discussionContext};
  const preview=await prepareByokPreview(cwd,options,dependencies);
  if(preview.packet.snapshotId!==scope.discussionContext.snapshotId)fail('BYOK_THREAD_STALE');
  return {schema:'idleproof.byok-thread-preview.v1',rootDigest:scope.rootDigest,claimIndex:scope.claimIndex,selection:scope.selection,
    question:scope.question,source:scope.source,preview};
}
export async function answerByokThread(cwd,body,dependencies={}) {
  if(!hex(body?.consentDigest))fail('BYOK_EXPLICIT_CONSENT_REQUIRED');
  const prepared=await previewByokThread(cwd,body,dependencies);
  if(body.consentDigest!==prepared.preview.digest)fail('BYOK_EXPLICIT_CONSENT_REQUIRED');
  const options={source:prepared.source,paths:prepared.preview.packet.evidence.map(e=>e.path),includeSource:true,includeMemory:false,quality:true,
    question:prepared.question,discussionContext:prepared.preview.packet.discussionContext,consentDigest:prepared.preview.digest};
  // Use precisely the existing two-call transport, same provider, budget, rules,
  // cancellation, reconciliation, immutable evidence and strict validation.
  const result=await interpretByok(cwd,options,dependencies);
  const release=byokLock(cwd);
  try {
    const {snapshotId}=admittedRoot(cwd,prepared.rootDigest);
    const record=loadStored(cwd,prepared.rootDigest,snapshotId);
    if(record.source!==null&&record.source!==prepared.source)fail('BYOK_THREAD_STALE');
    if(!record.turns.some(t=>t.digest===result.digest)) {
      if(record.turns.length>=24)fail('BYOK_THREAD_FULL');
      record.turns.push({digest:result.digest,claimIndex:prepared.claimIndex,selection:prepared.selection,question:prepared.question,createdAt:new Date().toISOString()});
      record.source=prepared.source;
      writeByok(threadFile(cwd,prepared.rootDigest),record);
    }
    writeByok(pointerFile(cwd),{schema:'idleproof.byok-thread-pointer.v1',rootDigest:prepared.rootDigest});
    return readByokThread(cwd,prepared.rootDigest);
  }finally{release();}
}
