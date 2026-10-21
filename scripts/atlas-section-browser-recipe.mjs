// Actual Chromium / local server integration. Synthetic captures, no live provider calls.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.mjs';
import {tempAtlasFixture} from './atlas-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/pyvenv/lib/python3.13/site-packages/playwright/driver/package/index.mjs'));
const out=path.join(path.resolve(process.env.ATLAS_RECIPE_OUT||'qualification-evidence/atlas'),'section');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.ATLAS_CHROMIUM?{executablePath:process.env.ATLAS_CHROMIUM}:{})});
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.stack});console.error('FAIL '+name+' '+error.stack);}}
for(const width of [1440,390]){
 const fixture=tempAtlasFixture(),app=await createServer({cwd:fixture.cwd,port:0,experimentalAtlas:true});
 const ctx=await browser.newContext({viewport:{width,height:1000}}),page=await ctx.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method(),nested:r.frame()!==page.mainFrame()}));
 try{
  await check(`${width}: Local offers Atlas without loading graph resources, reading Atlas data or writing`,async()=>{
   await page.goto(app.url);await page.waitForFunction(()=>document.getElementById('connectionBanner')!==null);
   await page.waitForTimeout(250);assert.equal(await page.locator('#repositoryAtlasTab').count(),1);assert.equal(await page.locator('#atlasSectionFrame').getAttribute('src'),null);
   assert.equal(requests.some(r=>/\/api\/atlas|\/atlas\.html|\/atlas\.js|\/vendor\/cytoscape/.test(r.url)),false);assert.equal(requests.some(r=>r.method==='POST'),false);
  });
  await check(`${width}: selecting Atlas opens the actual same-project workspace inside Local`,async()=>{
   await page.locator('#repositoryAtlasTab').click();await page.waitForFunction(()=>document.getElementById('atlasSectionStatus').textContent.includes('Map open'));
   const frame=page.frameLocator('#atlasSectionFrame');await frame.locator('#notice').filter({hasText:/Static capture loaded/}).waitFor();
   assert.ok(await frame.locator('#canvas canvas').count()>0);assert.match(await frame.locator('#identity').innerText(),/SYNTHETIC DEMO/);
   assert.equal(page.url(),app.url+'/#repositoryAtlasSection');assert.equal(requests.some(r=>r.method==='POST'),false);
  });
  await check(`${width}: hide/reopen preserves unsaved edits and does not reload the graph`,async()=>{
   const frame=page.frameLocator('#atlasSectionFrame');await frame.locator('#addNode').click();await frame.locator('#newKind').selectOption('class');await frame.locator('#newLabel').fill('DraftLearningBoundary');await frame.locator('#editorForm button[type=submit]').click();
   await page.waitForFunction(()=>document.getElementById('atlasSectionStatus').textContent.includes('Unsaved diagram edits'));
   const count=requests.filter(r=>r.url.includes('/api/atlas')).length;
   await page.locator('#atlasSectionClose').click();assert.match(await page.locator('#atlasSectionStatus').innerText(),/unsaved edits retained/);
   await page.locator('#atlasSectionOpen').click();assert.equal(requests.filter(r=>r.url.includes('/api/atlas')).length,count);assert.equal(await frame.locator('#save').isEnabled(),true);
   await frame.locator('#save').click();await frame.locator('#notice').filter({hasText:/User model saved/}).waitFor();
   const stored=await page.evaluate(async()=>await(await fetch('/api/atlas')).json());assert.equal(stored.overlay.nodes[0].label,'DraftLearningBoundary');assert.equal(stored.nodes.some(n=>n.label==='DraftLearningBoundary'),false);
  });
  await check(`${width}: reload keeps persisted annotations but does not force a graph load`,async()=>{
   await page.reload();assert.equal(await page.locator('#atlasSectionFrame').getAttribute('src'),null);await page.locator('#repositoryAtlasTab').click();
   const frame=page.frameLocator('#atlasSectionFrame');await frame.locator('#notice').filter({hasText:/Static capture loaded/}).waitFor();
   const saved=await page.evaluate(async()=>await(await fetch('/api/atlas')).json());
   assert.equal(saved.overlay.nodes[0].label,'DraftLearningBoundary');assert.equal(saved.nodes.some(n=>n.label==='DraftLearningBoundary'),false);
   // Classes are intentionally not displayed in the default module view. Inspect their own view.
   await frame.locator('#view').selectOption('classes');
   await frame.locator('#notice').filter({hasText:/Static capture loaded/}).waitFor();
   await frame.locator('#elements summary').click();await frame.locator('#elementList').getByText(/DraftLearningBoundary/).waitFor();
  });
  await check(`${width}: live activity is stopped when the host hides the map`,async()=>{
   const frame=page.frameLocator('#atlasSectionFrame');await frame.locator('#monitorPanel summary').click();await frame.locator('#monitor').click();
   await frame.locator('#activity').getByText(/Latest task:/).waitFor();await page.locator('#atlasSectionClose').click();
   await page.waitForTimeout(300);const start=requests.filter(r=>r.nested&&r.url.endsWith('/api/state')).length;
   await page.waitForTimeout(2700);assert.equal(requests.filter(r=>r.nested&&r.url.endsWith('/api/state')).length,start);
   await page.locator('#atlasSectionOpen').click();assert.equal(await frame.locator('#monitor').innerText(),'Start observing');
  });
  await check(`${width}: keyboard dismissal and same-origin message boundary preserve controls`,async()=>{
   await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://foreign.invalid',source:document.getElementById('atlasSectionFrame').contentWindow,data:{type:'idleproof:atlas-close'}})));
   assert.equal(await page.locator('#atlasSectionWorkspace').isVisible(),true);const frame=page.frameLocator('#atlasSectionFrame');
   await frame.locator('#query').focus();await page.keyboard.press('Escape');
   // Escape crosses the iframe boundary through an asynchronous postMessage.
   await page.waitForFunction(()=>document.getElementById('atlasSectionWorkspace').hidden&&document.activeElement===document.getElementById('atlasSectionOpen'),null,{timeout:5000});
   assert.equal(await page.locator('#atlasSectionWorkspace').isHidden(),true);assert.equal(await page.locator('#atlasSectionOpen').evaluate(e=>e===document.activeElement),true);
   await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.getElementById('atlasSectionWorkspace').hidden);
  });
  await check(`${width}: embedded layout is bounded and original Local remains usable`,async()=>{
   const frame=page.frameLocator('#atlasSectionFrame');const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));assert.ok(sizes.scroll<=sizes.width+1,JSON.stringify(sizes));
   const inner=await frame.locator('html').evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth}));assert.ok(inner.scroll<=inner.width+1,JSON.stringify(inner));
   await page.locator('#repositoryAtlasSection').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`local-atlas-section-${width}.png`),fullPage:false});
   await page.locator('#atlasSectionClose').click();await page.locator('.section-nav a[href="#projectSection"]').click();assert.equal(await page.locator('#projectSection').isVisible(),true);
   assert.deepEqual(errors,[]);assert.equal(requests.some(r=>!r.url.startsWith(app.url)),false);
   assert.equal(requests.some(r=>r.method==='POST'&&!r.url.includes('/api/atlas')),false,'no provider, scan, approval or policy POST');
  });
 }finally{await ctx.close();app.server.closeAllConnections?.();await new Promise(r=>app.server.close(r));fixture.close();}
}
const off=tempAtlasFixture(),app=await createServer({cwd:off.cwd,port:0,experimentalAtlas:false});
try{await check('disabled experiment: original Local has no tab or Atlas resource request',async()=>{const page=await browser.newPage(),requests=[];page.on('request',r=>requests.push(r.url()));await page.goto(app.url);await page.waitForTimeout(300);assert.equal(await page.locator('#repositoryAtlasTab').count(),0);assert.equal(requests.some(r=>r.includes('atlas')||r.includes('cytoscape')),false);await page.close();});}
finally{app.server.closeAllConnections?.();await new Promise(r=>app.server.close(r));off.close();await browser.close();}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({classification:'MACHINE',human:'NOT_RUN',syntheticCapture:true,results},null,2));
console.log(`ATLAS SECTION ${results.filter(r=>r.status==='PASS').length}/${results.length} PASS`);if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
