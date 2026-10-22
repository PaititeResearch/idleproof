import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadProjectScan} from './project-scan.mjs';
import {digest} from './atlas-graph.mjs';
import {redactPortalText} from './portal-snapshot.mjs';
import {analyzeCapturedProject,capturedDeepInput,deepIdentity,projectDeep,DEEP_SCHEMA,DEEP_PROFILE} from './atlas-deep.mjs';
const jobs=new Map(),cache=new Map(),runtimeJobs=new Map();
const fail=code=>{throw new Error(code);};
const runtime={status:'UNAVAILABLE',reason:'No qualified runtime session attached. Use the explicit isolated fixture CLI for capability checks; no project execution endpoint exists.',sessions:[]};
const key=(cwd,model)=>digest({identity:deepIdentity(cwd,model),captureHeader:model.header,profile:DEEP_PROFILE,files:model.files.map(f=>[f.path,f.sourceSha256,Boolean(f.extraction)])});
const state=(cwd,model)=>{const id=key(cwd,model),job=jobs.get(fs.realpathSync(cwd)),visible=job&&(job.key===id||job.status==='RUNNING');return {schema:DEEP_SCHEMA,status:visible?job.status:cache.has(id)?'READY':'IDLE',identity:deepIdentity(cwd,model),job:visible?{id:job.id,status:job.status,snapshotId:job.snapshotId,stale:job.key!==id,startedAt:job.startedAt,finishedAt:job.finishedAt||null}:null,error:job?.key===id?job.error||null:null,runtime,support:model.header.source==='HEAD'?'IMMUTABLE_HEAD_ONLY':'WORKTREE_UNSUPPORTED',cache:'Process-local, bounded to three snapshots. Restart requires explicit reanalysis.'};};
export async function atlasDeepApi(cwd,req,url,body=null){
  const selected=body?.source||url.searchParams.get('source')||'HEAD';if(!['HEAD','WORKTREE'].includes(selected))fail('ATLAS_DEEP_SCOPE_INVALID');
  const model=loadProjectScan(cwd,selected);if(!model){if(req.method!=='GET')fail('ATLAS_DEEP_SCAN_REQUIRED');return {schema:DEEP_SCHEMA,status:'NO_SCAN',runtime,message:'Create a separate explicit Core scan first. Deep analysis never scans the repository.'};}
  const root=fs.realpathSync(cwd),cacheKey=key(cwd,model);
  if(req.method==='POST'){
    if(body.snapshotId!==model.header.snapshotId)fail('ATLAS_DEEP_STALE');
    const previous=jobs.get(root);
    if(body.action==='runtime-demo'){
      if(runtimeJobs.has(root)||previous?.status==='RUNNING')fail('ATLAS_DEEP_BUSY');
      const controller=new AbortController();runtimeJobs.set(root,controller);
      try{const {buildRuntimeDemo}=await import('./atlas-deep-runtime.mjs');return await buildRuntimeDemo({signal:controller.signal});}
      finally{runtimeJobs.delete(root);}
    }
    if(body.action==='cancel'){
      if(body.jobId&&previous?.id!==body.jobId)fail('ATLAS_DEEP_STALE');
      if(previous?.status==='RUNNING'){previous.controller.abort();previous.status='CANCELLED';previous.finishedAt=new Date().toISOString();}
      runtimeJobs.get(root)?.abort();
      return state(cwd,model);
    }
    if(body.action!=='analyze')fail('ATLAS_DEEP_ACTION_INVALID');
    if(model.header.source!=='HEAD')fail('ATLAS_DEEP_WORKTREE_UNSUPPORTED');
    if(previous?.status==='RUNNING'||runtimeJobs.has(root))fail('ATLAS_DEEP_BUSY');
    if(cache.has(cacheKey)){jobs.delete(root);return state(cwd,model);}
    const controller=new AbortController(),job={id:randomUUID(),key:cacheKey,snapshotId:model.header.snapshotId,status:'RUNNING',controller,startedAt:new Date().toISOString()};jobs.set(root,job);
    job.promise=analyzeCapturedProject(cwd,model,{signal:controller.signal}).then(graph=>{
      if(controller.signal.aborted||jobs.get(root)!==job)return;
      const current=loadProjectScan(cwd,selected);if(!current||key(cwd,current)!==cacheKey)fail('ATLAS_DEEP_STALE');
      cache.set(cacheKey,graph);while(cache.size>3)cache.delete(cache.keys().next().value);job.status='READY';
    }).catch(error=>{if(jobs.get(root)===job){job.status=controller.signal.aborted?'CANCELLED':'FAILED';job.error=/^ATLAS_DEEP_[A-Z_]+$/.test(error.message)?error.message:'ATLAS_DEEP_UNAVAILABLE';}}).finally(()=>{job.finishedAt=new Date().toISOString();});
    return state(cwd,model);
  }
  if(req.method!=='GET')fail('ATLAS_DEEP_METHOD_INVALID');
  const action=url.searchParams.get('action')||'status';if(action==='status')return state(cwd,model);
  const graph=cache.get(cacheKey);if(!graph)fail('ATLAS_DEEP_ANALYSIS_REQUIRED');
  if(action==='export')return {...graph,status:'READY',runtime};
  if(action==='source'){
    if(url.searchParams.get('snapshot')!==graph.identity.snapshotId)fail('ATLAS_DEEP_STALE');
    const node=graph.nodes.find(n=>n.id===url.searchParams.get('node'));if(!node?.source)fail('ATLAS_DEEP_NODE_UNAVAILABLE');
    const file=model.files.find(f=>f.path===node.source.path&&f.sourceSha256===node.source.sourceSha256);if(!file)fail('ATLAS_DEEP_SOURCE_MISMATCH');
    const input=await capturedDeepInput(cwd,{...model,files:[file]}),text=input.files[0]?.content;if(text===undefined)fail('ATLAS_DEEP_SOURCE_MISMATCH');
    const start=node.source.line,lines=text.split('\n').slice(start-1,start+39).map((text,i)=>({line:start+i,text:redactPortalText(text,2000),truncated:text.length>2000}));
    return {schema:'structure-source-1',snapshotId:graph.identity.snapshotId,path:file.path,sourceSha256:file.sourceSha256,authority:'OBSERVED',lines,redacted:true,meaning:'Exact captured blob identity; displayed lines pass through local redaction.'};
  }
  if(action!=='graph')fail('ATLAS_DEEP_ACTION_INVALID');
  return projectDeep(graph,{view:url.searchParams.get('view')||'calls',focus:url.searchParams.get('focus')||'',query:url.searchParams.get('query')||'',offset:Number(url.searchParams.get('offset')||0)});
}
export function cancelAtlasDeep(cwd){let root;try{root=fs.realpathSync(cwd);}catch{root=path.resolve(cwd);}const job=jobs.get(root);if(job?.status==='RUNNING'){job.controller.abort();job.status='CANCELLED';}runtimeJobs.get(root)?.abort();}
export function deepErrorStatus(error){if(['ATLAS_DEEP_STALE','ATLAS_DEEP_BUSY'].includes(error.message))return 409;if(['ATLAS_DEEP_ANALYSIS_REQUIRED','ATLAS_DEEP_SCAN_REQUIRED'].includes(error.message))return 412;return 400;}
