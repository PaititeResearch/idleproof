import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {shellReadPaths} from '../src/shell-read-context.mjs';
import {processHookLifecycle} from '../src/hook.mjs';
import {buildPlainExplanation} from '../src/explain.mjs';

function fixture() {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-shell-read-'));
  fs.mkdirSync(path.join(cwd,'docs'));
  for(const name of ['docs/OWNER_INTENT.md','rules.py','access_policy.py','service.py','with space.py','.env','credentials.json']) {
    fs.writeFileSync(path.join(cwd,name),name.endsWith('.py') ? 'def example():\n    return True\n' : 'Fixture\n');
  }
  return cwd;
}
const command='nl -ba docs/OWNER_INTENT.md; nl -ba rules.py; nl -ba access_policy.py; nl -ba service.py';
const event=(cwd,cmd=command)=>({cwd,session_id:'read-test',hook_event_name:'PostToolUse',tool_name:'Bash',tool_input:{command:cmd},tool_response:{exit_code:0}});

test('literal shell reads identify the four real-test paths without executing their contents',()=>{
  const cwd=fixture();
  try {
    assert.deepEqual(shellReadPaths(event(cwd)),['docs/OWNER_INTENT.md','rules.py','access_policy.py','service.py']);
    assert.deepEqual(shellReadPaths(event(cwd,"cat -- 'with space.py' && sed -n '1,4p' rules.py\nhead -n 2 service.py")),['with space.py','rules.py','service.py']);
    assert.deepEqual(shellReadPaths({...event(cwd),hook_event_name:'PreToolUse'}),[]);
    assert.deepEqual(shellReadPaths({...event(cwd),hook_event_name:'PostToolUseFailure'}),[]);
    assert.deepEqual(shellReadPaths({...event(cwd),tool_response:{exit_code:1}}),[]);
    assert.deepEqual(shellReadPaths({...event(cwd),tool_response:{interrupted:true}}),[]);
  } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});

test('mentions, shell control flow, expansions, redirects and unsafe sources cannot create file context',()=>{
  const cwd=fixture();
  try {
    for(const cmd of ['echo cat rules.py','rg --files rules.py','cd docs; cat rules.py',
      'false && cat rules.py','if false; then cat rules.py; fi','for p in rules.py; do cat "$p"; done',
      'cat "$FILE"','cat *.py','cat rules.py > out.txt','echo rules.py | cat',
      "cat 'rules'.py",'cat rules.py &&','cat rules.py # note','cat $(pwd)/rules.py',
      'cat .env credentials.json','cat ../outside.py','cat missing.py','cat .idleproof/state.json']) {
      assert.deepEqual(shellReadPaths(event(cwd,cmd)),[],cmd);
    }
    assert.deepEqual(shellReadPaths({...event(cwd),tool_input:{command,workdir:'docs'}}),[]);
    const outside=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-shell-outside-'));
    try {
      fs.writeFileSync(path.join(outside,'external.py'),'private fixture');
      fs.symlinkSync(outside,path.join(cwd,'linked'),'junction');
      assert.deepEqual(shellReadPaths(event(cwd,'cat linked/external.py')),[]);
    } finally {fs.rmSync(outside,{recursive:true,force:true});}
  } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});

test('hook attaches shell paths to live task context and labels the separate local inspection',()=>{
  const cwd=fixture();
  try {
    const result=processHookLifecycle(event(cwd),{deferAutoDebt:true});
    const session=result.state.sessions['read-test'];
    assert.deepEqual(session.touchedFiles,['docs/OWNER_INTENT.md','rules.py','access_policy.py','service.py']);
    assert.equal(session.taskSignals.file,'service.py');
    assert.match(result.hookOutput.systemMessage,/service\.py/);
    assert.match(buildPlainExplanation({session}).project,/does not establish the exact bytes/);
    assert.deepEqual(session.changed,{added:0,deleted:0});
    assert.equal(session.proof,null);
  } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});
