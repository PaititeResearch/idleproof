import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Exercise the actual updater with real offline npm pack/install and a disposable
// CLI fixture. No real recipe, provider, key or running user server is touched.
test('recipe updater preserves local state, installs same-version changes and rolls back a failed start', {skip:process.platform==='win32',timeout:120000}, t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-update-fixture-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const script=fs.readFileSync(new URL('../scripts/update-human-recipe.sh',import.meta.url),'utf8');
  for(const fail of [false,true]) {
    const recipe=path.join(root,fail?'rollback':'success'),project=path.join(recipe,'projects/projet-multicouche'),runtime=path.join(recipe,'runtime'),source=path.join(recipe,'source');
    const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
    const local=path.join(project,'.idleproof');
    const core=path.join(recipe,'venv-core/bin/dw'),wrongCore=path.join(recipe,'other-venv/bin/dw');
    write(core,'#!/bin/sh\n[ "$1 $2 $3" = "state structure --help" ] || exit 98\n');fs.chmodSync(core,0o700);
    write(wrongCore,'#!/bin/sh\nexit 97\n');fs.chmodSync(wrongCore,0o700);
    write(path.join(local,'byok/config.json'),'synthetic configuration to preserve');
    write(path.join(local,'byok/meter.json'),'synthetic meter to preserve');
    write(path.join(local,'project-scans/HEAD.json'),'synthetic scan to preserve');
    write(path.join(runtime,'package.json'),JSON.stringify({name:'recipe-fixture',version:'0.0.0',private:true}));
    const makePackage=(dir,version)=>{
      write(path.join(dir,'package.json'),JSON.stringify({name:'idleproof',version:'0.0.0',type:'module',files:['bin','src','public'],scripts:{prepare:'node -e "process.exit(99)"'}}));
      write(path.join(dir,'src/byok.mjs'),`export const fixtureVersion=${JSON.stringify(version)};\n`);
      write(path.join(dir,'public/project-scan.js'),'// fixture\n');
      write(path.join(dir,'bin/idleproof.mjs'),`import fs from 'node:fs';\nimport {spawnSync} from 'node:child_process';\nconst action=process.argv[2];\nfs.appendFileSync('.idleproof/actions.log',${JSON.stringify(version)}+':'+action+'\\n');\nif(action==='start'){\n  if(process.env.DIFFWITNESS_BIN!==${JSON.stringify(core)})process.exit(96);\n  const result=spawnSync(process.env.DIFFWITNESS_BIN,['state','structure','--help']);\n  if(result.status!==0)process.exit(95);\n}\nif(action==='start'&&${JSON.stringify(version==='new'&&fail)})process.exit(42);\nconsole.log('fixture '+action);\n`);
    };
    makePackage(path.join(runtime,'node_modules/idleproof'),'old');makePackage(source,'new');
    write(path.join(source,'scripts/update-human-recipe.sh'),script);
    const run=spawnSync('bash',[path.join(source,'scripts/update-human-recipe.sh')],{cwd:project,env:{...process.env,IDLEPROOF_RECIPE_ROOT:recipe,IDLEPROOF_RECIPE_NODE:process.execPath,DIFFWITNESS_BIN:wrongCore,PATH:path.dirname(wrongCore)+path.delimiter+process.env.PATH},encoding:'utf8',timeout:110000});
    assert.equal(run.status,fail?42:0,run.stdout+'\n'+run.stderr);
    assert.match(fs.readFileSync(path.join(runtime,'node_modules/idleproof/src/byok.mjs'),'utf8'),fail?/old/:/new/);
    const actions=fs.readFileSync(path.join(local,'actions.log'),'utf8');
    assert.match(actions,/old:stop\nnew:start/);
    if(fail)assert.match(actions,/new:start\nold:start/);else assert.match(actions,/new:ai/);
    assert.equal(fs.readFileSync(path.join(local,'byok/config.json'),'utf8'),'synthetic configuration to preserve');
    assert.equal(fs.readFileSync(path.join(local,'byok/meter.json'),'utf8'),'synthetic meter to preserve');
    assert.equal(fs.readFileSync(path.join(local,'project-scans/HEAD.json'),'utf8'),'synthetic scan to preserve');
    assert.ok(fs.readdirSync(recipe).some(name=>name.startsWith('byok-update.')));
  }
});


test('recipe updater rejects missing or incompatible dedicated Core before changing the runtime', {skip:process.platform==='win32',timeout:15000}, t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-update-core-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const script=new URL('../scripts/update-human-recipe.sh',import.meta.url);
  for(const incompatible of [false,true]) {
    const recipe=path.join(root,incompatible?'incompatible':'missing');
    const project=path.join(recipe,'projects/projet-multicouche');
    const cli=path.join(recipe,'runtime/node_modules/idleproof/bin/idleproof.mjs');
    fs.mkdirSync(path.join(project,'.idleproof'),{recursive:true});
    fs.mkdirSync(path.dirname(cli),{recursive:true});
    fs.writeFileSync(cli,'throw new Error("Runtime must not run during failed preflight");\n');
    if(incompatible) {
      const core=path.join(recipe,'venv-core/bin/dw');
      fs.mkdirSync(path.dirname(core),{recursive:true});
      fs.writeFileSync(core,'#!/bin/sh\nexit 2\n',{mode:0o700});
    }
    const run=spawnSync('bash',[fileURLToPath(script)],{cwd:project,env:{...process.env,IDLEPROOF_RECIPE_ROOT:recipe,IDLEPROOF_RECIPE_NODE:process.execPath},encoding:'utf8',timeout:10000});
    assert.equal(run.status,incompatible?2:1,run.stdout+'\n'+run.stderr);
    assert.equal(run.stderr.includes('Runtime must not run'),false);
    assert.equal(fs.readdirSync(recipe).some(name=>name.startsWith('byok-update.')),false);
  }
});
