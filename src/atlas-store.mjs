// Private, optimistic, versioned user overlay. Never writes source, scan, Proof or policy.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquireOwnedLock} from './portal-memory-lock.mjs';
import {HASH,SID,ID,digest,canonical,emptyOverlay} from './atlas-graph.mjs';
const MAX_BYTES=90000,MAX_REVISIONS=500;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,expected)=>object(v)&&Object.keys(v).sort().join(',')===[...expected].sort().join(',');
const fail=code=>{throw new Error(code);};
const str=(v,max=500)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const uid=v=>typeof v==='string'&&/^user_[a-f0-9]{16,64}$/.test(v);
function safeDir(cwd,{create=false}={}) {
  const root=fs.realpathSync(cwd),local=path.join(root,'.idleproof'),dir=path.join(local,'atlas');
  for(const target of [local,dir]) {
    if(!fs.existsSync(target)){if(!create)return dir;fs.mkdirSync(target,{mode:0o700});}
    const s=fs.lstatSync(target);if(!s.isDirectory()||s.isSymbolicLink()||!fs.realpathSync(target).startsWith(root+path.sep))fail('ATLAS_STORAGE_UNSAFE');
    if(target===dir&&process.platform!=='win32'&&(s.mode&0o077))fail('ATLAS_STORAGE_UNSAFE');
  }
  return dir;
}
function read(file,{optional=false}={}) {
  try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>MAX_BYTES+2000||(process.platform!=='win32'&&(s.mode&0o077)))fail('ATLAS_STORAGE_UNSAFE');return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
}
function atomic(file,value) {
  // Exclusive temporary file; same-directory rename publishes the new pointer atomically.
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())fail('ATLAS_STORAGE_UNSAFE');
  const temp=file+'.'+randomUUID()+'.tmp';
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}
}
export function validateOverlay(value,graph) {
  if(!keys(value,['positions','aliases','notes','hidden','nodes','edges'])||Buffer.byteLength(canonical(value))>MAX_BYTES)fail('ATLAS_OVERLAY_INVALID');
  const bounds={positions:2000,aliases:1000,notes:1000,hidden:2000,nodes:200,edges:500};
  for(const [k,max] of Object.entries(bounds))if(!Array.isArray(value[k])||value[k].length>max)fail('ATLAS_OVERLAY_INVALID');
  const ids=new Set(graph.nodes.map(n=>n.id));
  for(const n of value.nodes){
    if(!keys(n,['id','kind','label','members'])||!uid(n.id)||ids.has(n.id)||!['component','module','class','interface','note'].includes(n.kind)||!str(n.label,160)||!n.label.trim()||!Array.isArray(n.members)||n.members.length>24||n.members.some(m=>!str(m,160)))fail('ATLAS_OVERLAY_INVALID');
    ids.add(n.id);
  }
  const seenEdges=new Set();
  for(const e of value.edges){
    if(!keys(e,['id','from','to','kind','label'])||!uid(e.id)||seenEdges.has(e.id)||!ids.has(e.from)||!ids.has(e.to)||!['dependency','association','generalization','realization'].includes(e.kind)||!str(e.label,160))fail('ATLAS_OVERLAY_INVALID');
    // A self dependency is legitimate; self inheritance is not.
    if(['generalization','realization'].includes(e.kind)&&e.from===e.to)fail('ATLAS_OVERLAY_INVALID');
    seenEdges.add(e.id);
  }
  for(const name of ['positions','aliases','notes']) {
    const seen=new Set();for(const item of value[name]){
      if(!ids.has(item?.id)||seen.has(item.id))fail('ATLAS_OVERLAY_INVALID');seen.add(item.id);
      if(name==='positions'){if(!keys(item,['id','x','y'])||![item.x,item.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000000))fail('ATLAS_OVERLAY_INVALID');}
      if(name==='aliases'&&(!keys(item,['id','label'])||!str(item.label,160)||!item.label.trim()))fail('ATLAS_OVERLAY_INVALID');
      if(name==='notes'&&(!keys(item,['id','text'])||!str(item.text,2000)))fail('ATLAS_OVERLAY_INVALID');
    }
  }
  if(new Set(value.hidden).size!==value.hidden.length||value.hidden.some(id=>!ids.has(id)))fail('ATLAS_OVERLAY_INVALID');
  // Copy only admitted fields. Persisted overlays cannot inject graph truth/status.
  return structuredClone(value);
}
const ref=graph=>({snapshotId:graph.identity.snapshotId,graphDigest:graph.graphDigest,source:graph.identity.source});
function pointerName(dir,graph){if(!SID.test(graph.identity.snapshotId)||!HASH.test(graph.graphDigest))fail('ATLAS_SCAN_INVALID');return path.join(dir,graph.graphDigest+'.head.json');}
function checkedRevision(dir,revision,graph) {
  if(!HASH.test(revision))fail('ATLAS_HISTORY_INVALID');
  const record=read(path.join(dir,revision+'.json'));
  if(!keys(record,['schema','revision','previous','sequence','createdAt','subject','overlay'])||record.schema!=='idleproof.atlas-revision.v1'||record.revision!==revision||!Number.isInteger(record.sequence)||record.sequence<1||record.sequence>MAX_REVISIONS||!Number.isFinite(Date.parse(record.createdAt))||!(record.previous===null||HASH.test(record.previous))||canonical(record.subject)!==canonical(ref(graph)))fail('ATLAS_HISTORY_INVALID');
  const {revision:_ignored,...body}=record;
  if(digest(body)!==revision)fail('ATLAS_HISTORY_INVALID');
  validateOverlay(record.overlay,graph);return record;
}
export function readAtlasOverlay(cwd,graph) {
  const dir=safeDir(cwd),p=read(pointerName(dir,graph),{optional:true});
  if(!p)return {revision:null,sequence:0,overlay:emptyOverlay(),subject:ref(graph)};
  if(!keys(p,['schema','revision'])||p.schema!=='idleproof.atlas-head.v1'||!HASH.test(p.revision))fail('ATLAS_HISTORY_INVALID');
  return checkedRevision(dir,p.revision,graph);
}
export function saveAtlasOverlay(cwd,graph,body) {
  if(!keys(body,['snapshotId','graphDigest','expectedRevision','overlay'])||body.snapshotId!==graph.identity.snapshotId||body.graphDigest!==graph.graphDigest)fail('ATLAS_STALE');
  if(!(body.expectedRevision===null||HASH.test(body.expectedRevision)))fail('ATLAS_OVERLAY_INVALID');
  const overlay=validateOverlay(body.overlay,graph),dir=safeDir(cwd,{create:true}),lock=path.join(dir,graph.graphDigest+'.lock');
  if(fs.existsSync(lock)&&fs.lstatSync(lock).isSymbolicLink())fail('ATLAS_STORAGE_UNSAFE');
  const release=acquireOwnedLock(lock,'ATLAS_BUSY','Repository atlas',{createParent:false});
  try{
    const current=readAtlasOverlay(cwd,graph);
    if(current.revision!==body.expectedRevision)fail('ATLAS_CONFLICT');
    if(canonical(current.overlay)===canonical(overlay))return current;
    if(current.sequence>=MAX_REVISIONS)fail('ATLAS_HISTORY_LIMIT');
    const value={schema:'idleproof.atlas-revision.v1',previous:current.revision,sequence:current.sequence+1,createdAt:new Date().toISOString(),subject:ref(graph),overlay};
    const record={...value,revision:digest(value)};
    // Revisions are immutable; only the pointer is replaced. An interrupted pointer
    // publish leaves an orphan revision, never an acknowledged partial edit.
    const file=path.join(dir,record.revision+'.json');
    fs.writeFileSync(file,JSON.stringify(record),{flag:'wx',mode:0o600});
    atomic(pointerName(dir,graph),{schema:'idleproof.atlas-head.v1',revision:record.revision});
    return record;
  }finally{release();}
}
export function atlasHistory(cwd,graph) {
  const current=readAtlasOverlay(cwd,graph),dir=safeDir(cwd),rows=[];let revision=current.revision,lastSequence=current.sequence+1;
  while(revision&&rows.length<20){const r=checkedRevision(dir,revision,graph);if(r.sequence!==lastSequence-1)fail('ATLAS_HISTORY_INVALID');rows.push({revision:r.revision,previous:r.previous,sequence:r.sequence,createdAt:r.createdAt});lastSequence=r.sequence;revision=r.previous;}
  return {revisions:rows,hasEarlier:Boolean(revision),integrity:'sha256-content-chain; not a signed identity or Proof'};
}
export function atlasRevision(cwd,graph,revision){return checkedRevision(safeDir(cwd),revision,graph);}
