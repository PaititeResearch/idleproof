// Independent, hand-annotated SYNTHETIC corpus. This is not the user's WSL project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {analyzeCapturedProject} from '../src/atlas-deep.mjs';
import {buildAtlas} from '../src/atlas-graph.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const code=lines=>lines.join('\n')+'\n';
export const REFERENCE_FILES=Object.freeze({
  'rules.py':code(['def adjusted(value):','    if value < 0:','        return 0','    return value * 2','','def identity(value):','    return value']),
  'service.py':code(['from rules import adjusted as apply','import rules as r','def process(value):','    first = apply(value)','    return r.identity(first)']),
  'closures.py':code(['def outer(value):','    def inner(x):','        return x + 1','    return inner(value)','','def recursive(value):','    if value <= 0:','        return value','    return recursive(value - 1)']),
  'objects.py':code(['class Service:','    def step(self, value):','        return value','','def injected(service, value):','    return service.step(value)','','def construct():','    return Service()']),
  'dynamic.py':code(['from rules import adjusted','def apply_callback(adjusted, value):','    return adjusted(value)','','def choose(flag, value):','    target = adjusted if flag else print','    return target(value)','','def reflect(obj, key):','    method = getattr(obj, key)','    return method(1)','','def library(value):','    return len(value)','','def decorated(fn):','    return fn','','@decorated','def wrapped():','    return 0','','def invoke():','    return wrapped()']),
  'async_flow.py':code(['async def leaf(value):','    return value','','async def route(value):','    return await leaf(value)']),
  'danger.py':code(['from pathlib import Path','Path("PROJECT_MUST_NOT_EXECUTE").write_text("target code was executed")']),
  'frontend/math.ts':code(['export function doubled(value: number): number {','  return value * 2;','}']),
  'frontend/main.ts':code(['import { doubled as apply } from "./math";','export function render(value: number): number {','  return apply(value);','}','export function injected(apply: (x: number) => number, value: number) {','  return apply(value);','}']),
  'schema.sql':'CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\n',
  'settings.json':'{"service":{"retries":2,"enabled":true}}\n',
  'settings.toml':'[service]\nretries = 2\nenabled = true\n',
  'settings.yaml':'service:\n  retries: 2\n',
});

// Source positions were annotated before examining the provider's output.
// Every certain call edge must match this set; missing targets count against recall.
export const REFERENCE_TARGETS=Object.freeze([
  {path:'service.py',line:4,targetPath:'rules.py',targetLine:1},
  {path:'service.py',line:5,targetPath:'rules.py',targetLine:6},
  {path:'closures.py',line:4,targetPath:'closures.py',targetLine:2},
  {path:'closures.py',line:9,targetPath:'closures.py',targetLine:6},
  {path:'objects.py',line:9,targetPath:'objects.py',targetLine:1},
  {path:'async_flow.py',line:5,targetPath:'async_flow.py',targetLine:1},
  {path:'frontend/main.ts',line:3,targetPath:'frontend/math.ts',targetLine:1},
]);
export const REFERENCE_UNCERTAIN=Object.freeze([
  {path:'objects.py',line:6},
  {path:'dynamic.py',line:3},
  {path:'dynamic.py',line:7},
  {path:'dynamic.py',line:10},
  {path:'dynamic.py',line:11},
  {path:'dynamic.py',line:14},
  {path:'dynamic.py',line:24},
  {path:'frontend/main.ts',line:6},
]);

