// Real-wheel MACHINE test on an isolated synthetic 32-file capture; never uses BYOK.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.mjs';
import {atlasFixtureModel,writeAtlasFixture} from './atlas-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/pyvenv/lib/python3.13/site-packages/playwright/driver/package/index.mjs'));
const out=path.resolve(process.env.ATLAS_RECIPE_OUT||'qualification-evidence/atlas');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.ATLAS_CHROMIUM?{executablePath:process.env.ATLAS_CHROMIUM}:{})});
let passed=0;
try {
  for(const width of [1440,390]) {
    const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'idleproof-zoom-'));
    writeAtlasFixture(cwd,atlasFixtureModel({count:32,classes:false}));
    const app=await createServer({cwd,port:0,experimentalAtlas:true});
    const context=await browser.newContext({viewport:{width,height:1000}});
    const page=await context.newPage(),requests=[],errors=[];
    page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
    page.on('pageerror',e=>errors.push(e.message));
    const js=fs.readFileSync(new URL('../public/atlas.js',import.meta.url),'utf8');
    await page.route('**/atlas.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:js+"\nwindow.__probe=()=>cy?({z:cy.zoom(),pan:cy.pan(),min:cy.minZoom(),max:cy.maxZoom(),nodes:cy.nodes().length}):null;"}));
    try {
      await page.goto(app.url+'/atlas.html');
      await page.waitForFunction(()=>window.__probe?.()?.nodes===32&&document.querySelector('#notice').textContent.includes('Static capture loaded'));
      const rect=await page.locator('#canvas').boundingBox();
      const x=rect.width*.42,y=rect.height*.53;
      await page.mouse.move(rect.x+x,rect.y+y);
      const probe=()=>page.evaluate(()=>window.__probe());
      const initial=await probe();
      console.log('ATLAS ZOOM INITIAL '+width+': '+initial.z);assert.ok(initial.z<1,'expected a zoomed-out overview; got '+initial.z);
      for(let i=0;i<3;i++)await page.mouse.wheel(0,-100);
      const after=await probe();console.log('ATLAS ZOOM AFTER THREE '+width+': '+after.z);
      assert.ok(after.z>=1&&after.z<=after.max,'three wheel ticks must reach readable scale');
      const beforePoint={x:(x-initial.pan.x)/initial.z,y:(y-initial.pan.y)/initial.z};
      const afterPoint={x:(x-after.pan.x)/after.z,y:(y-after.pan.y)/after.z};
      const driftPx=Math.hypot(beforePoint.x-afterPoint.x,beforePoint.y-afterPoint.y)*initial.z;
      console.log('ATLAS ZOOM POINTER DRIFT '+width+': '+driftPx+' CSS px');
      assert.ok(driftPx<3,'zoom must preserve pointer anchor within 3 CSS pixels; got '+driftPx);
      assert.equal(await page.locator('#save').isEnabled(),false,'zoom is not a source/model edit');
      await page.screenshot({path:path.join(out,'atlas-zoom-'+width+'.png')});
      passed++;
      for(let i=0;i<3;i++)await page.mouse.wheel(0,100);
      assert.ok((await probe()).z<after.z,'reverse wheel must zoom out');
      await page.locator('#fit').click();
      const fit=await probe();assert.ok(Math.abs(fit.z-initial.z)<.05,'Fit must restore the original viewport scale; got '+fit.z+' vs '+initial.z);
      passed++;
      // Fit was clicked in the toolbar; return the real pointer to the graph before testing trackpad scrolling.
      await page.mouse.move(rect.x+x,rect.y+y);
      const before=await probe();
      for(let i=0;i<4;i++)await page.mouse.wheel(0,-8);
      const ratio=(await probe()).z/before.z;
      assert.ok(ratio>1.15&&ratio<1.7,'trackpad increments should stay smooth');
      assert.equal(await page.locator('#save').isEnabled(),false);
      assert.equal(requests.some(r=>r.method!=='GET'||!r.url.startsWith(app.url)),false,'no external or paid calls');
      assert.deepEqual(errors,[]);
      passed++;
      console.log('PASS '+width+' px: 3 wheel notches, anchor, reverse, Fit, fine trackpad, zero writes');
    } finally {
      await context.close();
      await new Promise(resolve=>app.server.close(resolve));
      fs.rmSync(cwd,{recursive:true,force:true});
    }
  }
} finally { await browser.close(); }
console.log('ATLAS ZOOM '+passed+'/6 PASS');
