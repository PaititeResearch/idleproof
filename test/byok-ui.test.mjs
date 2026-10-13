import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {renderByokPreview,renderByokResult,formatByokStatus} from '../public/byok-view.js';

// Execute the shipped controller with a small DOM/fetch harness. No paid provider,
// real browser or HUMAN qualification is implied by this test.
function ui() {
  const elements=new Map(),requests=[];
  const get=id=>{if(!elements.has(id))elements.set(id,{id,value:'',checked:false,hidden:false,disabled:false,textContent:'',innerHTML:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});return elements.get(id);};
  get('scanSource').value='HEAD';get('aiQuestion').value='Explain the project';get('aiIncludeSource').checked=true;
  let deferPreview=null;
  const preview=body=>({digest:body.retryOf?'retry-digest':'initial-digest',retryOf:body.retryOf,configured:true,model:'test/model',requestPolicy:{maxTokens:2000},packet:{evidence:[{citation:'S1',path:'rules.py'}],selection:{eligible:19,omitted:18},includeSource:true}});
  const context={document:{getElementById:get,hidden:false},setInterval(){},URLSearchParams,renderByokPreview,renderByokResult,formatByokStatus,fetch:async(url,options)=>{
    const body=options?.body?JSON.parse(options.body):null;requests.push({url,body});
    let data;
    if(url.startsWith('/api/project-scan'))data={model:null,task:null,job:{state:'idle'}};
    else if(body?.action==='preview')data=deferPreview?await deferPreview(body):preview(body);
    else if(body?.action==='explain')data={digest:body.consentDigest,status:'FALLBACK',code:'BYOK_OUTPUT_TRUNCATED',retryable:true,reportedCostUsd:.001,latencyMs:12};
    else data={};
    return {ok:true,json:async()=>data};
  }};
  const source=fs.readFileSync(new URL('../public/project-scan.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  vm.runInNewContext(source,context);
  return {get,requests,preview,defer(fn){deferPreview=fn;}};
}

test('UI requires preview then explicit Send for initial and retry calls; double-click cannot pay twice',async()=>{
  const u=ui();await u.get('aiPreviewButton').onclick();
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,0);
  assert.equal(u.get('aiSend').disabled,false);
  await Promise.all([u.get('aiSend').onclick(),u.get('aiSend').onclick()]);
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,1);
  assert.match(u.get('aiResult').innerHTML,/reached its output limit/);
  assert.equal(u.get('aiRetry').hidden,false);
  await u.get('aiRetry').onclick();
  assert.equal(u.requests.at(-1).body.retryOf,'initial-digest');
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,1);
  await u.get('aiSend').onclick();
  assert.equal(u.requests.at(-1).body.consentDigest,'retry-digest');
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,2);
});
test('editing input invalidates pending preview and consent, including a late HTTP response',async()=>{
  const u=ui();let resolve;
  u.defer(body=>new Promise(r=>{resolve=()=>r(u.preview(body));}));
  const pending=u.get('aiPreviewButton').onclick();
  u.get('aiQuestion').value='New question';u.get('aiQuestion').listeners.input();
  resolve();await pending;
  assert.equal(u.get('aiSend').disabled,true);
  await u.get('aiSend').onclick();assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,0);
});