export function createReferenceFixture({generatedFiles=0,referenceFiles=REFERENCE_FILES,referenceTargets=REFERENCE_TARGETS,classification='synthetic'}={}) {
  if(!Number.isInteger(generatedFiles)||generatedFiles<0||generatedFiles>300)throw new Error('Invalid benchmark size');
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-reference-'));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');git('config','user.name','Atlas qualification');git('config','user.email','atlas-qualification@example.invalid');git('config','core.autocrlf','false');
  const files={...referenceFiles};
  for(let i=0;i<generatedFiles;i++)files[`scale/m${String(i).padStart(4,'0')}.py`]=code(['def leaf(value):','    return value + 1','','def run(value):','    return leaf(value)']);
  for(const [name,content] of Object.entries(files)){const full=path.join(cwd,name);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,content);}
  fs.writeFileSync(path.join(cwd,'.env'),'QUALIFICATION_SECRET_MUST_NOT_APPEAR=not-a-real-key\n');
  git('add','.');git('commit','-qm','independently annotated synthetic Atlas Deep corpus');
  const tree=git('rev-parse','HEAD^{tree}'),snapshotId='dwscan_'+hash(tree);
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId,source:'HEAD',tree,capturedAt:'2026-10-22T00:00:00Z',profile:{syntheticFixture:classification==='synthetic',classification,oracle:'hand-annotated-v1'},coverage:{complete:true,inventoryEntries:Object.keys(files).length+1,eligible:Object.keys(files).length,read:Object.keys(files).length,capturedSources:Object.keys(files).length,statuses:{parsed:Object.keys(files).length,excluded:1},reasons:{'sensitive-name':1}}},files:Object.entries(files).map(([name,content])=>({path:name,sourceSha256:hash(content),role:'production',status:'parsed',extraction:{parsed:true,provider:'synthetic-source-manifest',language:name.endsWith('.py')?'python':'unknown',symbols:[],imports:[],calls:[]},relations:[]})),edges:[],duplicates:[],unknowns:[]};
  model.files.push({path:'.env',status:'excluded',reason:'sensitive-name'});
  const expected=[...referenceTargets];
  for(let i=0;i<generatedFiles;i++)expected.push({path:`scale/m${String(i).padStart(4,'0')}.py`,line:5,targetPath:`scale/m${String(i).padStart(4,'0')}.py`,targetLine:1});
  return {cwd,model,files,expected,git,close:()=>fs.rmSync(cwd,{recursive:true,force:true})};
}

const key=r=>`${r.path}:${r.line}:${r.column??'*'}->${r.targetPath}:${r.targetLine}`;
export function scoreReference(graph,expected=REFERENCE_TARGETS) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])),wanted=new Set(expected.map(key));
  const actual=graph.edges.filter(e=>e.kind==='CALLS').map(e=>({path:e.source.path,line:e.source.line,column:e.source.column,targetPath:nodes.get(e.to)?.source.path,targetLine:nodes.get(e.to)?.source.line}));
  const actualKeys=new Set(actual.map(a=>key(expected.find(e=>e.path===a.path&&e.line===a.line&&e.targetPath===a.targetPath&&e.targetLine===a.targetLine&&(e.column===undefined||e.column===a.column))||a))),truePositive=[...actualKeys].filter(k=>wanted.has(k)),falsePositive=[...actualKeys].filter(k=>!wanted.has(k)),falseNegative=[...wanted].filter(k=>!actualKeys.has(k));
  const calls=graph.callSites,counts={total:calls.length,resolved:0,ambiguous:0,unknown:0,external:0};for(const c of calls)counts[c.status.toLowerCase()]++;
  return {oracle:'hand-annotated-synthetic-v1',annotationIndependence:'Separate source-span oracle authored by qualification agent; not external human annotation.',expectedCertainTargets:wanted.size,actualCertainTargets:actualKeys.size,truePositive:truePositive.length,falsePositive:falsePositive.length,falseNegative:falseNegative.length,precision:actualKeys.size?truePositive.length/actualKeys.size:null,recall:wanted.size?truePositive.length/wanted.size:null,falsePositiveRateWithinAssertedTargets:actualKeys.size?falsePositive.length/actualKeys.size:null,callSites:counts,unresolvedRate:calls.length?(counts.unknown+counts.external+counts.ambiguous)/calls.length:null,falsePositiveRelations:falsePositive,missingRelations:falseNegative,denominator:'All annotated expected targets remain in recall denominator, including unsupported or volume-omitted targets. All emitted CALLS edges count in precision; UNKNOWN/EXTERNAL/AMBIGUOUS are reported separately.'};
}

export function createExternalReferenceFixture(){
  const directory=fileURLToPath(new URL('../test/fixtures/atlas-deep/external/cpython-3.12.0/',import.meta.url));
  const provenance=JSON.parse(fs.readFileSync(path.join(directory,'provenance.json'),'utf8'));
  const content=fs.readFileSync(path.join(directory,'colorsys.py'),'utf8'),license=fs.readFileSync(path.join(directory,'LICENSE'));
  if(hash(content)!==provenance.sourceSha256||hash(license)!==provenance.licenseSha256)throw new Error('External reference identity mismatch');
  const fixture=createReferenceFixture({referenceFiles:{'colorsys.py':content},referenceTargets:provenance.oracle.localTargetSites,classification:'external-open-source'});
  return {...fixture,provenance};
}

