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
    'controller.py':'from service import process\ndef handle(value):\n    return process(value)\n',
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
    // Read actual Cytoscape geometry in the browser; no production debug API.
    const js=fs.readFileSync(new URL('../public/atlas-deep.js',import.meta.url),'utf8');
    await page.route('**/atlas-deep.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:js+'\nwindow.__deepProbe=()=>cy&&cy.nodes().length?({zoom:cy.zoom(),pan:{...cy.pan()},width:cy.width(),height:cy.height(),fontPx:parseFloat(cy.nodes().first().style("font-size"))*cy.zoom(),first:cy.nodes().first().renderedBoundingBox({includeLabels:false,includeOverlays:false}),all:cy.nodes().renderedBoundingBox({includeLabels:false,includeOverlays:false})}):null;\nwindow.__deepLayout=()=>cy?({nodes:cy.nodes().map(n=>({id:n.id(),x:n.position("x"),y:n.position("y")})),edges:cy.edges().map(e=>({from:e.source().id(),to:e.target().id(),kind:e.data("kind")}))}):null;'}));
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
      await check(`${width}: Deep layout arranges linked islands, and Fit/Arrange preserve facts and positions`,async()=>{
        const read=()=>page.evaluate(()=>window.__deepLayout());
        const before=await read();assert.ok(before?.nodes.length>=4,'Expected synthetic semantic nodes');
        assert.ok(new Set(before.nodes.map(n=>Math.round(n.x))).size>=2,'Graph must not stack all nodes in one vertical column');
        assert.ok(new Set(before.nodes.map(n=>Math.round(n.y))).size>=2,'Graph must expose more than one readable row');
        const byId=new Map(before.nodes.map(n=>[n.id,n]));
        for(const e of before.edges){
          const a=byId.get(e.from),b=byId.get(e.to);assert.ok(a&&b);
          assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1000,'Linked nodes must share a local island: '+e.from+' -> '+e.to);
        }
        const digest=(await api('graph')).graphDigest,posts=requests.filter(r=>r.method==='POST').length;
        await page.locator('#fit').click();
        assert.deepEqual((await read()).nodes,before.nodes,'Fit must not change graph facts or coordinates');
        await page.locator('#layout').click();
        assert.deepEqual((await read()).nodes,before.nodes,'Arrange must reproduce stable coordinates');
        // Reproduce an operator-reported flaw: disconnected module/callsite facts
        // in a narrow split-pane formerly formed a long vertical column.
        await page.locator('#query').fill('danger.py');
        await page.locator('#search').click();
        await page.waitForFunction(total=>window.__deepLayout()?.nodes.length<total,before.nodes.length);
        const filtered=await read();assert.ok(filtered.nodes.length>=2,'Expected multiple facts in filtered file');
        assert.ok(new Set(filtered.nodes.map(n=>Math.round(n.x))).size>=2,'Filtered islands must not stack vertically');
        await page.locator('#query').fill('');await page.locator('#search').click();
        await page.waitForFunction(total=>window.__deepLayout()?.nodes.length===total,before.nodes.length);
        assert.equal((await api('graph')).graphDigest,digest,'Layout must not modify the semantic graph digest');
        assert.equal(requests.filter(r=>r.method==='POST').length,posts,'All layout operations must remain read-only');
      });
      await check(`${width}: Focused function requires a target and draws only direct callers/callees`,async()=>{
        const raw=await api('graph');
        const fn=raw.nodes.find(n=>n.qualifiedName==='service.process'||n.label==='service.process');
        assert.ok(fn,'Expected captured service.process for focus');
        const posts=requests.filter(r=>r.method==='POST').length;
        await page.locator('#view').selectOption('focused');
        await page.waitForFunction(()=>!document.getElementById('focusChooser').hidden);
        assert.equal(await page.locator('#canvas').isHidden(),true,'No full-graph spaghetti before selecting a function');
        assert.ok(await page.locator('#focusCandidates button').count(),'Accessible chooser must have captured functions');
        assert.match(await page.locator('#focusChooser').innerText(),/Choose a function to focus/);
        await page.locator('#query').fill('process');await page.locator('#search').click();
        await page.waitForFunction(()=>[...document.querySelectorAll('#focusCandidates button')].some(n=>n.textContent.includes('service.process')));
        await page.locator('#focusCandidates button').filter({hasText:'service.process'}).first().click();
        await page.waitForFunction(()=>!document.getElementById('focusStatus').hidden && document.getElementById('focusStatus').textContent.includes('service.process'));
        assert.equal(await page.locator('#view').inputValue(),'focused');
        assert.equal(await page.locator('#query').inputValue(),'','Previous Find must not silently erase focused neighbors');
        const details=await api('graph',{view:'focused',focus:fn.id});
        assert.equal(details.graphDigest,raw.graphDigest,'Focus must preserve analyzed graph identity');
        const expected=details.edges.filter(e=>['CALLS','MAY_CALL'].includes(e.kind)&&(e.from===fn.id||e.to===fn.id));
        const rendered=await page.evaluate(()=>window.__deepLayout());
        assert.equal(rendered.edges.length,expected.length,'Only direct graph call relations are drawn');
        assert.ok(rendered.nodes.length<=details.nodes.length,'Focused canvas cannot add fake nodes');
        assert.ok(rendered.nodes.some(n=>n.id===fn.id),'Selected function remains in the visual graph');
        const points=new Map(rendered.nodes.map(n=>[n.id,n]));
        const center=points.get(fn.id);
        let incoming=0,outgoing=0;
        for(const e of rendered.edges){
          assert.ok(['CALLS','MAY_CALL'].includes(e.kind),'No source-structure spaghetti on focused canvas');
          assert.ok(e.from===fn.id||e.to===fn.id,'Only chosen function one-hop calls can be drawn');
          if(e.to===fn.id&&e.from!==fn.id){incoming++;assert.ok(points.get(e.from).x<center.x,'Caller belongs on the left');}
          if(e.from===fn.id&&e.to!==fn.id){outgoing++;assert.ok(points.get(e.to).x>center.x,'Callee belongs on the right');}
        }
        assert.ok(incoming>0&&outgoing>0,'Fixture must qualify both incoming and outgoing call lanes');
        assert.match(await page.locator('#focusStatus').innerText(),/other captured relations remain in the accessible list/);
        assert.ok(await page.locator('#elementList button').count()>rendered.nodes.length,'Nonvisual evidence must remain inspectable');
        await page.locator('#fit').click();
        assert.deepEqual((await page.evaluate(()=>window.__deepLayout())).nodes,rendered.nodes,'Fit does not change semantics or focused positions');
        await page.locator('#layout').click();
        assert.deepEqual((await page.evaluate(()=>window.__deepLayout())).nodes,rendered.nodes,'Arrange remains deterministic');
        await page.locator('#query').fill('rules');await page.locator('#search').click();
        await page.waitForFunction(()=>!document.getElementById('focusChooser').hidden);
        assert.equal(await page.locator('#canvas').isHidden(),true,'Find chooses a new focus rather than filtering out relations');
        await page.locator('#query').fill('');
        await page.locator('#view').selectOption('calls');
        await page.waitForFunction(()=>document.getElementById('canvas').hidden===false&&document.getElementById('notice').textContent.includes('Function call graph'));
        assert.equal(requests.filter(r=>r.method==='POST').length,posts,'Focused UI never starts analysis or paid work');
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
      await check(`${width}: view legend is accurate and initial mobile nodes remain readable with explicit Fit`,async()=>{
        await page.locator('#view').selectOption('data');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Data flow'));
        assert.match(await page.locator('.legend').innerText(),/READS \/ WRITES/);assert.doesNotMatch(await page.locator('.legend').innerText(),/MAY_CALL/);
        if(width===390){
          const initial=await page.evaluate(()=>window.__deepProbe());assert.ok(initial.fontPx>=10,'Initial graph labels must render at least 10 CSS px: '+JSON.stringify(initial));
          assert.ok(initial.first.x1>=0&&initial.first.y1>=0&&initial.first.x2<=initial.width&&initial.first.y2<=initial.height,'Initial readable node must be on screen: '+JSON.stringify(initial));
          const posts=requests.filter(r=>r.method==='POST').length;await page.locator('#fit').click();const overview=await page.evaluate(()=>window.__deepProbe());
          assert.ok(overview.zoom<initial.zoom,'Explicit Fit must still reveal a broader overview');assert.ok(overview.all.y1>=-1&&overview.all.y2<=overview.height+1,'Fit must include the complete synthetic graph');
          await page.locator('#layout').click();const arranged=await page.evaluate(()=>window.__deepProbe());assert.ok(arranged.fontPx>=10,'Arrange must recover readable initial geometry');
          await page.locator('#canvas').scrollIntoViewIfNeeded();const box=await page.locator('#canvas').boundingBox();await page.mouse.move(box.x+box.width-15,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-15,box.y+box.height/2-90,{steps:6});await page.mouse.up();
          const panned=await page.evaluate(()=>window.__deepProbe());assert.ok(Math.abs(panned.pan.y-arranged.pan.y)>40,'Real pointer pan must reach the rest of the graph');await page.locator('#layout').click();
          assert.equal(requests.filter(r=>r.method==='POST').length,posts,'Camera operations must not mutate or analyze');
        }
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
