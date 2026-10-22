import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeCapturedProject,capturedDeepInput,projectDeep} from '../src/atlas-deep.mjs';
import {buildAtlas,emptyOverlay} from '../src/atlas-graph.mjs';
import {saveAtlasOverlay,readAtlasOverlay} from '../src/atlas-store.mjs';
import {scanProject} from '../src/project-scan.mjs';
import {createReferenceFixture,createExternalReferenceFixture,REFERENCE_UNCERTAIN,scoreReference} from '../scripts/atlas-deep-benchmark.mjs';

test('deep reference corpus: every certain target matches independent source-span annotations; V1 and source stay unchanged',async t=>{
  const fixture=createReferenceFixture();t.after(fixture.close);
  const original=JSON.stringify(fixture.model),v1=buildAtlas(fixture.model),before=JSON.stringify(v1);
  const overlay=emptyOverlay();overlay.notes=[{id:v1.nodes.find(n=>n.path==='service.py').id,text:'Preserved V1 qualification note'}];
  const saved=saveAtlasOverlay(fixture.cwd,v1,{snapshotId:v1.identity.snapshotId,graphDigest:v1.graphDigest,expectedRevision:null,overlay});
  const graph=await analyzeCapturedProject(fixture.cwd,fixture.model);
  const result=scoreReference(graph);
  assert.equal(result.falsePositive,0,JSON.stringify(result));
  assert.equal(result.falseNegative,0,JSON.stringify(result));
  assert.equal(result.truePositive,fixture.expected.length);
  for(const expected of REFERENCE_UNCERTAIN){
    const sites=graph.callSites.filter(c=>c.source.path===expected.path&&c.source.line===expected.line);
    assert.ok(sites.length,`Missing uncertainty from denominator: ${expected.path}:${expected.line}`);
    assert.ok(sites.every(c=>c.status!=='RESOLVED'),`False certainty: ${expected.path}:${expected.line}`);
  }
  assert.equal(JSON.stringify(buildAtlas(fixture.model)),before);
  assert.equal(JSON.stringify(fixture.model),original);
  assert.deepEqual(readAtlasOverlay(fixture.cwd,v1).overlay,overlay);
  assert.equal(readAtlasOverlay(fixture.cwd,v1).revision,saved.revision);
  assert.equal(fs.existsSync(path.join(fixture.cwd,'PROJECT_MUST_NOT_EXECUTE')),false);
  assert.equal(JSON.stringify(graph).includes('QUALIFICATION_SECRET_MUST_NOT_APPEAR'),false);
  assert.equal(graph.proof,'UNKNOWN');assert.equal(graph.coverage.semanticCompleteness,'UNKNOWN');
  for(const item of [...graph.nodes,...graph.edges,...graph.callSites]){
    assert.equal(item.source.snapshotId,fixture.model.header.snapshotId);
    assert.equal(item.source.sourceSha256,createHash('sha256').update(fixture.files[item.source.path]).digest('hex'));
    assert.ok(item.source.line>=1&&item.source.endLine>=item.source.line);
  }
  const view=projectDeep(graph,{view:'calls'});assert.ok(view.nodes.length);assert.ok(view.projection.returnedNodes<=150);
});

test('deep captured HEAD ignores modified worktree bytes and rejects forged captured hashes',async t=>{
  const fixture=createReferenceFixture();t.after(fixture.close);
  fs.writeFileSync(path.join(fixture.cwd,'rules.py'),'raise RuntimeError("must never be loaded as captured source")\n');
  const input=await capturedDeepInput(fixture.cwd,fixture.model);
  assert.equal(input.files.find(f=>f.path==='rules.py').content,fixture.files['rules.py']);
  const forged=structuredClone(fixture.model);forged.files.find(f=>f.path==='rules.py').sourceSha256='0'.repeat(64);
  await assert.rejects(capturedDeepInput(fixture.cwd,forged),/SOURCE_MISMATCH/);
});

test('deep bounds and unsupported selection are explicit and never erase reference denominators',async t=>{
  const fixture=createReferenceFixture({generatedFiles:250});t.after(fixture.close);
  const input=await capturedDeepInput(fixture.cwd,fixture.model);
  assert.equal(input.files.length,256);assert.equal(input.coverage.omittedByLimit,Object.keys(fixture.files).length-256);assert.equal(input.coverage.complete,false);
  const working=structuredClone(fixture.model);working.header.source='WORKTREE';working.header.tree=null;
  await assert.rejects(capturedDeepInput(fixture.cwd,working),/WORKTREE_UNSUPPORTED/);
});

test('external CPython 3.12.0 colorsys: whole-module syntax inventory and separately annotated local targets',async t=>{
  const fixture=createExternalReferenceFixture();t.after(fixture.close);
  const graph=await analyzeCapturedProject(fixture.cwd,fixture.model),score=scoreReference(graph,fixture.expected);
  assert.equal(graph.callSites.length,8,'All five builtin calls and all three local calls must remain counted');
  assert.equal(score.falsePositive,0,JSON.stringify(score));
  assert.equal(score.truePositive,3,'The three independently annotated _v sites must resolve');
  for(const external of fixture.provenance.oracle.externalCalls){
    const calls=graph.callSites.filter(c=>c.source.line===external.line);
    assert.equal(calls.length,1);assert.notEqual(calls[0].status,'RESOLVED');
  }
});

test('real pinned Core: canonical capture feeds Deep, retains all name-call sites and preserves V1 and exclusions',{skip:!process.env.IDLEPROOF_TEST_CORE},async t=>{
  const fixture=createReferenceFixture();t.after(fixture.close);
  const model=await scanProject(fixture.cwd),before=JSON.stringify(buildAtlas(model));
  const graph=await analyzeCapturedProject(fixture.cwd,model),score=scoreReference(graph);
  assert.equal(score.falsePositive,0,JSON.stringify(score));
  assert.equal(score.falseNegative,0,JSON.stringify(score));
  assert.equal(JSON.stringify(buildAtlas(model)),before);
  for(const file of model.files)for(const call of file.extraction?.calls||[]){
    assert.ok(graph.callSites.some(c=>c.source.path===file.path&&c.source.line===call.line),`Core call disappeared: ${file.path}:${call.line} ${call.name}`);
  }
  assert.equal(graph.identity.snapshotId,model.header.snapshotId);assert.equal(graph.identity.tree,model.header.tree);
  assert.equal(fs.existsSync(path.join(fixture.cwd,'PROJECT_MUST_NOT_EXECUTE')),false);
  assert.equal(JSON.stringify(graph).includes('QUALIFICATION_SECRET_MUST_NOT_APPEAR'),false);
});

test('large real-source shape: callsite budget returns a fixed diagnostic and no partial graph',async t=>{
  const fixture=createReferenceFixture({referenceFiles:{'many.mjs':'export {};\n'+'outside();\n'.repeat(19001)},referenceTargets:[]});t.after(fixture.close);
  await assert.rejects(analyzeCapturedProject(fixture.cwd,fixture.model),error=>error.message==='ATLAS_DEEP_JS_CALL_LIMIT');
});
