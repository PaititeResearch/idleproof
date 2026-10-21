// Explicit experimental route. This module is never imported by hooks.
import {loadProjectScan,projectScanView,projectSource,projectHandoff} from './project-scan.mjs';
import {buildAtlas,projectAtlas,exportMermaid,ATLAS_SCHEMA} from './atlas-graph.mjs';
import {readAtlasOverlay,saveAtlasOverlay,atlasHistory,atlasRevision} from './atlas-store.mjs';
const cache=new WeakMap();
const fail=c=>{throw new Error(c);};
function current(cwd,source) {
  if(!['HEAD','WORKTREE'].includes(source))fail('ATLAS_SCOPE_INVALID');
  const model=loadProjectScan(cwd,source);if(!model)return null;
  if(!cache.has(model))cache.set(model,buildAtlas(model));
  return cache.get(model);
}
const source=(url,body)=>body?.source||url.searchParams.get('source')||'HEAD';
export async function atlasApi(cwd,req,url,body=null) {
  const selected=source(url,body),graph=current(cwd,selected);
  if(!graph){if(req.method!=='GET')fail('ATLAS_SCAN_REQUIRED');return {schema:ATLAS_SCHEMA,status:'NO_SCAN',message:'Create an explicit project scan in Local first. Atlas never scans or executes the repository.'};}
  const action=url.searchParams.get('action')||'view';
  if(req.method==='POST') {
    if(body?.action!=='save')fail('ATLAS_ACTION_INVALID');
    const {action:_action,source:_source,...write}=body;
    const saved=saveAtlasOverlay(cwd,graph,write);
    return {status:'SAVED',subject:saved.subject,revision:saved.revision,sequence:saved.sequence,overlay:saved.overlay};
  }
  if(req.method!=='GET')fail('ATLAS_METHOD_INVALID');
  if(action==='assurance') {
    const h=projectHandoff(cwd,selected,'project');
    return {snapshotId:graph.identity.snapshotId,memoryStatus:h.memoryStatus,knownDebt:h.navigation?.knownDebt||[],requiredEvidence:h.navigation?.requiredEvidence||[],warnings:h.navigation?.warnings||[],limitations:h.navigation?.limitations||'No received Core context. No debt or Proof inferred from this graph.'};
  }
  if(action==='history')return atlasHistory(cwd,graph);
  if(action==='revision')return atlasRevision(cwd,graph,url.searchParams.get('revision'));
  if(action==='source') {
    if(url.searchParams.get('snapshot')!==graph.identity.snapshotId)fail('ATLAS_STALE');
    const id=url.searchParams.get('node'),n=graph.nodes.find(n=>n.id===id);
    if(!n?.source)fail('ATLAS_NODE_UNAVAILABLE');
    const value=await projectSource(cwd,n.source.snapshotId,n.source.path,n.source.line);
    if(value.sourceSha256!==n.source.sourceSha256)fail('ATLAS_SOURCE_MISMATCH');return value;
  }
  const options={view:url.searchParams.get('view')||'modules',focus:url.searchParams.get('focus')||'',query:url.searchParams.get('query')||'',offset:Number(url.searchParams.get('offset')||0),depth:Number(url.searchParams.get('depth')||1)};
  const state=readAtlasOverlay(cwd,graph);
  if(action==='export') {
    const format=url.searchParams.get('format');
    if(format==='mermaid')return {format:'mermaid-classDiagram',snapshotId:graph.identity.snapshotId,graphDigest:graph.graphDigest,text:exportMermaid(graph,state.overlay,options)};
    if(format==='json')return {schema:'idleproof.atlas-export.v1',facts:graph,userModel:state,meaning:'User-model declarations are not extracted facts. Export is a private local snapshot, not Proof.'};
    fail('ATLAS_FORMAT_INVALID');
  }
  if(action!=='view')fail('ATLAS_ACTION_INVALID');
  // Reuse existing current-tree freshness only; no scan or project-code execution.
  const freshness=projectScanView(cwd,selected,{knownSnapshot:graph.identity.snapshotId}).freshness;
  return {schema:ATLAS_SCHEMA,status:'READY',identity:graph.identity,graphDigest:graph.graphDigest,coverage:graph.coverage,limits:graph.limits,capabilities:graph.capabilities,limitations:graph.limitations,unresolved:graph.unresolved,
    freshness,revision:state.revision,sequence:state.sequence,overlay:state.overlay,...projectAtlas(graph,state.overlay,options)};
}
export function atlasErrorStatus(e) {
  if(['ATLAS_CONFLICT','ATLAS_STALE','ATLAS_BUSY'].includes(e.message)||e.code==='ATLAS_BUSY')return 409;
  if(e.message==='ATLAS_SCAN_REQUIRED')return 412;
  if(['ATLAS_STORAGE_UNSAFE','ATLAS_HISTORY_INVALID'].includes(e.message))return 422;
  return 400;
}

// Bound bytes before JSON parsing. Oversized requests are drained without growing
// a retained buffer; this does not weaken the legacy server request path.
export function readAtlasBody(req) {
  return new Promise((resolve,reject)=>{
    let length=0,parts=[],failed=false;
    req.on('data',chunk=>{if(failed)return;length+=Buffer.byteLength(chunk);if(length>100000){failed=true;parts=[];reject(new Error('ATLAS_REQUEST_TOO_LARGE'));return;}parts.push(chunk);});
    req.on('end',()=>{if(failed)return;try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{reject(new Error('ATLAS_JSON_INVALID'));}});
    req.on('error',()=>reject(new Error('ATLAS_REQUEST_INTERRUPTED')));
    req.on('aborted',()=>reject(new Error('ATLAS_REQUEST_INTERRUPTED')));
  });
}
