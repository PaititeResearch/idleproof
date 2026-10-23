// MACHINE integration gate: one user-visible Atlas with original V1 note
// persistence plus separately admitted Deep evidence. Synthetic tracked HEAD.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.mjs';
import {writeAtlasFixture} from './atlas-fixture.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const dest=path.resolve(process.env.ATLAS_UNIFIED_RECIPE_OUT||'qualification-evidence/atlas-unified');
fs.mkdirSync(dest,{recursive:true});
const checks=[];
const record=()=>fs.writeFileSync(path.join(dest,'results.json'),JSON.stringify({
  classification:'MACHINE',human:'NOT_RUN',syntheticFixture:true,qualifiedLivePilot:false,
  originalV1StorePreserved:true,deepSourceStaticOnly:true,checks
},null,2));
async function check(name,fn){
  try{await fn();checks.push({name,status:'PASS'});console.log('PASS '+name);}
  catch(e){checks.push({name,status:'FAIL',error:e.stack});console.error('FAIL '+name+' '+e.stack);}
}
function fixture(){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-unified-browser-'));
  const git=(...a)=>execFileSync('git',a,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const code={
    'rules.py':'def adjusted(value):\n    return value * 0.9 if value >= 100 else value\n',
    'service.py':'from rules import adjusted\ndef process(value):\n    return adjusted(value)\n',
    'view.py':'from service import process\ndef render(value):\n    return process(value)\n'
  };
  git('init','-q');git('config','user.name','Unified Atlas synthetic fixture');
  git('config','user.email','atlas@example.invalid');git('config','core.autocrlf','false');
  for(const [name,source] of Object.entries(code))fs.writeFileSync(path.join(cwd,name),source);
  git('add','.');git('commit','-qm','synthetic unified interface');
  const tree=git('rev-parse','HEAD^{tree}'),snapshotId='dwscan_'+hash(tree);
  const files=Object.entries(code).map(([name,source])=>({
    path:name,sourceSha256:hash(source),role:'production',status:'parsed',
    extraction:{parsed:true,provider:'synthetic-fixture',symbols:[],calls:[],imports:[],
      description:{behaviors:[],intent:[],dependencies:[]}},relations:[]
  }));
  const model={schema:'idleproof.project-scan.v1',header:{
    snapshotId,source:'HEAD',tree,capturedAt:'2026-10-23T00:00:00Z',
    profile:{syntheticFixture:true},coverage:{complete:true,inventoryEntries:files.length,
      eligible:files.length,read:files.length,capturedSources:files.length,
      statuses:{parsed:files.length},reasons:{}}
  },files,edges:[],duplicates:[],unknowns:[]};
  writeAtlasFixture(cwd,model);
  return {cwd,model,close:()=>fs.rmSync(cwd,{recursive:true,force:true})};
}

let browser=null;
try{
  const module=process.env.PLAYWRIGHT_MODULE||'/opt/pyvenv/lib/python3.13/site-packages/playwright/driver/package/index.mjs';
  const {chromium}=await import(pathToFileURL(module));
  browser=await chromium.launch({headless:true,...(process.env.ATLAS_CHROMIUM?{executablePath:process.env.ATLAS_CHROMIUM}:{})});
}catch(e){checks.push({name:'Chromium start',status:'NOT_RUN',reason:e.message});record();console.error('NOT_RUN '+e.message);process.exitCode=2;}

if(browser){
  try{
    for(const width of [1440,390]){
      const f=fixture(),server=await createServer({cwd:f.cwd,port:0,experimentalAtlas:true,experimentalAtlasDeep:true});
      const context=await browser.newContext({viewport:{width,height:980}}),page=await context.newPage(),requests=[],errors=[];
      page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
      page.on('pageerror',e=>errors.push(e.message));
      const url=server.url,ui=()=>page.frameLocator('#atlasUnifiedDeepFrame');
      try{
        await page.goto(url+'/atlas.html');
        await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Static capture loaded'));
        await check(width+': a single Atlas entry loads the unchanged editable structure lazily',async()=>{
          assert.equal(await page.locator('#atlasUnifiedNav').count(),1);
          assert.equal(await page.locator('#atlasUnifiedStructure').isVisible(),true);
          assert.equal(await page.locator('#atlasUnifiedDeep').isHidden(),true);
          assert.equal(await page.locator('#atlasUnifiedStructureTab').getAttribute('aria-selected'),'true');
          assert.equal(requests.some(r=>r.url.includes('atlas-deep.html')||r.url.includes('/api/atlas-deep')),false,'Deep must be lazy');
          assert.equal(requests.some(r=>r.method==='POST'),false,'No user action means no write or worker start');
          assert.equal(requests.some(r=>!r.url.startsWith(url)),false,'No third-party network');
        });
        await page.locator('#elements summary').click();
        await page.locator('#elementList button[data-node]').first().click();
        const phrase='One Atlas persisted note: human declaration, not a Core fact';
        await page.locator('#note').fill(phrase);
        await page.locator('#annotation button').click();
        await check(width+': unsaved V1 private note prevents changing workspace',async()=>{
          assert.equal(await page.locator('#save').isEnabled(),true);
          await page.locator('#atlasUnifiedDeepTab').click();
          assert.equal(await page.locator('#atlasUnifiedDeep').isHidden(),true);
          assert.match(await page.locator('#atlasUnifiedStatus').innerText(),/Save view or Discard edits/);
          assert.equal(requests.some(r=>r.url.includes('atlas-deep.html')),false);
        });
        await page.locator('#save').click();
        await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('User model saved'));
        const readV1=async()=>page.evaluate(async()=>await (await fetch('/api/atlas')).json());
        const saved=await readV1();
        await check(width+': V1 user notes and canonical evidence retain separate identities',async()=>{
          assert.equal(saved.sequence,1);
          assert.equal(saved.overlay.notes.length,1);
          assert.equal(saved.overlay.notes[0].text,phrase);
          assert.equal(saved.facts?.nodes?.some?.(n=>n.label===phrase)||false,false);
        });
        await page.locator('#atlasUnifiedDeepTab').click();
        await page.waitForFunction(()=>document.getElementById('atlasUnifiedDeepFrame')?.contentDocument?.querySelector('#analyze')?.disabled===false);
        await check(width+': Deep is same-origin framed only when embedded and starts IDLE',async()=>{
          assert.equal(await page.locator('#atlasUnifiedStructure').isHidden(),true);
          assert.equal(await page.locator('#atlasUnifiedDeep').isVisible(),true);
          assert.equal(await page.locator('#atlasUnifiedDeepTab').getAttribute('aria-selected'),'true');
          assert.equal(await ui().locator('.mast').isHidden(),true,'Only one Atlas product masthead');
          assert.equal(await ui().locator('#analyze').isEnabled(),true);
          const result=await page.evaluate(async()=>await (await fetch('/api/atlas-deep?action=status&source=HEAD')).json());
          assert.equal(result.status,'IDLE');
          assert.equal(requests.some(r=>r.method==='POST'&&r.url.includes('atlas-deep')),false);
          const embedded=await page.evaluate(async()=>{
            const r=await fetch('/atlas-deep.html?embedded=1');
            return {status:r.status,xfo:r.headers.get('x-frame-options'),csp:r.headers.get('content-security-policy')};
          });
          assert.equal(embedded.status,200);
          assert.equal(embedded.xfo,'SAMEORIGIN');
          assert.match(embedded.csp,/frame-ancestors 'self'/);
        });
        await ui().locator('#analyze').click();
        await page.waitForFunction(()=>document.getElementById('atlasUnifiedDeepFrame')?.contentDocument?.querySelector('#notice')?.textContent.includes('Analysis loaded'),{},{timeout:90000});
        await check(width+': Deep graph resolves the actual captured functions without model billing',async()=>{
          const response=await page.evaluate(async()=>await (await fetch('/api/atlas-deep?action=graph&view=calls&source=HEAD')).json());
          assert.equal(response.status,'READY');
          assert.equal(response.identity.snapshotId,f.model.header.snapshotId);
          assert.ok(response.edges.some(e=>e.kind==='CALLS'));
          assert.equal(response.coverage.semanticCompleteness,'UNKNOWN');
          assert.equal(requests.filter(r=>r.method==='POST'&&r.url.includes('atlas-deep')).length,1);
          assert.equal(requests.some(r=>r.url.includes('openrouter')),false);
          const v1=await readV1();
          assert.equal(v1.revision,saved.revision);
          assert.deepEqual(v1.overlay.notes,saved.overlay.notes);
        });
        await ui().locator('#view').selectOption('all');
        await page.waitForFunction(()=>document.getElementById('atlasUnifiedDeepFrame')?.contentDocument?.getElementById('globalOverview')?.hidden===false);
        await check(width+': all-relations and focused views coexist inside unified Atlas',async()=>{
          const graph=await page.evaluate(async()=>await (await fetch('/api/atlas-deep?action=graph&view=focused&source=HEAD')).json());
          assert.match(await ui().locator('#globalStatus').innerText(),new RegExp(graph.edges.length+' of '+graph.edges.length));
          await ui().locator('#view').selectOption('focused');
          await page.waitForFunction(()=>document.getElementById('atlasUnifiedDeepFrame')?.contentDocument?.getElementById('focusChooser')?.hidden===false);
          assert.match(await ui().locator('#focusChooser').innerText(),/Choose a function to focus/);
        });
        await page.locator('#atlasUnifiedStructureTab').click();
        await check(width+': returning to UML restores private notes, history and source-bound state',async()=>{
          assert.equal(await page.locator('#atlasUnifiedStructure').isVisible(),true);
          assert.equal(await page.locator('#atlasUnifiedDeep').isHidden(),true);
          assert.match(await page.locator('#revision').innerText(),/User revision 1/);
          assert.equal((await readV1()).overlay.notes[0].text,phrase);
          await page.locator('#history').click();
          await page.waitForSelector('#historyRows button');
          assert.equal(await page.locator('#historyRows button').count(),1);
          await page.locator('#closeHistory').click();
          assert.deepEqual(errors,[]);
        });
        await page.reload();
        await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Static capture loaded'));
        await check(width+': same Atlas route retains revision after refresh, with Deep still lazy',async()=>{
          assert.equal(await page.locator('#atlasUnifiedStructure').isVisible(),true);
          assert.match(await page.locator('#revision').innerText(),/User revision 1/);
          assert.equal((await readV1()).overlay.notes[0].text,phrase);
          assert.equal(requests.some(r=>!r.url.startsWith(url)),false);
          assert.equal(requests.some(r=>r.method==='POST'&&!r.url.includes('/api/atlas')),false);
        });
        await page.screenshot({path:path.join(dest,'atlas-unified-'+width+'.png'),fullPage:true});
      }catch(e){
        checks.push({name:width+': unified recipe setup or prerequisite',status:'FAIL',error:e.stack});
        console.error(e);
      }finally{
        await context.close();
        server.server.closeAllConnections?.();await new Promise(resolve=>server.server.close(resolve));
        f.close();record();
      }
    }
  }finally{await browser.close();record();}
  const passed=checks.filter(x=>x.status==='PASS').length;
  console.log(passed+'/'+checks.length+' PASS');
  if(checks.some(x=>x.status!=='PASS'))process.exitCode=1;
}