export async function runExternalBenchmark({pythonCommand}={}){
  const fixture=createExternalReferenceFixture();
  try{const start=performance.now(),graph=await analyzeCapturedProject(fixture.cwd,fixture.model,{pythonCommand}),score={...scoreReference(graph,fixture.expected),oracle:'hand-annotated-cpython-colorsys-v1',annotationIndependence:'External open-source bytes; source-span oracle authored independently of provider output by qualification agent, not external human annotation.'};
    return {status:score.falsePositive===0&&score.falseNegative===0&&graph.callSites.length===fixture.provenance.oracle.callSites?'PASS':'FAIL',classification:'EXTERNAL_OPEN_SOURCE / MACHINE',provenance:fixture.provenance,score,wholeModuleCallCount:graph.callSites.length,expectedWholeModuleCallCount:fixture.provenance.oracle.callSites,durationMs:performance.now()-start,metrics:graph.metrics,providers:graph.providers,coverage:graph.coverage};
  }finally{fixture.close();}
}

export async function runReferenceBenchmark({sizes=[0,20,100],pythonCommand}={}) {
  const runs=[];
  for(const generatedFiles of sizes){
    const fixture=createReferenceFixture({generatedFiles});
    try{
      const baselineStart=performance.now(),before=JSON.stringify(buildAtlas(fixture.model)),baselineMs=performance.now()-baselineStart;
      const start=performance.now(),cpu=process.cpuUsage(),graph=await analyzeCapturedProject(fixture.cwd,fixture.model,{pythonCommand}),durationMs=performance.now()-start,cpuDelta=process.cpuUsage(cpu);
      const score=scoreReference(graph,fixture.expected);
      const baselineUnchanged=before===JSON.stringify(buildAtlas(fixture.model));
      const targetNotExecuted=!fs.existsSync(path.join(fixture.cwd,'PROJECT_MUST_NOT_EXECUTE'));
      runs.push({generatedFiles,selectedFiles:Object.keys(fixture.files).length,sourceBytes:Object.values(fixture.files).reduce((n,s)=>n+Buffer.byteLength(s),0),snapshotId:fixture.model.header.snapshotId,tree:fixture.model.header.tree,durationMs,baselineProjectionMs:baselineMs,baselineUnchanged,targetNotExecuted,orchestratorCpuMs:{user:cpuDelta.user/1000,system:cpuDelta.system/1000},orchestratorPeakRssKiB:process.resourceUsage().maxRSS,resourceMeasurement:'CPU and peak RSS above describe this Node orchestration process only, not workers or Python; peak RSS is process-lifetime. Provider measurements appear in metrics when available. Baseline projection and deep end-to-end work differ in scope.',metrics:graph.metrics,providers:graph.providers,nodes:graph.nodes.length,edges:graph.edges.length,coverage:graph.coverage,score});
    }finally{fixture.close();}
  }
  const openSourceSemanticCorpus=await runExternalBenchmark({pythonCommand});
  return {schema:'idleproof.atlas-deep-benchmark.v1',classification:'MACHINE / SYNTHETIC plus separately reported EXTERNAL_OPEN_SOURCE',createdAt:new Date().toISOString(),runtime:{node:process.version,platform:process.platform,arch:process.arch},runs,realUserProject:{status:'NOT_RUN',reason:'Historical projet-multicouche source and WSL snapshot are unavailable in this environment.'},externalHumanAnnotatedCorpus:{status:'NOT_RUN'},openSourceSemanticCorpus,interpretation:'Zero false positives here is a bounded corpus result, not a proof of universal correctness. Runtime observations and production-scale latency are not measured by this benchmark.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const value=await runReferenceBenchmark();const output=JSON.stringify(value,null,2)+'\n';const outputIndex=process.argv.indexOf('--output');if(outputIndex>=0){const target=process.argv[outputIndex+1];if(!target)throw new Error('Missing --output path');fs.mkdirSync(path.dirname(path.resolve(target)),{recursive:true});fs.writeFileSync(target,output,{mode:0o600});}else process.stdout.write(output);
    if(value.runs.some(r=>r.score.falsePositive||r.score.falseNegative||!r.baselineUnchanged||!r.targetNotExecuted)||value.openSourceSemanticCorpus.status!=='PASS')process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
