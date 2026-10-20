import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {renderByokPreview,renderByokResult,formatByokStatus} from '../public/byok-view.js';

// Execute the shipped controller with a small DOM/fetch harness. No paid provider,
// real browser or HUMAN qualification is implied by this test.
function ui({explanation=null}={}) {
  const elements=new Map(),requests=[];
  const get=id=>{if(!elements.has(id))elements.set(id,{id,value:'',checked:false,hidden:false,disabled:false,textContent:'',innerHTML:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(name,value){this[name]=value;},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}});return elements.get(id);};
  get('scanSource').value='HEAD';get('aiQuestion').value='Explain the project';get('aiIncludeSource').checked=true;
  let deferPreview=null,deferSource=null;
  const preview=body=>({digest:body.retryOf?'retry-digest':'initial-digest',retryOf:body.retryOf,configured:true,model:'test/model',requestPolicy:{maxTokens:2000},packet:{evidence:[{citation:'S1',path:'rules.py'}],selection:{eligible:19,omitted:18},includeSource:true}});
  const context={document:{getElementById:get,hidden:false},setInterval(){},URLSearchParams,renderByokPreview,renderByokResult,formatByokStatus,fetch:async(url,options)=>{
    const body=options?.body?JSON.parse(options.body):null;requests.push({url,body});
    let data;
    if(url.startsWith('/api/project-scan'))data={model:null,task:null,job:{state:'idle'}};
    else if(url.startsWith('/api/project-source'))data=deferSource?await deferSource(url):{snapshotId:'snap',path:new URLSearchParams(url.split('?')[1]).get('path'),sourceSha256:'abc',lines:[{line:1,text:'return value < 100',truncated:false}]};
    else if(body?.action==='preview')data=deferPreview?await deferPreview(body):preview(body);
    else if(body?.action==='explain')data=explanation||{digest:body.consentDigest,status:'FALLBACK',code:'BYOK_OUTPUT_TRUNCATED',retryable:true,reportedCostUsd:.001,latencyMs:12};
    else data={};
    return {ok:true,json:async()=>data};
  }};
  const source=fs.readFileSync(new URL('../public/project-scan.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
  vm.runInNewContext(source,context);
  return {get,requests,preview,defer(fn){deferPreview=fn;},deferSource(fn){deferSource=fn;}};
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

function citation(path='rules.py') {
  const button={dataset:{aiSource:path,aiSnapshot:'snap'},after(target){this.sourcePanel=target;}};
  return {button,event:{target:{closest:()=>button}}};
}
test('citation click reveals and focuses local source next to the clicked button before fetch completes',async()=>{
  const u=ui(),{button,event}=citation();let resolve;
  u.get('aiSourceDetail').hidden=true;
  u.deferSource(()=>new Promise(r=>{resolve=r;}));
  const pending=u.get('aiResult').onclick(event),panel=u.get('aiSourceDetail');
  assert.equal(button.sourcePanel,panel);assert.equal(panel.hidden,false);
  assert.match(panel.textContent,/Loading captured source: rules.py/);
  assert.equal(panel.focused,true);assert.equal(panel.scrolled,true);
  const query=new URLSearchParams(u.requests.at(-1).url.split('?')[1]);
  assert.equal(query.get('snapshot'),'snap');assert.equal(query.get('path'),'rules.py');
  resolve({snapshotId:'snap',path:'rules.py',sourceSha256:'abc',lines:[{line:1,text:'return value < 100',truncated:true}]});
  await pending;
  assert.match(panel.textContent,/Captured source: rules.py/);
  assert.match(panel.textContent,/1: return value < 100 \[truncated\]/);
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,0);
});
test('citation fetch failure is visible at the citation without requesting a generation',async()=>{
  const u=ui(),{button,event}=citation();
  u.deferSource(async()=>{throw new Error('Captured snapshot unavailable');});
  await u.get('aiResult').onclick(event);
  assert.equal(button.sourcePanel.hidden,false);
  assert.match(button.sourcePanel.textContent,/Unable to load captured source: Captured snapshot unavailable/);
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,0);
});
test('an older source response cannot overwrite the last clicked citation',async()=>{
  const u=ui(),first=citation('rules.py'),second=citation('service.py');let resolve;
  u.deferSource(url=>url.includes('rules.py')?new Promise(r=>{resolve=r;}):Promise.resolve({snapshotId:'snap',path:'service.py',sourceSha256:'def',lines:[]}));
  const pending=u.get('aiResult').onclick(first.event);
  await u.get('aiResult').onclick(second.event);
  resolve({snapshotId:'snap',path:'rules.py',sourceSha256:'abc',lines:[]});await pending;
  assert.match(u.get('aiSourceDetail').textContent,/Captured source: service.py/);
});

// Retain the HUMAN-observed consent cycle for every scope-changing input, not just text.
test('editing any preview input disables Send until a fresh preview; no preview generates',async()=>{
  for(const id of ['aiQuestion','aiPaths','aiIncludeSource','aiIncludeMemory','scanSource']) {
    const u=ui();
    await u.get('aiPreviewButton').onclick();assert.equal(u.get('aiSend').disabled,false,id);
    u.get(id).listeners.input();assert.equal(u.get('aiSend').disabled,true,id);
    await u.get('aiSend').onclick();
    assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,0,id);
    await u.get('aiPreviewButton').onclick();assert.equal(u.get('aiSend').disabled,false,id);
    assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,0,id);
  }
});

test('a model abstention shows its limits without offering a blind retry or adding context',async()=>{
  const u=ui({explanation:{status:'FALLBACK',code:'BYOK_EMPTY_INTERPRETATION',retryable:false,
    limitations:['The selected packet omits the access conditions.'],reportedCostUsd:.001,latencyMs:50}});
  await u.get('aiPreviewButton').onclick();
  await u.get('aiSend').onclick();
  assert.match(u.get('aiResult').innerHTML,/More context is needed/);
  assert.match(u.get('aiResult').innerHTML,/omits the access conditions/);
  assert.equal(u.get('aiRetry').hidden,true);assert.equal(u.get('aiSend').disabled,true);
  assert.equal(u.get('aiIncludeMemory').checked,false);assert.equal(u.get('aiPaths').value,'');
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,1);
  await u.get('aiPreviewButton').onclick();
  assert.equal(u.requests.filter(r=>r.body?.action==='explain').length,1);
});
