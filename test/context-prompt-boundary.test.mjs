import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {extractTaskSignals} from '../src/context.mjs';
import {buildPlainExplanation} from '../src/explain.mjs';
import {buildHookDelivery} from '../src/delivery.mjs';
import {canonicalCore} from './support/canonical-core.mjs';

const prompt='Read docs/OWNER_INTENT.md, rules.py, access_policy.py and service.py. Explain how the numeric rules and access checks connect. Cite the files you actually read and distinguish declared intentions from observed code. Do not modify files, install dependencies, execute project code or run tests.';

test('human prompt cannot turn observed into a table or documentation into persistent code',()=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-prompt-boundary-'));
  try {
    fs.mkdirSync(path.join(cwd,'docs'));
    const files={
      'rules.py':'def adjusted(value):\n    return value * 0.9 if value >= 100 else value\n',
      'access_policy.py':'def permitted(role, active):\n    return active and role == "operator"\n',
      'service.py':'from rules import adjusted\nfrom access_policy import permitted\ndef process(value, role, active):\n    if not permitted(role, active):\n        raise PermissionError("inactive")\n    return adjusted(value)\n',
      'docs/OWNER_INTENT.md':'# Owner declarations\nKeep the numeric rules independent.\nA report exporter is planned.\n'
    };
    for(const [file,content] of Object.entries(files)) fs.writeFileSync(path.join(cwd,file),content);
    const structureOptions=canonicalCore({'rules.py':{symbols:['adjusted']},'access_policy.py':{symbols:['permitted']},'service.py':{symbols:['process'],imports:['rules','access_policy']}});
    for(const question of [prompt,'Explain "SELECT * FROM imagined" and a future "/api/planned" endpoint with Stripe and PostgreSQL.']) {
      const session={prompt:question,status:'complete',concepts:{},touchedFiles:Object.keys(files)};
      session.taskSignals=extractTaskSignals(cwd,session,{structureOptions});
      for(const signals of session.taskSignals.relatedFiles) {
        assert.equal(signals.table,null,signals.file);
        assert.equal(signals.route,null,signals.file);
        assert.deepEqual(signals.technologies,[],signals.file);
        assert.notEqual(signals.fileRole.role,'data');
      }
      assert.equal(session.taskSignals.fileRole.role,'docs');
      const explanation=buildPlainExplanation({session,phase:'handoff'});
      assert.doesNotMatch(explanation.project+' '+explanation.watch.join(' '),/data surface|stored data|persistent models|data is persistent/);
      const delivery=buildHookDelivery(cwd,{},session,'Stop',{structureOptions});
      assert.doesNotMatch(delivery.message,/data surface|stored data|is the file can/);
      assert.match(delivery.message,/documentation rather than executable/);
    }
    const missing=extractTaskSignals(cwd,{prompt:'Inspect Stripe and PostgreSQL',touchedFiles:['missing.py']});
    assert.deepEqual(missing.technologies,[]);
  } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});

test('documentation examples stay declarations while real source table and route references remain visible',()=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-source-boundary-'));
  try {
    fs.mkdirSync(path.join(cwd,'docs'));
    fs.writeFileSync(path.join(cwd,'docs','PLAN.md'),'Planned: SELECT id FROM future_orders; Stripe endpoint "/api/future".\n');
    fs.writeFileSync(path.join(cwd,'storage.py'),'def load():\n    return db.query("SELECT id FROM orders")\n');
    fs.writeFileSync(path.join(cwd,'handler.ts'),'import Stripe from "stripe";\nexport const route = "/api/payments";\n');
    const structureOptions=canonicalCore({'storage.py':{symbols:['load']},'handler.ts':{symbols:['route'],imports:['stripe']}});
    const signals=extractTaskSignals(cwd,{prompt:'Compare sources',touchedFiles:['docs/PLAN.md','storage.py','handler.ts']},{structureOptions});
    const doc=signals.relatedFiles.find(x=>x.file==='docs/PLAN.md');
    assert.equal(doc.table,null); assert.equal(doc.route,null); assert.deepEqual(doc.technologies,[]);
    assert.equal(doc.fileRole.role,'docs');
    assert.equal(signals.relatedFiles.find(x=>x.file==='storage.py').table,'orders');
    assert.equal(signals.route,'/api/payments');
    assert.ok(signals.technologies.includes('Stripe'));
  } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});
