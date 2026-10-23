// Optional same-origin Deep embed bridge. Standalone Deep remains unchanged.
// Reports size and host visibility; never starts analysis or sends project data.
const embedded=window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1';
if(embedded){
  document.documentElement.dataset.atlasUnifiedEmbedded='true';
  let visible=true,lastHeight=0;
  const report=()=>{
    const main=document.querySelector('main');
    if(!main)return;
    const height=Math.max(600,Math.min(2590,Math.ceil(main.getBoundingClientRect().height+25)));
    if(Math.abs(height-lastHeight)<4)return;
    lastHeight=height;
    window.parent.postMessage({type:'idleproof:atlas-unified-frame-height',height},location.origin);
  };
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='idleproof:atlas-unified-state')return;
    if(typeof event.data.visible!=='boolean'||!['light','dark'].includes(event.data.theme))return;
    const requested=event.data.visible;
    if(event.data.theme!==(document.documentElement.dataset.theme==='dark'?'dark':'light')){
      // Let the original Deep theme handler update Cytoscape styles.
      document.getElementById('theme')?.click();
    }
    if(!requested&&visible){
      // Deep's existing pagehide hook cancels only browser reads/polling,
      // not the captured-project worker or any local user-model state.
      window.dispatchEvent(new Event('pagehide'));
    }
    if(requested&&!visible){
      const status=document.getElementById('job')?.textContent||'';
      if(status.includes('RUNNING'))document.getElementById('reload')?.click();
    }
    visible=requested;
    if(visible)requestAnimationFrame(report);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!document.querySelector('dialog[open]'))
      window.parent.postMessage({type:'idleproof:atlas-unified-open-structure'},location.origin);
  });
  if(typeof ResizeObserver==='function'){
    const target=document.querySelector('main');
    if(target)new ResizeObserver(report).observe(target);
  }
  window.addEventListener('load',report);
  window.parent.postMessage({type:'idleproof:atlas-unified-frame-ready'},location.origin);
  requestAnimationFrame(report);
}
