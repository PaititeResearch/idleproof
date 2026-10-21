// Actual pinned Core capture -> Atlas -> immutable source. No target code executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {scanProject} from '../src/project-scan.mjs';
import {buildAtlas,emptyOverlay} from '../src/atlas-graph.mjs';
import {atlasApi} from '../src/atlas-api.mjs';
import {saveAtlasOverlay} from '../src/atlas-store.mjs';

test('real Core: module/class provenance, immutable source, no target execution, and stale edit refusal',{skip:!process.env.IDLEPROOF_TEST_CORE},async t=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-real-core-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();git('init','-q');git('config','user.name','Atlas test');git('config','user.email','atlas@example.invalid');git('config','core.autocrlf','false');
  fs.writeFileSync(path.join(cwd,'rules.py'),'class Pricing:\n    def adjusted(self, value):\n        return value * 0.9 if value >= 100 else value\n');
  fs.writeFileSync(path.join(cwd,'service.py'),'from rules import Pricing\ndef calculate(value):\n    return Pricing().adjusted(value)\n');
  fs.writeFileSync(path.join(cwd,'danger.py'),'from pathlib import Path\nPath("PROJECT_MUST_NOT_EXECUTE").write_text("bad")\n');
  fs.writeFileSync(path.join(cwd,'.env'),'ATLAS_SECRET_MUST_NOT_LEAK');git('add','.');git('commit','-qm','synthetic captured source');
  const m=await scanProject(cwd),g=buildAtlas(m);
  assert.ok(g.nodes.some(n=>n.path==='rules.py'&&n.kind==='class'));
  assert.ok(g.edges.some(e=>e.kind==='imports'&&g.nodes.find(n=>n.id===e.from)?.path==='service.py'&&g.nodes.find(n=>n.id===e.to)?.path==='rules.py'));
  assert.equal(JSON.stringify(g).includes('ATLAS_SECRET_MUST_NOT_LEAK'),false);assert.equal(fs.existsSync(path.join(cwd,'PROJECT_MUST_NOT_EXECUTE')),false);
  const n=g.nodes.find(n=>n.kind==='class'&&n.path==='rules.py');fs.writeFileSync(path.join(cwd,'rules.py'),'# changed working file\n');
  const source=await atlasApi(cwd,{method:'GET'},new URL(`http://127.0.0.1/api/atlas?action=source&source=HEAD&snapshot=${g.identity.snapshotId}&node=${n.id}`));
  assert.equal(source.sourceSha256,n.source.sourceSha256);assert.match(source.lines.map(l=>l.text).join('\n'),/value \* 0\.9/);
  const overlay=emptyOverlay();overlay.notes=[{id:n.id,text:'Learning note; not verified code.'}];const saved=saveAtlasOverlay(cwd,g,{snapshotId:g.identity.snapshotId,graphDigest:g.graphDigest,expectedRevision:null,overlay});assert.equal(saved.sequence,1);
  git('add','rules.py');git('commit','-qm','new source capture');await scanProject(cwd);
  await assert.rejects(atlasApi(cwd,{method:'POST'},new URL('http://127.0.0.1/api/atlas'),{action:'save',source:'HEAD',snapshotId:g.identity.snapshotId,graphDigest:g.graphDigest,expectedRevision:saved.revision,overlay}),/ATLAS_STALE/);
});
