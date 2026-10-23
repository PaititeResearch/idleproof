// One Atlas entry point. Lazy same-origin Deep frame retains independent
// parser/graph authority while the original editable UML document stays alive.
const get=id=>document.getElementById(id);
const root=get('atlasUnifiedNav'),structure=get('atlasUnifiedStructure'),deep=get('atlasUnifiedDeep');
const tabs={structure:get('atlasUnifiedStructureTab'),deep:get('atlasUnifiedDeepTab')};
const frame=get('atlasUnifiedDeepFrame'),status=get('atlasUnifiedStatus');
let current='structure',started=false,frameReady=false,hostVisible=true;
const embedded=window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1';
const dirty=()=>get('save')?.disabled===false||get('discard')?.disabled===false;
function announce(message){status.textContent=message;}
function syncDeep(){
  if(!started||!frameReady)return;
  frame.contentWindow?.postMessage({
    type:'idleproof:atlas-unified-state',
    visible:current==='deep'&&hostVisible&&!document.hidden,
    theme:document.documentElement.dataset.theme==='dark'?'dark':'light'
  },location.origin);
}
function pauseV1(){
  // The original V1 editor remains mounted, preserving any current note fields.
  // Its optional live-activity poll should not continue behind the Deep pane.
  const button=get('monitor');
  if(button?.textContent?.trim()==='Stop observing')button.click();
}
function activate(target,{focusTab=false}={}){
  if(!['structure','deep'].includes(target))return;
  if(target==='deep'&&dirty()){
    announce('Unsaved Structure & UML edits are still present. Save view or Discard edits before switching. Nothing was lost.');
    tabs.structure.focus();
    return;
  }
  if(target==='deep')pauseV1();
  current=target;
  structure.hidden=target!=='structure';
  deep.hidden=target!=='deep';
  for(const [key,button] of Object.entries(tabs)){
    button.setAttribute('aria-selected',String(key===target));
    button.tabIndex=key===target?0:-1;
  }
  if(target==='deep'&&!started){
    started=true;
    // A GET loads the separate status/view; only its own Analyze button can
    // start the static worker. No provider, scan or runtime execution here.
    frame.src='/atlas-deep.html?embedded=1';
  }
  announce(target==='structure'
    ?'Editable structure, UML declarations, private notes, saved view and revisions remain available. Deep evidence is separate.'
    :'Deep understanding is read-only. Analyze captured HEAD explicitly; no private notes or UML facts are rewritten. Return to Structure & UML for your saved annotations.');
  syncDeep();
  if(focusTab)tabs[target].focus();
}
tabs.structure.addEventListener('click',()=>activate('structure'));
tabs.deep.addEventListener('click',()=>activate('deep'));
root.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!root.contains(document.activeElement))return;
  if(![tabs.structure,tabs.deep].includes(document.activeElement))return;
  event.preventDefault();
  activate(event.key==='Home'||event.key==='ArrowLeft'?'structure':'deep',{focusTab:true});
});
frame.addEventListener('load',()=>{frameReady=true;syncDeep();});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
  const payload=event.data;
  if(payload.type==='idleproof:atlas-unified-frame-ready'){frameReady=true;syncDeep();}
  if(payload.type==='idleproof:atlas-unified-frame-height'&&Number.isInteger(payload.height)){
    frame.style.height=Math.max(660,Math.min(2600,payload.height+20))+'px';
  }
  if(payload.type==='idleproof:atlas-unified-open-structure')activate('structure',{focusTab:true});
});
get('theme')?.addEventListener('click',()=>queueMicrotask(syncDeep));
window.addEventListener('message',event=>{
  if(!embedded||event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='idleproof:atlas-host-visibility'&&typeof event.data.visible==='boolean'){
    hostVisible=event.data.visible;syncDeep();
  }
});
document.addEventListener('visibilitychange',syncDeep);
window.addEventListener('pagehide',()=>{hostVisible=false;syncDeep();});
window.addEventListener('beforeunload',event=>{
  if(dirty()){event.preventDefault();event.returnValue='';}
});
