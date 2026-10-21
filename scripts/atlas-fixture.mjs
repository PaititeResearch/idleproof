// Synthetic fixture for MACHINE tests and explicit demo only; never production evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
export function atlasFixtureModel({count=3,tag='a',classes=true}={}) {
  const snapshotId='dwscan_'+tag.repeat(64),files=[];
  for(let i=0;i<count;i++){
    const name=i===0?'src/checkout.py':i===1?'src/pricing.py':i===2?'src/access.py':`src/module-${String(i).padStart(5,'0')}.py`;
    const symbols=classes?[{kind:'class',qualified_name:`module${i}.Component`,line:2,end_line:8,epistemic_status:'OBSERVED'},
      {kind:'function',qualified_name:`module${i}.Component.apply`,line:3,end_line:5,epistemic_status:'OBSERVED'}]:[];
    files.push({path:name,sourceSha256:hash(name),role:'production',status:'parsed',extraction:{parsed:true,provider:'synthetic-fixture',symbols,imports:[],calls:[],description:{behaviors:[],intent:[],dependencies:[]}},relations:[]});
  }
  const edges=files.slice(0,-1).map((f,i)=>({id:'dwedge_'+hash(f.path).slice(0,24),from:f.path,to:files[i+1].path,predicate:'imports',reference:files[i+1].path,resolution:'unique-static-candidate',authority:'INFERRED',line:1}));
  for(const f of files)f.relations=edges.filter(e=>e.from===f.path);
  return {schema:'idleproof.project-scan.v1',header:{snapshotId,source:'HEAD',tree:'b'.repeat(40),capturedAt:'2026-10-21T00:00:00Z',profile:{syntheticFixture:true},coverage:{complete:true,inventoryEntries:count,eligible:count,read:count,capturedSources:count,statuses:{parsed:count},reasons:{}}},files,edges,duplicates:[],unknowns:[]};
}
export function writeAtlasFixture(cwd,model) {
  const dir=path.join(cwd,'.idleproof','project-scans');fs.mkdirSync(dir,{recursive:true});const data=JSON.stringify(model);
  fs.writeFileSync(path.join(dir,model.header.snapshotId+'.json'),data);
  fs.writeFileSync(path.join(dir,model.header.source+'.json'),JSON.stringify({snapshotId:model.header.snapshotId,root:fs.realpathSync(cwd),sha256:hash(data)}));
}
export function tempAtlasFixture(options={}) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-atlas-')),model=atlasFixtureModel(options);
  writeAtlasFixture(cwd,model);return {cwd,model,close:()=>fs.rmSync(cwd,{recursive:true,force:true})};
}
