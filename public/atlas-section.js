// Lazy same-origin workspace. No scan, provider, storage write or polling in the host.
const frame=document.getElementById('atlasSectionFrame');
const workspace=document.getElementById('atlasSectionWorkspace');
const openButton=document.getElementById('atlasSectionOpen');
const closeButton=document.getElementById('atlasSectionClose');
const tab=document.getElementById('repositoryAtlasTab');
const status=document.getElementById('atlasSectionStatus');
let opened=false,loaded=false,ready=false,visible=false,dirty=false,timer=null;
function sendState(){
  if(ready)frame.contentWindow?.postMessage({type:'idleproof:atlas-host-visibility',visible:opened&&visible&&!document.hidden},location.origin);
}
function updateStatus(){
  status.textContent=opened
    ?ready?(dirty?'Unsaved diagram edits. Save in the map; hiding preserves them in this tab.':'Map open. Edits affect only the separate user model. No model call is required.'):'Opening the local map…'
    :loaded?(dirty?'Map hidden with unsaved edits retained in this tab. Reopen to save them.':'Map hidden. Reopening keeps this workspace; live observation is stopped.'):'Map not loaded. Opening it reads the existing capture; it does not scan your project or call a model.';
}
function open(){
  if(opened){sendState();return;}
  opened=true;workspace.hidden=false;closeButton.hidden=false;openButton.hidden=true;openButton.setAttribute('aria-expanded','true');
  if(!loaded){
    loaded=true;frame.src='/atlas.html?embedded=1';
    timer=setTimeout(()=>{if(!ready&&opened)status.textContent='The embedded map has not become ready. The rest of Local is unaffected; use Open standalone to inspect it.';},12000);
  }
  updateStatus();sendState();
}
function close(){opened=false;sendState();workspace.hidden=true;closeButton.hidden=true;openButton.hidden=false;openButton.setAttribute('aria-expanded','false');updateStatus();openButton.focus();}
openButton.addEventListener('click',open);closeButton.addEventListener('click',close);tab.addEventListener('click',open);
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
  if(event.data.type==='idleproof:atlas-ready'){ready=true;clearTimeout(timer);updateStatus();sendState();}
  if(event.data.type==='idleproof:atlas-dirty'&&typeof event.data.dirty==='boolean'){dirty=event.data.dirty;updateStatus();}
  if(event.data.type==='idleproof:atlas-close')close();
});
const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);sendState();},{threshold:0}):null;
observer?.observe(frame);if(!observer)visible=true;
document.addEventListener('visibilitychange',sendState);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{opened=false;sendState();clearTimeout(timer);observer?.disconnect();});
