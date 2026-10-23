// Optional runtime layer, deliberately independent from Core Proof and Atlas V1.
// The only executable target in v1 is an immutable, built-in synthetic fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

export const RUNTIME_SCHEMA='idleproof.atlas-runtime.v1';
export const RUNTIME_LIMITS=Object.freeze({wallMs:5000,cpuSeconds:3,memoryBytes:268435456,processes:16,fileBytes:1048576,outputBytes:1048576,events:1000});
const hash=x=>createHash('sha256').update(x).digest('hex');
const tracer=fileURLToPath(new URL('./atlas-deep-tracer.py',import.meta.url));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safePath=x=>typeof x==='string'&&x.length>0&&x.length<=4096&&!/[\\:\x00-\x1f\x7f]/.test(x)&&x.split('/').every(p=>p&&p!=='.'&&p!=='..');
const fail=code=>{throw new Error(code);};
const only=(value,keys)=>object(value)&&Object.keys(value).every(k=>keys.includes(k));
const baseFiles=Object.freeze({
  'rules.py':'def adjusted(value):\n    if value < 0:\n        raise ValueError("synthetic rejection")\n    return value * 0.9 if value >= 100 else value\n',
  'service.py':'from rules import adjusted\ndef process(value):\n    return adjusted(value + 10)\n',
  'runtime_demo.py':'from service import process\nprocess(100)\ntry:\n    process(-20)\nexcept ValueError:\n    pass\n'
});
export function runtimeFixture() {
  const files=Object.entries(baseFiles).map(([path,content])=>({path,content,sourceSha256:hash(content)}));
  return {identity:{snapshotId:'dwscan_'+hash(JSON.stringify(files.map(f=>[f.path,f.sourceSha256]))),tree:null,source:'SYNTHETIC',repositoryId:'atlas-built-in-runtime-fixture-v1'},files,
    scenario:'Fixed synthetic scenario: normal adjusted price, then handled negative-value exception.'};
}
function unavailable(reason){return {status:'UNAVAILABLE',reason,executed:false,kind:'NO_OBSERVATION',limits:RUNTIME_LIMITS,limitations:['No target was executed. Runtime observation requires verified isolation; a subprocess alone is insufficient.']};}
function sandboxArgs(dir,mode) {
  return [`--as=${RUNTIME_LIMITS.memoryBytes}`,`--cpu=${RUNTIME_LIMITS.cpuSeconds}`,`--nproc=${RUNTIME_LIMITS.processes}`,`--fsize=${RUNTIME_LIMITS.fileBytes}`,'--nofile=64','--core=0','--',
    '/usr/bin/bwrap','--unshare-all','--die-with-parent','--new-session','--clearenv','--cap-drop','ALL',
    '--ro-bind','/usr','/usr','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64',
    '--proc','/proc','--dev','/dev','--tmpfs','/tmp',
    '--ro-bind',path.join(dir,'source'),'/fixture','--ro-bind',tracer,'/tracer.py',
    '--ro-bind',path.join(dir,'manifest.json'),'/fixture-manifest.json',
    '--chdir','/tmp','/usr/bin/python3','-I','-S','/tracer.py',mode];
}
function boundedSpawn(args,{signal}={}) {
  return new Promise(resolve=>{
    if(signal?.aborted){resolve({status:'CANCELLED'});return;}
    let child,settled=false,reason=null,bytes=0;const parts=[];
    try{child=spawn('/usr/bin/prlimit',args,{env:{},stdio:['ignore','pipe','pipe'],detached:true,windowsHide:true});}
    catch{resolve({status:'SPAWN_FAILED'});return;}
    const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
    const cancel=()=>{reason='CANCELLED';kill();};
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>{reason='TIMEOUT';kill();},RUNTIME_LIMITS.wallMs);
    const finish=(status,extra={})=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);resolve({status,...extra});};
    child.stdout.on('data',part=>{bytes+=part.length;if(bytes>RUNTIME_LIMITS.outputBytes){reason='OUTPUT_LIMIT';parts.length=0;kill();}else if(!reason)parts.push(part);});
    child.stderr.resume(); // Never emit diagnostics containing arbitrary process output.
    child.once('error',()=>finish('SPAWN_FAILED'));
    child.once('close',code=>{if(reason)return finish(reason);if(code!==0)return finish('SANDBOX_REJECTED');try{finish('OK',{value:JSON.parse(Buffer.concat(parts).toString('utf8'))});}catch{finish('INVALID_OUTPUT');}});
  });
}
function makeFixture() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-runtime-'));fs.chmodSync(dir,0o700);fs.mkdirSync(path.join(dir,'source'),{mode:0o700});
  const fixture=runtimeFixture();for(const f of fixture.files)fs.writeFileSync(path.join(dir,'source',f.path),f.content,{mode:0o400,flag:'wx'});
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({files:Object.fromEntries(fixture.files.map(f=>[f.path,f.sourceSha256]))}),{mode:0o400,flag:'wx'});
  return {dir,fixture};
}
function hostNamespaces(){return Object.fromEntries(['net','mnt','pid','user'].map(n=>[n,fs.readlinkSync('/proc/self/ns/'+n)]));}
async function probe(dir,signal) {
  if(process.platform!=='linux')return unavailable('LINUX_ISOLATION_UNAVAILABLE');
  for(const p of ['/usr/bin/bwrap','/usr/bin/prlimit','/usr/bin/python3'])try{fs.accessSync(p,fs.constants.X_OK);}catch{return unavailable('ISOLATION_TOOL_UNAVAILABLE');}
  let host;try{host=hostNamespaces();}catch{return unavailable('NAMESPACE_IDENTITY_UNAVAILABLE');}
  const result=await boundedSpawn(sandboxArgs(dir,'--probe'),{signal});
  if(result.status!=='OK')return unavailable('ISOLATION_'+result.status);
  const p=result.value;
  if(p?.schema!=='idleproof.atlas-isolation-probe.v1'||!object(p.namespaces)||!Object.keys(host).every(k=>typeof p.namespaces[k]==='string'&&p.namespaces[k]!==host[k])||p.fixtureReadOnly!==true||p.privateTmp!==true||p.environmentEmpty!==true||p.capsZero!==true||p.cpuLimit!==RUNTIME_LIMITS.cpuSeconds||p.memoryLimit!==RUNTIME_LIMITS.memoryBytes||p.processLimit!==RUNTIME_LIMITS.processes||p.fileLimit!==RUNTIME_LIMITS.fileBytes)return unavailable('ISOLATION_PROBE_INCOMPLETE');
  return {status:'AVAILABLE',executed:false,kind:'NO_OBSERVATION',isolation:{adapter:'linux-bubblewrap-prlimit-v1',verifiedNamespaces:['net','mnt','pid','user'],fixtureReadOnly:true,emptyEnvironment:true,capabilitiesDropped:true},limits:RUNTIME_LIMITS,
    limitations:['Qualified only for the built-in trusted synthetic fixture.','RLIMIT_NPROC is a per-user process limit, not a cgroup PID quota; root environments may bypass it. No arbitrary target execution is supported.','Read-only /usr exposes system binaries and libraries within the sandbox.','No cgroup aggregate memory or CPU accounting; limits apply to the traced process.']};
}
export async function runtimeAvailability({signal}={}) {
  const {dir}=makeFixture();try{return await probe(dir,signal);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
export async function runRuntimeFixture({signal}={}) {
  // This entry point accepts no source paths, source bytes, entrypoint or shell command.
  const {dir,fixture}=makeFixture();
  try{
    const availability=await probe(dir,signal);if(availability.status!=='AVAILABLE')return availability;
    const result=await boundedSpawn(sandboxArgs(dir,'--instrument-fixed-fixture'),{signal});
    if(result.status!=='OK')return {status:'INTERRUPTED',reason:result.status,executed:true,kind:'INCOMPLETE_OBSERVATION',events:[],identity:fixture.identity,limitations:['Instrumentation did not produce an admissible trace. No runtime edges are established.']};
    const raw=result.value;
    const trace={schema:RUNTIME_SCHEMA,kind:'OBSERVED_RUNTIME',status:raw.status,sessionId:randomUUID(),identity:fixture.identity,syntheticFixture:true,scenario:fixture.scenario,
      provider:{name:'atlas-python-sys-settrace',version:'1'},authenticity:'LOCAL_PRODUCER_CLAIM_NOT_ATTESTED',proof:'UNKNOWN',
      sources:fixture.files.map(({path,sourceSha256})=>({path,sourceSha256})),events:raw.events,
      coverage:{complete:false,events:raw.events?.length,truncated:raw.truncated,arguments:false,returnValues:false,exceptionMessages:false,targetOutput:false,asyncEvents:false,nativeCalls:false,threads:false,scenarios:1},
      durationNs:raw.durationNs,peakRssKiB:raw.peakRssKiB,isolation:availability.isolation,
      limitations:[...availability.limitations,'One synthetic scenario is not complete behavioral coverage.','Python return events may also denote exception unwind; no return value or success is inferred.','Instrumentation observes Python frames, not native calls, separate threads or async scheduling.']};
    validateRuntimeTrace(trace);return trace;
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function validRef(ref,sources,{site=false}={}) {
  return only(ref,site?['path','sourceSha256','line']:['path','sourceSha256','line','qualifiedName','kind'])&&safePath(ref.path)&&sources.get(ref.path)===ref.sourceSha256&&Number.isSafeInteger(ref.line)&&ref.line>0&&(site||['module','function'].includes(ref.kind)&&typeof ref.qualifiedName==='string'&&ref.qualifiedName.length>0&&ref.qualifiedName.length<=400);
}
export function validateRuntimeTrace(trace) {
  let encoded;try{encoded=JSON.stringify(trace);}catch{fail('ATLAS_RUNTIME_INVALID');}if(!encoded||Buffer.byteLength(encoded)>RUNTIME_LIMITS.outputBytes)fail('ATLAS_RUNTIME_INVALID');
  if(!object(trace)||trace.schema!==RUNTIME_SCHEMA||trace.kind!=='OBSERVED_RUNTIME'||trace.proof!=='UNKNOWN'||!['COMPLETED','FAILED','INTERRUPTED'].includes(trace.status)||typeof trace.sessionId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(trace.sessionId)||!object(trace.identity)||!/^dwscan_[a-f0-9]{64}$/.test(trace.identity.snapshotId)||!Array.isArray(trace.sources)||trace.sources.length>100||!Array.isArray(trace.events)||trace.events.length>RUNTIME_LIMITS.events||trace.provider?.name!=='atlas-python-sys-settrace'||trace.provider.version!=='1')fail('ATLAS_RUNTIME_INVALID');
  const sources=new Map();for(const s of trace.sources){if(!only(s,['path','sourceSha256'])||!safePath(s.path)||!/^[a-f0-9]{64}$/.test(s.sourceSha256)||sources.has(s.path))fail('ATLAS_RUNTIME_SOURCE_INVALID');sources.set(s.path,s.sourceSha256);}
  const calls=new Map();let at=-1;
  for(const [i,e] of trace.events.entries()){
    if(!object(e)||e.sequence!==i||!['CALL','RETURN','EXCEPTION'].includes(e.event)||!Number.isSafeInteger(e.atNs)||e.atNs<at||!validRef(e.function,sources)||e.caller!==null&&!validRef(e.caller,sources)||e.callSite!==null&&!validRef(e.callSite,sources,{site:true})||Boolean(e.caller)!==Boolean(e.callSite))fail('ATLAS_RUNTIME_EVENT_INVALID');
    if(e.caller&&(e.callSite.path!==e.caller.path||e.callSite.sourceSha256!==e.caller.sourceSha256))fail('ATLAS_RUNTIME_EVENT_INVALID');
    if(Object.keys(e).some(k=>!['sequence','event','atNs','function','caller','callSite','invocation','durationNs'].includes(k)))fail('ATLAS_RUNTIME_SENSITIVE_FIELDS');
    if(e.event==='CALL'){if(e.invocation!==i)fail('ATLAS_RUNTIME_EVENT_INVALID');calls.set(i,e.function);}
    else {const original=calls.get(e.invocation);if(!original||JSON.stringify(original)!==JSON.stringify(e.function)||!Number.isSafeInteger(e.durationNs)||e.durationNs<0||e.durationNs>e.atNs)fail('ATLAS_RUNTIME_EVENT_INVALID');if(e.event==='RETURN')calls.delete(e.invocation);}
    at=e.atNs;
  }
  if(trace.status==='COMPLETED'&&calls.size)fail('ATLAS_RUNTIME_INCOMPLETE');
  return trace;
}
export function reconcileRuntime(graph,trace) {
  validateRuntimeTrace(trace);
  for(const k of ['snapshotId','tree','source','repositoryId'])if(graph?.identity?.[k]!==trace.identity[k])fail('ATLAS_RUNTIME_STALE');
  if(!Array.isArray(graph.nodes)||graph.nodes.length>20000||!Array.isArray(graph.edges)||graph.edges.length>40000)fail('ATLAS_RUNTIME_GRAPH_INVALID');
  const sourceHashes=new Map();for(const n of graph.nodes){if(!n.source)continue;if(n.source.snapshotId!==graph.identity.snapshotId)fail('ATLAS_RUNTIME_GRAPH_INVALID');const prior=sourceHashes.get(n.source.path);if(prior&&prior!==n.source.sourceSha256)fail('ATLAS_RUNTIME_GRAPH_INVALID');sourceHashes.set(n.source.path,n.source.sourceSha256);}
  for(const s of trace.sources)if(sourceHashes.get(s.path)!==s.sourceSha256)fail('ATLAS_RUNTIME_SOURCE_MISMATCH');
  const key=(r,kind)=>JSON.stringify([r.path,r.sourceSha256,r.line,kind]);const byRef=new Map();
  for(const n of graph.nodes){if(!n.source||!['module','function','method','constructor','lambda'].includes(n.kind))continue;const k=key(n.source,n.kind==='module'?'module':'function');byRef.set(k,[...(byRef.get(k)||[]),n]);}
  // Exact path/hash/definition line with a unique candidate; names never supply a match.
  const match=r=>{const candidates=r&&byRef.get(key(r,r.kind));return candidates?.length===1?candidates[0].id:null;};
  const observed=[],unresolved=[],observedEdges=new Set();
  for(const e of trace.events.filter(e=>e.event==='CALL')){
    const from=match(e.caller),to=match(e.function);
    if(!from||!to||!e.callSite){unresolved.push({sequence:e.sequence,reason:'EXACT_FUNCTION_IDENTITY_UNRESOLVED'});continue;}
    const matches=graph.edges.filter(edge=>['CALLS','MAY_CALL'].includes(edge.kind)&&edge.from===from&&edge.to===to&&edge.source?.snapshotId===trace.identity.snapshotId&&edge.source?.path===e.callSite.path&&edge.source?.sourceSha256===e.callSite.sourceSha256&&edge.source?.line===e.callSite.line);
    // Same-line nested callsites remain ambiguous; do not pick by function name or order.
    if(matches.length===1){const edge=matches[0];observedEdges.add(edge.id);observed.push({sequence:e.sequence,from,to,edgeId:edge.id,status:edge.kind==='CALLS'?'STATIC_DETERMINED_OBSERVED':'STATIC_POSSIBLE_OBSERVED'});}
    else if(matches.length>1)unresolved.push({sequence:e.sequence,from,to,reason:'CALLSITE_AMBIGUOUS'});
    else observed.push({sequence:e.sequence,from,to,edgeId:null,status:'DYNAMIC_OBSERVED_STATIC_UNRESOLVED'});
  }
  return {schema:'idleproof.atlas-runtime-reconciliation.v1',identity:trace.identity,sessionId:trace.sessionId,proof:'UNKNOWN',observed,unresolved,
    staticRelations:graph.edges.filter(e=>['CALLS','MAY_CALL'].includes(e.kind)).map(e=>({edgeId:e.id,status:observedEdges.has(e.id)?'OBSERVED_IN_SESSION':'NOT_OBSERVED_IN_SESSION'})),
    coverage:{complete:false,observedCalls:trace.events.filter(e=>e.event==='CALL').length,matchedRelations:observedEdges.size,unresolved:unresolved.length},
    limitations:['Not observed does not mean impossible or unreachable.','Matching requires unique exact source identities and callsite lines; same-line calls can remain ambiguous.','Imported trace integrity does not authenticate its producer; this record is not Core Proof.']};
}

// End-to-end opt-in demo; availability failure returns before any target execution.
export async function buildRuntimeDemo({signal}={}) {
  const trace=await runRuntimeFixture({signal});
  if(trace.kind!=='OBSERVED_RUNTIME')return trace;
  const fixture=runtimeFixture();
  const input={...fixture,coverage:{inventory:{syntheticFixture:true},admittedFiles:fixture.files.length,analyzedFiles:fixture.files.length,unsupportedFiles:0,omittedByLimit:0,complete:true,semanticCompleteness:'UNKNOWN'}};
  const [{admitDeepResults},{boundedProcess,analyzerEnv}]=await Promise.all([import('./atlas-deep.mjs'),import('./atlas-deep-process.mjs')]);
  const here=path.dirname(tracer);
  const command=process.env.IDLEPROOF_DEEP_PYTHON||(process.platform==='win32'?'python':'python3');
  const raw=await boundedProcess(command,['-I',path.join(here,'atlas-deep-python.py')],{cwd:here,input:JSON.stringify(input),signal,env:analyzerEnv(),timeoutMs:15000,maxBytes:8*1024*1024});
  const graph=admitDeepResults(input,[JSON.parse(raw.toString('utf8'))]);
  const reconciliation=reconcileRuntime(graph,trace);
  return {status:'READY',kind:'SYNTHETIC_RUNTIME_DEMO',syntheticFixture:true,graph,trace,reconciliation,limitations:['Built-in synthetic fixture only; this is not the user repository or its captured runtime.','A local producer claim is not an authenticated or causal Core Proof.']};
}
