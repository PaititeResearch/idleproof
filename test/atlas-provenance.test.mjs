import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtlas} from '../src/atlas-graph.mjs';
import {atlasFixtureModel} from '../scripts/atlas-fixture.mjs';

test('atlas: absent import source line is a file anchor, never an invented exact location',()=>{
  const model=atlasFixtureModel();
  for(const edge of model.edges)delete edge.line;
  const graph=buildAtlas(model);
  for(const edge of graph.edges.filter(e=>e.kind==='imports')){
    assert.equal(edge.source.line,1);
    assert.equal(edge.source.locationScope,'file-anchor');
  }
  for(const node of graph.nodes.filter(n=>n.kind==='module'))assert.equal(node.source.locationScope,'file-anchor');
  for(const node of graph.nodes.filter(n=>n.kind==='class'))assert.equal(node.source.locationScope,'exact-span');
});

test('atlas: explicit import lines are preserved and rejected facts cannot claim complete projection',()=>{
  const model=atlasFixtureModel();model.edges[0].line=7;
  const graph=buildAtlas(model);
  assert.ok(graph.edges.some(e=>e.kind==='imports'&&e.source.line===7&&e.source.locationScope==='exact-span'));
  model.files[0].extraction.symbols.push({kind:'function',qualified_name:'invalid',line:0,end_line:1,epistemic_status:'OBSERVED'});
  const rejected=buildAtlas(model);assert.ok(rejected.coverage.invalidFacts>0);assert.equal(rejected.coverage.projectionComplete,false);
});
