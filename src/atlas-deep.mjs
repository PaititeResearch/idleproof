// Experimental analysis of admitted immutable bytes. No hooks, provider calls or target imports.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {digest,SID,HASH} from './atlas-graph.mjs';
import {boundedProcess,analyzerEnv,DEEP_WORKER_ERRORS} from './atlas-deep-process.mjs';
export const DEEP_SCHEMA='idleproof.atlas-deep.v1';
export const DEEP_PROFILE='atlas-deep-static-1';
export const DEEP_LIMITS=Object.freeze({files:256,fileBytes:262144,totalBytes:4194304,nodes:30000,edges:60000,calls:20000,viewNodes:150,viewEdges:600,timeoutMs:60000});
const here=path.dirname(fileURLToPath(import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=s=>{throw new Error(s);};
const validPath=p=>typeof p==='string'&&p.length>0&&p.length<=4096&&!/[\\:\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const suffix=/\.(?:py|[cm]?js|jsx|tsx?|json|toml|sql|ya?ml)$/;
const sensitive=/(^\.env($|[.\-])|(^|[._-])(credentials?|secrets?|tokens?|passwords?)([._-]|$)|^id_(rsa|ed25519)|\.(pem|key|p12|pfx|keystore)$)/i;
const safeSelected=p=>validPath(p)&&!p.split('/').some(x=>sensitive.test(x)||['.git','.idleproof','node_modules','.venv','venv','vendor','dist','build','__pycache__'].includes(x));
export function deepIdentity(cwd,model){return {repositoryId:sha(fs.realpathSync(cwd)),snapshotId:model.header.snapshotId,tree:model.header.tree,source:model.header.source,profile:DEEP_PROFILE,captureProfile:model.header.profile||null,syntheticFixture:model.header.profile?.syntheticFixture===true};}

export async function capturedDeepInput(cwd,model,{signal}={}) {
  if(model?.schema!=='idleproof.project-scan.v1'||!SID.test(model.header?.snapshotId)||!Array.isArray(model.files)||model.files.length>20000)fail('ATLAS_DEEP_SCAN_INVALID');
  if(model.header.source!=='HEAD'||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(model.header.tree||''))fail('ATLAS_DEEP_WORKTREE_UNSUPPORTED');
  const identity=deepIdentity(cwd,model),coverage={inventory:model.header.coverage||{},admittedFiles:0,analyzedFiles:0,unsupportedFiles:0,omittedByLimit:0,bytes:0,scope:'Existing Core selection only; immutable HEAD blobs; no Markdown/context expansion.'};
  const candidates=[],seen=new Set();
  for(const f of model.files){
    if(!f.extraction||!f.sourceSha256)continue;
    if(!safeSelected(f.path)||!HASH.test(f.sourceSha256)||seen.has(f.path))fail('ATLAS_DEEP_SOURCE_INVALID');
    seen.add(f.path);coverage.admittedFiles++;
    if(!suffix.test(f.path)){coverage.unsupportedFiles++;continue;}candidates.push(f);
  }
  const git=(args,maxBytes)=>boundedProcess('git',['--no-optional-locks','--literal-pathspecs','-c','core.fsmonitor=false','-c','protocol.allow=never',...args],{cwd,signal,maxBytes,timeoutMs:10000,env:{...analyzerEnv(),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:'',GIT_TERMINAL_PROMPT:'0'}});
  const manifest=await git(['ls-tree','-r','-z','--full-tree',identity.tree],8*1024*1024);
  const entries=new Map();
  for(const row of manifest.toString('utf8').split('\0').filter(Boolean)){const i=row.indexOf('\t'),header=row.slice(0,i).split(' '),p=row.slice(i+1);if(i<0||entries.has(p))fail('ATLAS_DEEP_TREE_INVALID');entries.set(p,{mode:header[0],kind:header[1],oid:header[2]});}
  const files=[];
  for(const f of candidates.sort((a,b)=>a.path<b.path?-1:1)){
    const entry=entries.get(f.path);
    if(!entry||entry.kind!=='blob'||!['100644','100755'].includes(entry.mode)||!/^[a-f0-9]{40,64}$/.test(entry.oid))fail('ATLAS_DEEP_SOURCE_MISMATCH');
    if(files.length>=DEEP_LIMITS.files){coverage.omittedByLimit++;continue;}
    const size=Number((await git(['cat-file','-s',entry.oid],100)).toString('ascii').trim());
    if(!Number.isSafeInteger(size)||size<0)fail('ATLAS_DEEP_TREE_INVALID');
    if(size>DEEP_LIMITS.fileBytes||coverage.bytes+size>DEEP_LIMITS.totalBytes){coverage.omittedByLimit++;continue;}
    const bytes=await git(['cat-file','blob',entry.oid],DEEP_LIMITS.fileBytes);
    if(bytes.length!==size||sha(bytes)!==f.sourceSha256)fail('ATLAS_DEEP_SOURCE_MISMATCH');
    let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('ATLAS_DEEP_ENCODING_UNSUPPORTED');}
    if(content.includes('\0'))fail('ATLAS_DEEP_ENCODING_UNSUPPORTED');
    files.push({path:f.path,sourceSha256:f.sourceSha256,content});coverage.bytes+=size;
  }
  coverage.analyzedFiles=files.length;coverage.complete=coverage.omittedByLimit===0&&coverage.unsupportedFiles===0;coverage.semanticCompleteness='UNKNOWN';
  return {identity,files,coverage};
}

export function admitDeepResults(input,results) {
  if(!Array.isArray(results)||results.length>4)fail('ATLAS_DEEP_SCHEMA_INVALID');
  const files=new Map(input.files.map(f=>[f.path,{...f,lineBytes:f.content.split('\n').map(line=>Buffer.byteLength(line))}])),nodes=[],edges=[],callSites=[],ids=new Set(),edgeIds=new Set(),providers=[],capabilities=Object.create(null),providerCoverage=Object.create(null),limitations=[],providerVersions=new Map();
  const source=s=>{const f=files.get(s?.path);if(!f||s.snapshotId!==input.identity.snapshotId||s.sourceSha256!==f.sourceSha256||!Number.isInteger(s.line)||s.line<1||!Number.isInteger(s.endLine)||s.endLine<s.line||s.endLine>f.lineBytes.length||providerVersions.get(s.provider)!==String(s.providerVersion)||!['python','javascript','typescript','json','toml','sql','yaml'].includes(s.language))fail('ATLAS_DEEP_PROVENANCE_INVALID');
    for(const k of ['column','endColumn'])if(s[k]!=null&&(!Number.isInteger(s[k])||s[k]<0||s[k]>1000000))fail('ATLAS_DEEP_PROVENANCE_INVALID');
    if(s.locationScope!=null&&!['file-anchor','exact-span'].includes(s.locationScope))fail('ATLAS_DEEP_PROVENANCE_INVALID');
    const ext=f.path.split('.').at(-1),language=({py:'python',js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',json:'json',toml:'toml',sql:'sql',yaml:'yaml',yml:'yaml'})[ext];
    if(s.language!==language)fail('ATLAS_DEEP_PROVENANCE_INVALID');
    if((s.column!=null&&s.column>f.lineBytes[s.line-1])||(s.endColumn!=null&&s.endColumn>f.lineBytes[s.endLine-1])||(s.line===s.endLine&&s.column!=null&&s.endColumn!=null&&s.endColumn<s.column))fail('ATLAS_DEEP_PROVENANCE_INVALID');
  };
  const string=(s,max=500)=>typeof s==='string'&&s.length>0&&s.length<=max;
  const identifier=s=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9_:.\-]{1,150}$/.test(s);
  for(const r of results){
    if(!r||!string(r.provider?.name,100)||!/^[a-z][a-z0-9-]+$/.test(r.provider.name)||!string(r.provider?.version,100)||!Array.isArray(r.nodes)||!Array.isArray(r.edges)||!Array.isArray(r.callSites)||!Array.isArray(r.limitations))fail('ATLAS_DEEP_SCHEMA_INVALID');
    if(r.error||(r.status&&!['READY','PARTIAL','COMPLETE'].includes(r.status)))fail('ATLAS_DEEP_PROVIDER_UNAVAILABLE');
    if(providerVersions.has(r.provider.name))fail('ATLAS_DEEP_SCHEMA_INVALID');providerVersions.set(r.provider.name,String(r.provider.version));
    for(const record of [...r.nodes,...r.edges,...r.callSites]){if(record?.source?.provider!==r.provider.name||record?.source?.providerVersion!==r.provider.version)fail('ATLAS_DEEP_PROVENANCE_INVALID');source(record.source);}
    providers.push(r.provider);providerCoverage[r.provider.name]=r.coverage||{};capabilities[r.provider.name]=r.capabilities||{};
    for(const l of r.limitations){if(!string(l,4000))fail('ATLAS_DEEP_SCHEMA_INVALID');limitations.push(l);}
    for(const n of r.nodes){if(!identifier(n.id)||ids.has(n.id)||!string(n.kind,100)||!string(n.label,4096)||n.authority!=='OBSERVED')fail('ATLAS_DEEP_NODE_INVALID');source(n.source);if(n.path!==n.source.path)fail('ATLAS_DEEP_PROVENANCE_INVALID');ids.add(n.id);nodes.push(n);}
    edges.push(...r.edges);callSites.push(...r.callSites);
  }
  if(nodes.length>DEEP_LIMITS.nodes||edges.length>DEEP_LIMITS.edges||callSites.length>DEEP_LIMITS.calls)fail('ATLAS_DEEP_GRAPH_LIMIT');
  for(const e of edges){if(!identifier(e.id)||edgeIds.has(e.id)||!ids.has(e.from)||!ids.has(e.to)||!string(e.kind,100)||!['OBSERVED','INFERRED','POSSIBLE'].includes(e.authority))fail('ATLAS_DEEP_EDGE_INVALID');source(e.source);if(e.kind==='CALLS'&&e.authority!=='INFERRED')fail('ATLAS_DEEP_AUTHORITY_INVALID');if(e.kind==='MAY_CALL'&&e.authority!=='POSSIBLE')fail('ATLAS_DEEP_AUTHORITY_INVALID');edgeIds.add(e.id);}
  const callIds=new Set();
  for(const c of callSites){if(!ids.has(c.id)||callIds.has(c.id)||!ids.has(c.callerId)||!['RESOLVED','AMBIGUOUS','UNKNOWN','EXTERNAL'].includes(c.status)||!Array.isArray(c.targetIds)||c.targetIds.some(t=>!ids.has(t))||!string(c.reason,4000))fail('ATLAS_DEEP_CALL_INVALID');source(c.source);if(c.status==='RESOLVED'&&c.targetIds.length!==1)fail('ATLAS_DEEP_CALL_INVALID');callIds.add(c.id);}
  const byCall=new Map(callSites.map(c=>[c.id,c]));
  for(const e of edges.filter(e=>e.kind==='CALLS'||e.kind==='MAY_CALL')){const c=byCall.get(e.callSiteId);if(!c||(e.kind==='CALLS'&&c.status!=='RESOLVED')||c.callerId!==e.from||!c.targetIds.includes(e.to)||['path','sourceSha256','snapshotId','line','endLine','column','endColumn','provider','providerVersion'].some(k=>e.source[k]!==c.source[k]))fail('ATLAS_DEEP_AUTHORITY_INVALID');}
  nodes.sort((a,b)=>a.id.localeCompare(b.id,'en'));edges.sort((a,b)=>a.id.localeCompare(b.id,'en'));callSites.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const counts={total:callSites.length,resolved:0,ambiguous:0,unknown:0,external:0};for(const c of callSites)counts[c.status.toLowerCase()]++;
  const facts={schema:DEEP_SCHEMA,identity:input.identity,providers,nodes,edges,callSites,coverage:{...input.coverage,providers:providerCoverage,calls:counts,semanticCompleteness:'UNKNOWN'},capabilities,limitations:[...new Set(['Static targets are inferred within each provider contract, never execution or Proof.','Captured selection excludes files; absence and unobserved execution do not establish impossibility.',...limitations])],proof:'UNKNOWN',runtimeGraph:false,limits:DEEP_LIMITS};
  return {...facts,graphDigest:digest(facts)};
}

export async function analyzeCapturedProject(cwd,model,{signal,pythonCommand=process.env.IDLEPROOF_DEEP_PYTHON||(process.platform==='win32'?'python':'python3')}={}) {
  const controller=new AbortController(),abort=()=>controller.abort();let timedOut=false;
  if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;abort();},DEEP_LIMITS.timeoutMs);timer.unref();
  try{
    const start=performance.now(),input=await capturedDeepInput(cwd,model,{signal:controller.signal}),loaded=performance.now();
    const out=await boundedProcess(process.execPath,['--max-old-space-size=384',path.join(here,'atlas-deep-worker.mjs')],{cwd:here,input:JSON.stringify({...input,pythonCommand}),signal:controller.signal,env:analyzerEnv(),timeoutMs:DEEP_LIMITS.timeoutMs,processGroup:true});
    let results;try{results=JSON.parse(out.toString('utf8'));}catch{fail('ATLAS_DEEP_SCHEMA_INVALID');}
    if(results?.schema==='idleproof.atlas-deep-error.v1')fail(DEEP_WORKER_ERRORS.includes(results.error)?results.error:'ATLAS_DEEP_PROCESS_FAILED');
    const graph=admitDeepResults(input,results);
    return {...graph,metrics:{sourceReadMs:loaded-start,analysisAndAdmissionMs:performance.now()-loaded,totalMs:performance.now()-start,providers:results.map(r=>({provider:r.provider.name,...r.metrics})),measurement:'parent wall time; provider CPU/RSS reported separately when available'}};
  }catch(error){if(timedOut)fail('ATLAS_DEEP_TIMEOUT');throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export function projectDeep(graph,{view='calls',focus='',query='',offset=0}={}){
  if(!['calls','control','data','focused','runtime','sequence'].includes(view)||typeof query!=='string'||query.length>200||typeof focus!=='string'||focus.length>150||!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('ATLAS_DEEP_SCOPE_INVALID');
  if(focus&&!graph.nodes.some(n=>n.id===focus))fail('ATLAS_DEEP_NODE_UNAVAILABLE');
  const runtime={status:'UNAVAILABLE',reason:'No qualified runtime session attached. Runtime execution is never launched by this view.',sessions:[]};
  const calls=new Set(['CALLS','MAY_CALL']),control=new Set(['CONTROL_FLOW','BRANCH','HANDLES','THROWS','AWAITS']),data=new Set(['READS','WRITES','PASSES_ARGUMENT','RETURNS_TO','CAPTURES','DEPENDS_ON','REFERENCES']);
  let edges=graph.edges.filter(e=>view==='focused'||(view==='control'?control:view==='data'?data:calls).has(e.kind));
  let selectedIds=null;
  if(focus){selectedIds=new Set([focus]);for(const n of graph.nodes)if(n.scope===focus||n.ownerId===focus||n.functionId===focus)selectedIds.add(n.id);for(const c of graph.callSites)if(c.callerId===focus||c.targetIds.includes(focus)){selectedIds.add(c.id);selectedIds.add(c.callerId);c.targetIds.forEach(id=>selectedIds.add(id));}for(const e of edges)if(e.from===focus||e.to===focus){selectedIds.add(e.from);selectedIds.add(e.to);}}
  const relevant=new Set(edges.flatMap(e=>[e.from,e.to]));
  let nodes=graph.nodes.filter(n=>!selectedIds||selectedIds.has(n.id));
  if(view==='calls')nodes=nodes.filter(n=>['module','function','async-function','method','class','constructor','closure','lambda','callsite','call-site'].includes(n.kind)||relevant.has(n.id));
  else if(view!=='focused')nodes=nodes.filter(n=>relevant.has(n.id));
  const needle=query.toLocaleLowerCase('en');if(needle)nodes=nodes.filter(n=>(n.label+' '+n.path).toLocaleLowerCase('en').includes(needle));
  if(view==='runtime'||view==='sequence')nodes=[];
  const matchedNodes=nodes.length;nodes=nodes.slice(offset,offset+DEEP_LIMITS.viewNodes);const shown=new Set(nodes.map(n=>n.id));
  const matching=edges.filter(e=>shown.has(e.from)&&shown.has(e.to));edges=matching.slice(0,DEEP_LIMITS.viewEdges);
  const sites=graph.callSites.filter(c=>shown.has(c.id)||shown.has(c.callerId)||c.targetIds.some(x=>shown.has(x)));
  return {schema:graph.schema,status:'READY',identity:graph.identity,graphDigest:graph.graphDigest,nodes,edges,callSites:sites.slice(0,200),coverage:graph.coverage,capabilities:graph.capabilities,limitations:graph.limitations,providers:graph.providers,metrics:graph.metrics,runtime,projection:{view,focus,query,offset,matchedNodes,returnedNodes:nodes.length,hasMore:offset+nodes.length<matchedNodes,edgesOmitted:matching.length-edges.length,callSitesOmitted:sites.length-Math.min(sites.length,200),boundaryRelations:graph.edges.filter(e=>shown.has(e.from)!==shown.has(e.to)).length}};
}
