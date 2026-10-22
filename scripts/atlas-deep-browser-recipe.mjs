// MACHINE acceptance of the real API, worker and canvas. Only an authored synthetic repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.mjs';
import {writeAtlasFixture} from './atlas-fixture.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const out=path.resolve(process.env.ATLAS_DEEP_RECIPE_OUT||'qualification-evidence/atlas-deep');fs.mkdirSync(out,{recursive:true});
const results=[];
const report=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({classification:'MACHINE',human:'NOT_RUN',syntheticCapture:true,realCoreCapture:false,meaning:'Real server, immutable Git bytes, parser worker and UI over an explicitly synthetic admitted scan manifest. Does not qualify the historical user project.',results},null,2));
function fixture(){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-deep-browser-'));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const contents={
    'rules.py':'def adjusted(value):\n    if value >= 100:\n        return value * 0.9\n    return value\n',
    'service.py':'from rules import adjusted as apply\ndef process(value):\n    result = apply(value)\n    return result\ndef dispatch(callback, value):\n    return callback(value)\n',
    'danger.py':'from pathlib import Path\nPath("MUST_NOT_EXECUTE").write_text("bad")\n',
    'settings.json':'{"threshold": 100, "label": "<img src=x onerror=alert(1)>"}\n'
  };
  git('init','-q');git('config','user.name','Atlas synthetic browser');git('config','user.email','atlas@example.invalid');git('config','core.autocrlf','false');
  for(const [file,content] of Object.entries(contents))fs.writeFileSync(path.join(cwd,file),content);
  git('add','.');git('commit','-qm','synthetic browser fixture');const tree=git('rev-parse','HEAD^{tree}'),snapshotId='dwscan_'+hash(tree);
  const files=Object.entries(contents).map(([file,content])=>({path:file,sourceSha256:hash(content),role:'production',status:'parsed',extraction:{parsed:true,provider:'synthetic-fixture',symbols:[],calls:[],imports:[],description:{behaviors:[],intent:[],dependencies:[]}},relations:[]}));
  const model={schema:'idleproof.project-scan.v1',header:{snapshotId,source:'HEAD',tree,capturedAt:'2026-10-22T00:00:00Z',profile:{syntheticFixture:true},coverage:{complete:true,inventoryEntries:files.length,eligible:files.length,read:files.length,capturedSources:files.length,statuses:{parsed:files.length},reasons:{}}},files,edges:[],duplicates:[],unknowns:[]};
  writeAtlasFixture(cwd,model);return {cwd,model,close:()=>fs.rmSync(cwd,{recursive:true,force:true})};
}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.stack});console.error('FAIL '+name+' '+error.stack);}}
let browser;
try{
  const module=process.env.PLAYWRIGHT_MODULE||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright/index.mjs'):'/opt/pyvenv/lib/python3.13/site-packages/playwright/driver/package/index.mjs');
  const {chromium}=await import(pathToFileURL(module));
  browser=await chromium.launch({headless:true,...(process.env.ATLAS_CHROMIUM?{executablePath:process.env.ATLAS_CHROMIUM}:{})});
}catch(error){results.push({name:'Chromium launch',status:'NOT_RUN',reason:error.message});report();console.error('NOT_RUN: Chromium unavailable: '+error.message);process.exitCode=2;}
if(browser){
  try{for(const width of [1440,390]){
    const f=fixture(),app=await createServer({cwd:f.cwd,port:0,experimentalAtlas:true,experimentalAtlasDeep:true});
    const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),requests=[],errors=[];
    page.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()}));page.on('pageerror',e=>errors.push(e.message));
    const api=async(action='status',extra={})=>page.evaluate(async ({action,extra})=>await (await fetch('/api/atlas-deep?'+new URLSearchParams({action,source:'HEAD',...extra}))).json(),{action,extra});
    try{
      await page.goto(app.url+'/atlas-deep.html');await page.waitForFunction(()=>!document.getElementById('analyze').disabled);
      await check(`${width}: opening page reads identity without analysis, provider calls or target execution`,async()=>{
        assert.equal((await api()).status,'IDLE');assert.equal(requests.some(r=>r.method==='POST'),false);assert.equal(requests.some(r=>!r.url.startsWith(app.url)),false);assert.equal(fs.existsSync(path.join(f.cwd,'MUST_NOT_EXECUTE')),false);
        assert.match(await page.locator('#identity').innerText(),new RegExp(f.model.header.snapshotId));
      });
      await page.locator('#analyze').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Analysis loaded'),{},{timeout:90000});
      await check(`${width}: explicit analysis produces real captured semantic graph and preserves unknown targets`,async()=>{
        const g=await api('graph');assert.equal(g.status,'READY');assert.ok(g.edges.some(e=>e.kind==='CALLS'));assert.ok(g.callSites.some(c=>c.status==='UNKNOWN'));assert.ok(g.callSites.some(c=>c.status==='RESOLVED'));assert.ok(await page.locator('#canvas canvas').count());assert.equal(fs.existsSync(path.join(f.cwd,'MUST_NOT_EXECUTE')),false);
        assert.equal(requests.filter(r=>r.method==='POST'&&r.body?.includes('"analyze"')).length,1);assert.ok(await page.locator('#callSites [data-state=UNKNOWN]').count());
      });
      await check(`${width}: function inspector provides incoming/outgoing, resolution and exact source`,async()=>{
        const g=await api('graph'),fn=g.nodes.find(n=>n.qualifiedName==='service.process'||n.label==='service.process'||n.label==='process');assert.ok(fn,'service.process is present');
        await page.locator(`#elementList button[data-node="${fn.id}"]`).click();assert.match(await page.locator('#details').innerText(),/Content hash/);assert.match(await page.locator('#outgoing').innerText(),/CALLS/);
        await page.locator('#openSource').click();await page.waitForFunction(()=>document.getElementById('sourceCode').textContent.includes('def process'));
        assert.match(await page.locator('#sourceCode').innerText(),/apply\(value\)/);assert.equal((await api()).status,'READY');
      });
      await check(`${width}: focus and control/data views preserve qualified boundaries`,async()=>{
        await page.locator('#focus').click();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Focused function'));
        assert.equal(await page.locator('#view').inputValue(),'focused');await page.locator('#view').selectOption('data');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Data flow'));assert.match(await page.locator('#viewMeaning').innerText(),/not observed values/);
        await page.locator('#whole').click();await page.locator('#view').selectOption('control');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Control flow'));assert.match(await page.locator('#viewMeaning').innerText(),/Reachability/);
        await page.locator('#view').selectOption('calls');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Function call graph'));
      });
      await check(`${width}: wheel zoom, fit and keyboard zoom are usable without mutations`,async()=>{
        const canvas=page.locator('#canvas'),bounds=await canvas.boundingBox();assert.ok(bounds);
        const count=requests.filter(r=>r.method==='POST').length;await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.wheel(0,-100);await page.mouse.wheel(0,-100);
        await page.locator('#zoomIn').focus();await page.keyboard.press('Enter');await page.locator('#zoomOut').click();await page.locator('#fit').click();assert.equal(requests.filter(r=>r.method==='POST').length,count);
      });
      await check(`${width}: runtime and sequence views never invent observations or auto-run`,async()=>{
        const posts=requests.filter(r=>r.method==='POST').length;await page.locator('#view').selectOption('runtime');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Runtime trace'));
        assert.match(await page.locator('#runtimeStatus').innerText(),/No qualified runtime/);assert.equal(await page.locator('#runtimeEvents li').count(),0);assert.equal(requests.filter(r=>r.method==='POST').length,posts);
        await page.locator('#view').selectOption('sequence');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Observed sequence'));assert.match(await page.locator('#viewMeaning').innerText(),/never converted into an invented/);assert.equal(requests.filter(r=>r.method==='POST').length,posts);
      });
      await check(`${width}: explicit synthetic runtime example reports observation or verified unavailability`,async()=>{
        await page.locator('#runtimeDemo').click();await page.waitForFunction(()=>{const text=document.getElementById('runtimeDemoStatus').textContent;return text.includes('SYNTHETIC FIXTURE')||text.includes('UNAVAILABLE')||text.includes('INTERRUPTED');},{},{timeout:30000});
        const text=await page.locator('#runtimeDemoStatus').innerText();assert.match(text,/SYNTHETIC FIXTURE|UNAVAILABLE|INTERRUPTED/);assert.equal(fs.existsSync(path.join(f.cwd,'MUST_NOT_EXECUTE')),false);
        if(text.includes('UNAVAILABLE')){assert.match(text,/Nothing was executed/);assert.equal(await page.locator('#runtimeEvents li').count(),0);}
        assert.equal((await api()).identity.snapshotId,f.model.header.snapshotId);
      });
      await check(`${width}: responsive, theme, inert source labels and return link`,async()=>{
        await page.locator('#view').selectOption('data');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Data flow'));
        const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,JSON.stringify(size));assert.equal(await page.locator('main img').count(),0);
        await page.screenshot({path:path.join(out,`deep-${width}-light.png`),fullPage:true});await page.locator('#theme').click();await page.screenshot({path:path.join(out,`deep-${width}-dark.png`),fullPage:true});
        assert.equal(await page.locator('.mast a').first().getAttribute('href'),'/atlas.html');assert.deepEqual(errors,[]);
        assert.equal(requests.some(r=>r.method==='POST'&&/\/api\/(approve|responsibility|policy|project-scan|ai|atlas\?)/.test(r.url)),false);
      });
      await check(`${width}: unsupported working-tree capture stays explicit and cannot start analysis`,async()=>{
        await page.locator('#source').selectOption('WORKTREE');await page.waitForFunction(()=>document.getElementById('identity').textContent.includes('No captured snapshot'));
        assert.equal(await page.locator('#analyze').isDisabled(),true);assert.equal(await page.locator('#elementList button').count(),0);
      });
    }catch(error){results.push({name:`${width}: recipe setup or prerequisite`,status:'FAIL',error:error.stack});console.error(error);}
    finally{await context.close();await new Promise(resolve=>app.server.close(resolve));f.close();report();}
  }}finally{await browser.close();report();}
  console.log(`${results.filter(x=>x.status==='PASS').length}/${results.length} PASS`);if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
}
