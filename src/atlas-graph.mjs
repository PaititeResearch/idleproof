// Experimental, pure projection of admitted Core scan data. Not a second parser.
// Facts are never inferred from an LLM or from user edits. No I/O or project execution.
import {createHash} from 'node:crypto';
import {redactPortalText} from './portal-snapshot.mjs';
export const ATLAS_SCHEMA='idleproof.repository-atlas.v1';
export const ATLAS_LIMITS=Object.freeze({nodes:6000,edges:16000,viewNodes:200,viewEdges:800});
export const SID=/^dwscan_[a-f0-9]{64}$/;
export const HASH=/^[a-f0-9]{64}$/;
export const ID=/^[a-z][a-z0-9_]{1,79}$/;
const safePath=v=>typeof v==='string'&&v.length<=4096&&v.length>0&&!/[\\:\x00-\x1f\x7f]/.test(v)&&v.split('/').every(s=>s&&s!=='.'&&s!=='..');
export const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`;
export const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const id=(prefix,value)=>prefix+'_'+digest(value).slice(0,32);
const clean=(v,n=300)=>redactPortalText(String(v??''),n);
const order=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const fail=code=>{throw new Error(code);};
const posInt=v=>Number.isSafeInteger(v)&&v>0;
const classKinds=new Set(['class','interface','struct','enum']);
// A file-opening anchor is not a known syntax location. Never fabricate line evidence.
const sourceRef=(model,file,line=null,endLine=line)=>({snapshotId:model.header.snapshotId,path:file.path,sourceSha256:file.sourceSha256,line:posInt(line)?line:1,endLine:posInt(endLine)?endLine:posInt(line)?line:1,locationScope:posInt(line)?'exact-span':'file-anchor',provider:file.extraction?.provider||null});

export function buildAtlas(model) {
  if(model?.schema!=='idleproof.project-scan.v1'||!SID.test(model.header?.snapshotId)||!['HEAD','WORKTREE'].includes(model.header.source)||!Array.isArray(model.files)||model.files.length>20000)fail('ATLAS_SCAN_INVALID');
  const nodes=[],edges=[],seen=new Set(),edgeIds=new Set(),byPath=new Map(),unresolved=[],counts={nodeOverflow:0,edgeOverflow:0,excludedFiles:0,unparsedFiles:0,unresolvedImports:0,ambiguousImports:0,unresolvedCalls:0,invalidFacts:0};
  const addNode=n=>{if(seen.has(n.id))return false;if(nodes.length>=ATLAS_LIMITS.nodes){counts.nodeOverflow++;return false;}seen.add(n.id);nodes.push(n);return true;};
  const addEdge=e=>{if(edgeIds.has(e.id))return;if(!seen.has(e.from)||!seen.has(e.to)){counts.edgeOverflow++;return;}if(edges.length>=ATLAS_LIMITS.edges){counts.edgeOverflow++;return;}edgeIds.add(e.id);edges.push(e);};
  const files=[...model.files].sort((a,b)=>String(a.path)<String(b.path)?-1:String(a.path)>String(b.path)?1:0);
  // File nodes have priority, so a large symbol set cannot erase the repository outline.
  for(const f of files){
    if(!safePath(f.path)||!HASH.test(f.sourceSha256||'')||!f.extraction){counts.excludedFiles++;continue;}
    if(byPath.has(f.path))fail('ATLAS_DUPLICATE_FILE');
    const n={id:id('f',f.path),kind:'module',label:clean(f.path,4096),path:f.path,role:clean(f.role,80),authority:'OBSERVED',origin:'core-scan',source:sourceRef(model,f),parsed:f.extraction.parsed===true};
    if(!n.parsed)counts.unparsedFiles++;
    if(addNode(n))byPath.set(f.path,{file:f,node:n});
  }
  for(const {file:f,node:fileNode} of byPath.values()) {
    const symbols=[];
    for(const s of f.extraction.symbols||[]){
      if(s.epistemic_status!=='OBSERVED'||typeof s.qualified_name!=='string'||!posInt(s.line)||!posInt(s.end_line)||s.end_line<s.line){counts.invalidFacts++;continue;}
      const kind=classKinds.has(s.kind)?s.kind:'symbol';
      const n={id:id('s',[f.path,s.qualified_name,s.kind,s.line,s.end_line]),kind,label:clean(s.qualified_name),symbolKind:clean(s.kind,80),path:f.path,authority:'OBSERVED',origin:'core-scan',source:sourceRef(model,f,s.line,s.end_line),module:fileNode.id,members:[]};
      if(addNode(n)){symbols.push(n);addEdge({id:id('e',['contains',fileNode.id,n.id]),from:fileNode.id,to:n.id,kind:'contains',label:'declares',authority:'OBSERVED',origin:'core-scan',source:n.source});}
    }
    // Stack-based lexical intervals avoid quadratic work on large generated files.
    // Containment is not UML composition, ownership or inheritance.
    const stack=[];
    for(const s of [...symbols].sort((a,b)=>a.source.line-b.source.line||b.source.endLine-a.source.endLine||order(a,b))) {
      while(stack.length&&(s.source.line>stack.at(-1).source.endLine||s.source.endLine>stack.at(-1).source.endLine))stack.pop();
      const owner=stack.at(-1);
      if(owner&&s.source.line>owner.source.line&&owner.members.length<24)owner.members.push({id:s.id,name:s.label,line:s.source.line,meaning:'lexically nested declaration'});
      if(classKinds.has(s.kind))stack.push(s);
    }
    // No call target resolution from names alone. Retain bounded inspectable sites.
    for(const c of f.extraction.calls||[]){
      counts.unresolvedCalls++;
      if(unresolved.length<200&&typeof c.name==='string'&&posInt(c.line))unresolved.push({kind:'call-expression',name:clean(c.name),source:sourceRef(model,f,c.line),authority:'INFERRED',meaning:'Call syntax reported by Core; target and runtime execution not established.'});
    }
  }
  // Only the canonical published file relations supply dependency edges.
  for(const r of model.edges||[]) {
    const from=byPath.get(r.from);if(!from||r.predicate!=='imports'){counts.invalidFacts++;continue;}
    const target=byPath.get(r.to),resolution=r.resolution;
    const source=sourceRef(model,from.file,posInt(r.line)?r.line:null);
    if(target&&resolution==='unique-static-candidate') {
      addEdge({id:id('e',['imports',from.node.id,target.node.id,r.id||r.reference||'']),from:from.node.id,to:target.node.id,kind:'imports',label:'imports (static candidate)',authority:'INFERRED',origin:'core-scan',resolution,reference:clean(r.reference),source,coreRelationId:clean(r.id,80)});
    }else{
      if(resolution==='ambiguous')counts.ambiguousImports++;else counts.unresolvedImports++;
      const n={id:id('u',[r.from,r.reference,resolution]),kind:'unresolved',label:clean(r.reference||'Unresolved import'),authority:'UNKNOWN',origin:'core-scan',source,resolution:resolution==='ambiguous'?'ambiguous':'unresolved'};
      addNode(n);addEdge({id:id('e',['unresolved',from.node.id,n.id]),from:from.node.id,to:n.id,kind:'unresolved-import',label:n.resolution,authority:'UNKNOWN',origin:'core-scan',resolution:n.resolution,source});
    }
  }
  nodes.sort(order);edges.sort(order);
  const identity={snapshotId:model.header.snapshotId,source:model.header.source,capturedAt:model.header.capturedAt||null,tree:model.header.tree||null,profile:model.header.profile||null};
  const facts={schema:ATLAS_SCHEMA,identity,nodes,edges,coverage:{scan:model.header.coverage||{},...counts,unresolvedCallSitesShown:unresolved.length,
    sourceScanComplete:model.header.coverage?.complete===true,projectionComplete:counts.nodeOverflow===0&&counts.edgeOverflow===0&&counts.invalidFacts===0,semanticCompleteness:'UNKNOWN',
    complete:false,meaning:'A bounded static projection, never a complete runtime or architectural model.'},unresolved};
  return {...facts,graphDigest:digest(facts),proof:'UNKNOWN',limits:ATLAS_LIMITS,
    capabilities:{dependencyMap:true,sourceBoundSymbols:true,lexicalClassMembers:true,automaticInheritance:false,resolvedCallGraph:false,executionTraces:false,umlRoundTrip:false,reaAdapter:false},
    limitations:['Imports are static candidates, not runtime calls.','Nested declarations are not UML ownership.','Unparsed, excluded and unresolved items are not proof of absence.','Manual diagrams describe user intent and do not change the captured code.']};
}

export function emptyOverlay(){return {positions:[],aliases:[],notes:[],hidden:[],nodes:[],edges:[]};}
export function mergeAtlas(graph,overlay=emptyOverlay()) {
  const aliases=new Map(overlay.aliases.map(x=>[x.id,x.label])),notes=new Map(overlay.notes.map(x=>[x.id,x.text])),positions=new Map(overlay.positions.map(x=>[x.id,{x:x.x,y:x.y}]));
  const nodes=[...graph.nodes,...overlay.nodes.map(n=>({...n,authority:'DECLARED',origin:'user-model',source:null}))].map(n=>({...n,displayLabel:aliases.get(n.id)||n.label,note:notes.get(n.id)||'',position:positions.get(n.id)||null}));
  const edges=[...graph.edges,...overlay.edges.map(e=>({...e,authority:'DECLARED',origin:'user-model',source:null}))];
  return {nodes,edges};
}
export function projectAtlas(graph,overlay,options={}) {
  const {view='modules',focus='',query='',offset=0,depth=1}=options;
  if(!['modules','classes','all'].includes(view)||typeof query!=='string'||query.length>200||typeof focus!=='string'||(focus&&!ID.test(focus))||!Number.isInteger(offset)||offset<0||offset>100000||![1,2].includes(depth))fail('ATLAS_SCOPE_INVALID');
  const merged=mergeAtlas(graph,overlay),ids=new Set(merged.nodes.map(n=>n.id)),hidden=new Set(overlay.hidden);
  if(focus&&!ids.has(focus))fail('ATLAS_NODE_UNAVAILABLE');
  let neighborhood=null;
  if(focus){neighborhood=new Set([focus]);let frontier=new Set([focus]);for(let i=0;i<depth;i++){const next=new Set();for(const e of merged.edges){if(frontier.has(e.from))next.add(e.to);if(frontier.has(e.to))next.add(e.from);}for(const n of next)neighborhood.add(n);frontier=next;}}
  const needle=query.toLocaleLowerCase('en');
  const filtered=merged.nodes.filter(n=>!hidden.has(n.id)&&(!neighborhood||neighborhood.has(n.id))&&(!needle||(n.displayLabel+' '+(n.path||'')).toLocaleLowerCase('en').includes(needle))&&(view==='all'||(view==='classes'?classKinds.has(n.kind):['module','component','note','unresolved'].includes(n.kind))));
  const nodes=filtered.slice(offset,offset+ATLAS_LIMITS.viewNodes),shown=new Set(nodes.map(n=>n.id)),matching=merged.edges.filter(e=>shown.has(e.from)&&shown.has(e.to));
  return {nodes,edges:matching.slice(0,ATLAS_LIMITS.viewEdges),projection:{view,focus,depth,query,offset,matchedNodes:filtered.length,returnedNodes:nodes.length,hasMore:offset+nodes.length<filtered.length,hiddenByUser:hidden.size,otherNodes:merged.nodes.length-filtered.length,edgesOmitted:matching.length-Math.min(matching.length,ATLAS_LIMITS.viewEdges),boundaryRelations:merged.edges.filter(e=>shown.has(e.from)!==shown.has(e.to)).length}};
}
// Export a conservative UML dependency/class representation. No raw user DSL is evaluated.
export function exportMermaid(graph,overlay,options={}) {
  const v=projectAtlas(graph,overlay,options);
  const text=s=>String(s).replace(/[^\p{L}\p{N}_. /:+()=-]/gu,'_').slice(0,160);
  const lines=['classDiagram','%% Experimental source-bound view. Imports are not calls. User relations are DECLARED.',`%% snapshot ${graph.identity.snapshotId}`,`%% graph ${graph.graphDigest}`,`%% shown ${v.nodes.length} of ${v.projection.matchedNodes}; hidden ${v.projection.hiddenByUser}`];
  for(const n of v.nodes){lines.push(`class ${n.id}["${text(n.displayLabel)}"]`);lines.push(`class ${n.id} {`, `  <<${n.origin==='user-model'?'DECLARED':n.kind==='unresolved'?'UNKNOWN':'OBSERVED'}>>`, `  ${text(n.kind)}`);for(const m of n.members||[])lines.push('  '+text(typeof m==='string'?m:m.name));lines.push('}');}
  for(const e of v.edges){
    if(e.kind==='contains'){lines.push(`${e.from} ..> ${e.to} : declares`);continue;}
    const label=text((e.origin==='user-model'?'DECLARED ':'')+(e.label||e.kind));
    if(e.kind==='generalization')lines.push(`${e.to} <|-- ${e.from} : ${label}`);
    else if(e.kind==='realization')lines.push(`${e.to} <|.. ${e.from} : ${label}`);
    else lines.push(`${e.from} ${e.kind==='association'?'-->':'..>'} ${e.to} : ${label}`);
  }
  return lines.join('\n')+'\n';
}
