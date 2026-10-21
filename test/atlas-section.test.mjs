import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createServer} from '../src/server.mjs';
import {injectAtlasSection} from '../src/atlas-section.mjs';
import {tempAtlasFixture} from '../scripts/atlas-fixture.mjs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
async function server(t,enabled){const fixture=tempAtlasFixture();const app=await createServer({cwd:fixture.cwd,port:0,experimentalAtlas:enabled});t.after(async()=>{app.server.closeAllConnections?.();await new Promise(resolve=>app.server.close(resolve));fixture.close();});return {...app,fixture};}
test('section: disabled cockpit is byte-identical and Atlas API/page remain inaccessible',async t=>{
 const app=await server(t,false);for(const path of ['/','/index.html']){const r=await fetch(app.url+path);assert.equal(await r.text(),html);assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);}
 for(const path of ['/atlas.html','/atlas.html?embedded=1','/api/atlas'])assert.equal((await fetch(app.url+path)).status,404);
});
test('section: enabled shell has one optional section, no eager renderer and preserves all existing IDs/scripts',async t=>{
 const app=await server(t,true);const response=await fetch(app.url);const rendered=await response.text();assert.equal(rendered,injectAtlasSection(html));
 assert.equal((rendered.match(/id="repositoryAtlasSection"/g)||[]).length,1);
 assert.match(rendered,/<iframe id="atlasSectionFrame"[^>]*title=/);assert.doesNotMatch(rendered,/<iframe[^>]*\ssrc=/);
 assert.doesNotMatch(rendered,/src="\/vendor\/cytoscape|src="\/atlas.js/);
 for(const id of html.matchAll(/\bid="([^"]+)"/g))assert.ok(rendered.includes(id[0]),id[1]);
 for(const src of html.matchAll(/<script[^>]+src="([^"]+)"/g))assert.ok(rendered.includes(src[0]));
 assert.equal(response.headers.get('x-frame-options'),'DENY');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal(fs.existsSync(app.fixture.cwd+'/.idleproof/atlas'),false,'no atlas writes on cockpit GET');
});
test('section: only explicit embedded Atlas permits same-origin framing, API and standalone stay DENY',async t=>{
 const app=await server(t,true);
 for(const suffix of ['', '?embedded=0']){const r=await fetch(app.url+'/atlas.html'+suffix);assert.equal(r.status,200);assert.equal(r.headers.get('x-frame-options'),'DENY');}
 const r=await fetch(app.url+'/atlas.html?embedded=1');assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'self'/);assert.doesNotMatch(r.headers.get('content-security-policy'),/unsafe-inline|unsafe-eval|\*/);
 const api=await fetch(app.url+'/api/atlas');assert.equal(api.headers.get('x-frame-options'),'DENY');assert.equal((await api.json()).status,'READY');
 const foreign=await fetch(app.url+'/api/atlas',{method:'POST',headers:{origin:'https://foreign.invalid','content-type':'application/json'},body:'{}'});assert.equal(foreign.status,403);
});
test('section: injection fails visibly for an incompatible shell, never guesses an insertion',()=>{assert.throws(()=>injectAtlasSection('<html></html>'),/incompatible/);assert.throws(()=>injectAtlasSection(injectAtlasSection(html)),/incompatible/);});
function harness(){
 const handlers={},messages=[],timers=new Map();let nextTimer=0,observer=null,requests=0;
 const make=id=>({id,hidden:false,textContent:'',attrs:{},handlers:{},addEventListener(n,f){this.handlers[n]=f;},setAttribute(n,v){this.attrs[n]=v;},focus(){this.focused=true;}});
 const ids=Object.fromEntries(['atlasSectionFrame','atlasSectionWorkspace','atlasSectionOpen','atlasSectionClose','repositoryAtlasTab','atlasSectionStatus'].map(id=>[id,make(id)]));
 ids.atlasSectionFrame.contentWindow={postMessage:(data,origin)=>messages.push({data,origin})};
 Object.defineProperty(ids.atlasSectionFrame,'src',{set(value){this.loadedSrc=value;requests++;},get(){return this.loadedSrc;}});
 const doc={hidden:false,getElementById:id=>ids[id],addEventListener:(n,f)=>handlers['doc:'+n]=f};
 const context={document:doc,window:{addEventListener:(n,f)=>handlers[n]=f},location:{origin:'http://127.0.0.1:4778'},setTimeout:f=>{const n=++nextTimer;timers.set(n,f);return n;},clearTimeout:n=>timers.delete(n),IntersectionObserver:class{constructor(f){observer=f;}observe(){}disconnect(){}}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/atlas-section.js',import.meta.url),'utf8'),context);
 const click=id=>ids[id].handlers.click();const message=(data,origin=context.location.origin,source=ids.atlasSectionFrame.contentWindow)=>handlers.message({data,origin,source});
 return {ids,click,message,handlers,messages,timers,doc,intersect:value=>observer([{isIntersecting:value}]),get requests(){return requests;}};
}
test('section controller: load is explicit, opening twice reuses one frame, hiding retains unsaved work',()=>{
 const h=harness();assert.equal(h.requests,0);h.click('repositoryAtlasTab');assert.equal(h.requests,1);assert.equal(h.ids.atlasSectionFrame.src,'/atlas.html?embedded=1');h.intersect(true);h.message({type:'idleproof:atlas-ready'});h.message({type:'idleproof:atlas-dirty',dirty:true});
 h.click('atlasSectionClose');assert.match(h.ids.atlasSectionStatus.textContent,/unsaved edits retained/);assert.equal(h.ids.atlasSectionWorkspace.hidden,true);assert.equal(h.messages.at(-1).data.visible,false);assert.equal(h.ids.atlasSectionOpen.focused,true);
 h.click('atlasSectionOpen');assert.equal(h.requests,1);assert.match(h.ids.atlasSectionStatus.textContent,/Unsaved diagram edits/);
});
test('section controller: foreign origins or unrelated windows cannot acknowledge or manipulate the frame',()=>{
 const h=harness();h.click('atlasSectionOpen');h.message({type:'idleproof:atlas-ready'},'https://evil.invalid');h.message({type:'idleproof:atlas-ready'},undefined,{});assert.match(h.ids.atlasSectionStatus.textContent,/Opening/);
 h.message({type:'idleproof:atlas-close'},'https://evil.invalid');assert.equal(h.ids.atlasSectionWorkspace.hidden,false);h.message({type:'idleproof:atlas-ready'});assert.match(h.ids.atlasSectionStatus.textContent,/Map open/);
});
test('section controller: offscreen, hidden tab and explicit close suspend activity; dirty navigation warns',()=>{
 const h=harness();h.click('atlasSectionOpen');h.intersect(true);h.message({type:'idleproof:atlas-ready'});assert.equal(h.messages.at(-1).data.visible,true);h.intersect(false);assert.equal(h.messages.at(-1).data.visible,false);h.intersect(true);h.doc.hidden=true;h.handlers['doc:visibilitychange']();assert.equal(h.messages.at(-1).data.visible,false);
 let prevented=false;h.message({type:'idleproof:atlas-dirty',dirty:true});h.handlers.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,true);h.message({type:'idleproof:atlas-close'});assert.equal(h.ids.atlasSectionWorkspace.hidden,true);
});
test('section controller: frame failure provides a bounded local fallback without retry or data loss',()=>{
 const h=harness();h.click('atlasSectionOpen');for(const f of h.timers.values())f();assert.match(h.ids.atlasSectionStatus.textContent,/has not become ready/);assert.equal(h.requests,1);h.click('atlasSectionClose');h.click('atlasSectionOpen');assert.equal(h.requests,1);
});
