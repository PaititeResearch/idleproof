// MACHINE acceptance: actual Local server / Cytoscape / storage. Synthetic Core capture.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.mjs';
import {tempAtlasFixture} from './atlas-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/pyvenv/lib/python3.13/site-packages/playwright/driver/package/index.mjs'));
const out=path.resolve(process.env.ATLAS_RECIPE_OUT||'qualification-evidence/atlas');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.ATLAS_CHROMIUM?{executablePath:process.env.ATLAS_CHROMIUM}:{})});
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL '+name+' '+e.stack);}}
for(const width of [1440,390]) {
  const fixture=tempAtlasFixture(),app=await createServer({cwd:fixture.cwd,port:0,experimentalAtlas:true});
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  const api=async()=>page.evaluate(async()=>await (await fetch('/api/atlas')).json());
  try{
    await page.goto(app.url+'/atlas.html');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Static capture loaded'));
    await check(`${width}: captured graph loads without network providers or a scan`,async()=>{
      const d=await api();assert.equal(d.nodes.length,3);assert.equal(await page.locator('#canvas canvas').count()>0,true);assert.equal(requests.some(r=>!r.url.startsWith(app.url)),false);assert.equal(requests.some(r=>r.method==='POST'),false);
      assert.match(await page.locator('#notice').innerText(),/SYNTHETIC DEMO/);assert.match(await page.locator('#identity').innerText(),/SYNTHETIC DEMO/);
    });
    await page.locator('#elements summary').click();await page.locator('#elementList button[data-node]').first().click();
    await check(`${width}: source identity visible and evidence cannot be renamed by aliases`,async()=>{
      assert.match(await page.locator('#details').innerText(),/Content hash/);await page.locator('#alias').fill('Payment boundary');await page.locator('#note').fill('Review the dependency; not an observed implementation fact.');await page.locator('#annotation button').click();
      assert.equal(await page.locator('#save').isEnabled(),true);await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('User model saved'));
      const d=await api();assert.equal(d.sequence,1);assert.equal(d.overlay.aliases[0].label,'Payment boundary');assert.match(await page.locator('#details').innerText(),/User alias; captured name:/);assert.notEqual(d.nodes.find(n=>n.id===d.overlay.aliases[0].id).label,'Payment boundary');
    });
    await check(`${width}: user class and inheritance are editable and persist as declarations`,async()=>{
      await page.locator('#view').selectOption('classes');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Static capture loaded'));
      await page.locator('#addNode').click();await page.locator('#newKind').selectOption('class');await page.locator('#newLabel').fill('PlannedCalculator');await page.locator('#newMembers').fill('+ calculate(value)');await page.locator('#editorForm button[type=submit]').click();await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('User model saved'));
      await page.locator('#addEdge').click();const opts=await page.locator('#edgeFrom option').evaluateAll(a=>a.map(x=>({id:x.value,text:x.textContent})));await page.locator('#edgeFrom').selectOption(opts.find(o=>o.text==='PlannedCalculator').id);await page.locator('#edgeTo').selectOption(opts.find(o=>o.text!=='PlannedCalculator').id);await page.locator('#edgeKind').selectOption('generalization');await page.locator('#edgeLabel').fill('proposed inheritance');await page.locator('#editorForm button[type=submit]').click();await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('User model saved'));
      await page.reload();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Static capture loaded'));const d=await api();assert.equal(d.overlay.nodes[0].label,'PlannedCalculator');assert.equal(d.overlay.edges[0].kind,'generalization');assert.equal(d.sequence,3);
      const full=await page.evaluate(async()=>await (await fetch('/api/atlas?action=export&format=json')).json());assert.equal(full.facts.nodes.some(n=>n.label==='PlannedCalculator'),false);assert.equal(full.userModel.overlay.nodes[0].label,'PlannedCalculator');
    });
    await check(`${width}: focused UML view distinguishes extracted classes and user inheritance`,async()=>{
      await page.locator('#view').selectOption('classes');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Static capture loaded'));
      const view=await page.evaluate(async()=>await (await fetch('/api/atlas?view=classes')).json());
      assert.ok(view.nodes.some(n=>n.kind==='class'&&n.origin==='core-scan'&&n.authority==='OBSERVED'));
      assert.ok(view.nodes.some(n=>n.label==='PlannedCalculator'&&n.authority==='DECLARED'));
      assert.ok(view.edges.some(e=>e.kind==='generalization'&&e.authority==='DECLARED'));
      assert.equal(view.edges.some(e=>e.kind==='generalization'&&e.authority==='OBSERVED'),false);
      await page.screenshot({path:path.join(out,`atlas-${width}-uml.png`),fullPage:true});
      await page.locator('#view').selectOption('modules');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Static capture loaded'));
    });
    await check(`${width}: revisions remain available and history stays closed until requested`,async()=>{
      assert.equal(await page.locator('#historyDialog').evaluate(e=>e.open),false);await page.locator('#history').click();await page.waitForSelector('#historyRows button');assert.equal(await page.locator('#historyRows button').count(),3);await page.locator('#closeHistory').click();assert.equal(await page.locator('#historyDialog').evaluate(e=>e.open),false);
    });
    await check(`${width}: stale concurrent write is rejected without losing saved annotations`,async()=>{
      const before=await api();const result=await page.evaluate(async d=>{const r=await fetch('/api/atlas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',source:'HEAD',snapshotId:d.identity.snapshotId,graphDigest:d.graphDigest,expectedRevision:null,overlay:d.overlay})});return {status:r.status,data:await r.json()};},before);assert.equal(result.status,409);assert.equal((await api()).revision,before.revision);
    });
    await check(`${width}: model export is local and preserves declared semantics`,async()=>{
      const dlPromise=page.waitForEvent('download');await page.locator('#jsonExport').click();const dl=await dlPromise;assert.equal(dl.suggestedFilename(),'idleproof-atlas.json');
      const m=await page.evaluate(async()=>await (await fetch('/api/atlas?action=export&format=mermaid&view=classes')).json());assert.match(m.text,/classDiagram/);assert.match(m.text,/DECLARED proposed inheritance/);
    });
    await check(`${width}: source inspection invokes only the local captured-source route`,async()=>{
      // Fault-injected source response: this test checks UI routing; real Core is tested separately.
      await page.route('**/api/atlas?*',async route=>{if(!route.request().url().includes('action=source'))return route.continue();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({lines:[{line:1,text:'def captured(): return 42',truncated:false}]})});});
      await page.locator('#elements summary').click();await page.locator('#elementList button[data-node]').first().click();await page.locator('#openSource').click();await page.waitForFunction(()=>document.getElementById('sourceCode').textContent.includes('def captured'));assert.equal(requests.some(r=>r.url.includes('openrouter')),false);await page.unroute('**/api/atlas?*');
    });
    await check(`${width}: no horizontal overflow, keyboard controls and theme are usable`,async()=>{
      assert.match(await page.locator('#identity').innerText(),/SYNTHETIC DEMO/);
      const sizes=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(sizes.scroll<=sizes.width+1,JSON.stringify(sizes));await page.locator('#theme').click();await page.screenshot({path:path.join(out,`atlas-${width}-dark.png`),fullPage:true});await page.locator('#theme').click();await page.screenshot({path:path.join(out,`atlas-${width}-light.png`),fullPage:true});
      await page.locator('#addNode').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#editor').evaluate(e=>e.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#editor').evaluate(e=>e.open),false);
    });
    await check(`${width}: labels are inert text; opening panels never grants an approval`,async()=>{
      await page.locator('#addNode').click();await page.locator('#newLabel').fill('<img src=x onerror=alert(1)>');await page.locator('#editorForm button[type=submit]').click();assert.equal(await page.locator('#canvas img').count(),0);assert.equal(await page.locator('#elementList img').count(),0);await page.locator('#discard').click();
      assert.equal(requests.some(r=>r.method==='POST'&&/\/api\/(approve|responsibility|policy|project-scan|ai)/.test(r.url)),false);assert.deepEqual(errors,[]);
    });
  }finally{await context.close();await new Promise(r=>app.server.close(r));fixture.close();}
}
await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({classification:'MACHINE',human:'NOT_RUN',syntheticCapture:true,results},null,2));
console.log(`${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
