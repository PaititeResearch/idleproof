// Separate opt-in page. No provider calls, project scans or policy writes.
const $=id=>document.getElementById(id),copy=x=>structuredClone(x);
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
let data=null,overlay=null,cy=null,selected=null,dirty=false,loading=false,sequence=0,sourceSeq=0,offset=0,focus='',editMode='node',editId=null;
let controller=null,monitoring=false,monitorTimer=null,monitorSeq=0;
const embedded=window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1';
let hostVisible=!embedded;
function notifyHost(type,fields={}){if(embedded)window.parent.postMessage({type,...fields},location.origin);}
if(embedded){
  document.documentElement.dataset.embedded='true';
  // Explicit local control links leave the frame, rather than nesting a second cockpit.
  for(const link of document.querySelectorAll('a[href="/"]'))link.target='_top';
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='idleproof:atlas-host-visibility'||typeof event.data.visible!=='boolean')return;
    hostVisible=event.data.visible;
    if(!hostVisible)stopMonitor();else requestAnimationFrame(()=>cy?.resize());
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))notifyHost('idleproof:atlas-close');});
}
const status=(text,error=false)=>{$('notice').textContent=text;$('notice').classList.toggle('error',error);};
const uid=()=> 'user_'+crypto.randomUUID().replaceAll('-','');
function params(extra={}) {return new URLSearchParams({source:$('source').value,view:$('view').value,query:$('query').value.trim(),offset:String(offset),focus,...extra});}
async function request(q,body,signal) {
  const r=await fetch('/api/atlas?'+q,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal});
  const v=await r.json();if(!r.ok)throw new Error(v.error||`HTTP ${r.status}`);return v;
}
function setDirty(value=true){dirty=value;notifyHost('idleproof:atlas-dirty',{dirty});$('save').disabled=!dirty||loading;$('discard').disabled=!dirty||loading;}
function busy(value){loading=value;for(const id of ['addNode','addEdge','layout','alias','note'])$(id).disabled=value;for(const b of $('annotation').querySelectorAll('button'))b.disabled=value;if(cy){if(value)cy.nodes().lock();else cy.nodes().unlock();}setDirty(dirty);}
function mayNavigate(){if(loading){status('A local operation is in progress. No additional change was sent.');return false;}if(dirty){status('Save or discard the current view edits before changing the capture or filter.',true);return false;}return true;}
function css(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}
function style() {return [
  {selector:'node',style:{'background-color':css('--panel'),'border-color':css('--observed'),'border-width':1.8,'color':css('--ink'),'label':'data(label)','font-size':12,'text-wrap':'wrap','text-max-width':180,'text-valign':'center','shape':'round-rectangle','width':200,'height':70,'padding':8}},
  {selector:'node[kind="class"],node[kind="interface"],node[kind="struct"]',style:{'shape':'rectangle','height':105,'text-max-width':175}},
  {selector:'node[origin="user-model"]',style:{'border-style':'dashed','border-color':css('--accent'),'background-color':css('--wash')}},
  {selector:'node[kind="unresolved"]',style:{'shape':'diamond','border-color':css('--unknown'),'border-style':'dashed','width':150,'height':80,'text-max-width':120}},
  {selector:'edge',style:{'width':1.2,'line-color':css('--muted'),'target-arrow-color':css('--muted'),'target-arrow-shape':'triangle','arrow-scale':.8,'curve-style':'bezier','line-style':'dashed','label':'data(label)','font-size':9,'color':css('--muted'),'text-background-color':css('--panel'),'text-background-opacity':.9,'text-background-padding':2,'text-rotation':'autorotate'}},
  {selector:'edge[origin="user-model"]',style:{'line-color':css('--accent'),'target-arrow-color':css('--accent'),'color':css('--accent')}},
  {selector:'edge[kind="generalization"],edge[kind="realization"]',style:{'target-arrow-shape':'triangle','target-arrow-fill':'hollow'}},
  {selector:'edge[kind="association"],edge[kind="generalization"]',style:{'line-style':'solid'}},
  {selector:'edge[kind="contains"]',style:{'line-style':'solid','line-color':css('--line'),'label':'declares'}},
  {selector:':selected',style:{'border-width':3,'border-color':css('--accent'),'line-color':css('--accent'),'target-arrow-color':css('--accent')}}
];}
function displayNodes(){
  if(!data||!overlay)return [];
  const manual=new Map(overlay.nodes.map(n=>[n.id,{...n,origin:'user-model',authority:'DECLARED',source:null}]));
  const aliases=new Map(overlay.aliases.map(a=>[a.id,a.label])),positions=new Map(overlay.positions.map(p=>[p.id,p])),hidden=new Set(overlay.hidden);
  const nodes=data.nodes.filter(n=>n.origin!=='user-model').map(n=>({...n}));
  // Manual elements are admitted to the active view only; the full editable model persists.
  const view=$('view').value;for(const n of manual.values())if(view==='all'||(view==='classes'?['class','interface'].includes(n.kind):['component','module','note'].includes(n.kind)))nodes.push(n);
  const unique=new Map(nodes.map(n=>[n.id,n]));
  return [...unique.values()].filter(n=>!hidden.has(n.id)).slice(0,400).map(n=>({...n,displayLabel:aliases.get(n.id)||n.label,position:positions.get(n.id)||n.position}));
}
function displayEdges(nodes){const ids=new Set(nodes.map(n=>n.id));return [...data.edges.filter(e=>e.origin!=='user-model'),...overlay.edges.map(e=>({...e,origin:'user-model',authority:'DECLARED',source:null}))].filter(e=>ids.has(e.from)&&ids.has(e.to)).slice(0,1300);}
function redraw({fit=true}={}) {
  if(!data||data.status!=='READY')return;
  const nodes=displayNodes(),edges=displayEdges(nodes),elements=[],columns=$('canvas').clientWidth<600?1:4;
  nodes.forEach((n,i)=>{
    const members=(n.members||[]).slice(0,3).map(m=>typeof m==='string'?m:m.name.split('.').at(-1));
    const label=`${n.kind==='module'?'«module»':n.origin==='user-model'?'«declared '+n.kind+'»':'«'+n.kind+'»'}\n${n.displayLabel}${members.length?'\n──────────\n'+members.join('\n'):''}`;
    elements.push({group:'nodes',data:{...n,label},position:n.position||{x:150+(i%columns)*285,y:100+Math.floor(i/columns)*175}});
  });
  for(const e of edges)elements.push({group:'edges',data:{...e,source:e.from,target:e.to,label:(e.origin==='user-model'?'declared · ':'')+(e.label||e.kind),provenance:e.source}});
  const camera=cy?{zoom:cy.zoom(),pan:{...cy.pan()}}:null;
  if(cy)cy.destroy();
  cy=window.cytoscape({container:$('canvas'),elements,style:style(),layout:{name:'preset',fit},minZoom:.12,maxZoom:2.5,boxSelectionEnabled:false,pixelRatio:Math.min(window.devicePixelRatio||1,2)});
  cy.on('tap','node,edge',event=>inspect(event.target.id(),nodes,edges));
  cy.on('dragfree','node',event=>{const n=event.target,p=n.position();setEntry('positions',{id:n.id(),x:Math.round(p.x),y:Math.round(p.y)});setDirty();});
  if(fit)cy.fit(undefined,40);else if(camera)cy.viewport(camera);
  $('elementList').replaceChildren();
  for(const n of nodes){const b=element('button',`${n.kind} · ${n.displayLabel} · ${n.authority}`);b.type='button';b.dataset.node=n.id;b.onclick=()=>{cy.$id(n.id).select();inspect(n.id,nodes,edges);$('selectedTitle').scrollIntoView({block:'nearest'});};$('elementList').append(b);}
  for(const e of edges){const b=element('button',`${e.kind} · ${e.authority}`);b.type='button';b.dataset.edge=e.id;b.onclick=()=>inspect(e.id,nodes,edges);$('elementList').append(b);}
  if(selected){const n=nodes.find(n=>n.id===selected.id)||edges.find(n=>n.id===selected.id);if(n)inspect(n.id,nodes,edges);else clearInspector();}
  $('coverage').textContent=`${nodes.length} nodes shown · ${data.projection.matchedNodes} matched at load · ${overlay.hidden.length} hidden by you · ${data.projection.boundaryRelations} relations cross this view. ${data.projection.hasMore?'More nodes available.':''}`;
}
function clearInspector(){selected=null;$('selectedTitle').textContent='Select an element';$('details').textContent='The source-bound graph and user model remain separate.';$('authority').replaceChildren();$('nodeActions').hidden=true;$('annotation').hidden=true;$('sourceCode').hidden=true;}
function inspect(id,nodes=displayNodes(),edges=displayEdges(nodes)){
  sourceSeq++;$('sourceCode').hidden=true;const item=nodes.find(n=>n.id===id)||edges.find(e=>e.id===id);if(!item)return;
  const edge=Boolean(item.from);selected={...item,edge};$('selectedTitle').textContent=edge?(item.label||item.kind):item.displayLabel;
  const badge=element('span',`${item.authority} · ${item.origin==='user-model'?'user model':edge?'static relation':'captured definition'}`);badge.className='authority '+(item.origin==='user-model'?'declared':item.authority==='UNKNOWN'?'unknown':'');$('authority').replaceChildren(badge);
  const dl=element('dl');const row=(k,v)=>{dl.append(element('dt',k),element('dd',v));};
  if(item.origin!=='user-model'&&item.displayLabel&&item.displayLabel!==item.label)row('Display label',`User alias; captured name: ${item.label}`);
  row('Kind',item.symbolKind||item.kind);if(item.origin==='user-model')row('Basis','Declared by you. Does not establish current implementation.');
  if(item.path)row('Captured path',item.path);if(item.source){row('Source location',item.source.locationScope==='file-anchor'?'Captured file; exact syntax line not supplied':`${item.source.line}–${item.source.endLine}`);row('Snapshot',item.source.snapshotId);row('Content hash',item.source.sourceSha256);}
  if(edge){row('From',nodes.find(n=>n.id===item.from)?.displayLabel||item.from);row('To',nodes.find(n=>n.id===item.to)?.displayLabel||item.to);row('Meaning',item.origin==='user-model'?'User-authored relationship, not execution evidence.':item.kind==='contains'?'Lexical declaration, not UML ownership.':'Static relation. Neither execution nor reachability is established.');}
  if(item.members?.length)row('Members',item.members.map(m=>typeof m==='string'?m:m.name).join('\n'));
  $('details').replaceChildren(dl);$('nodeActions').hidden=false;$('focus').disabled=edge||item.origin==='user-model';$('openSource').disabled=!item.source||edge;$('hideNode').disabled=edge;
  $('deleteUser').hidden=item.origin!=='user-model';$('annotation').hidden=edge;
  $('alias').value=overlay.aliases.find(a=>a.id===id)?.label||'';$('note').value=overlay.notes.find(a=>a.id===id)?.text||'';
  if(item.origin==='user-model'){const b=element('button','Edit user '+(edge?'relation':'element'));b.type='button';b.onclick=()=>openEditor(edge?'edge':'node',id);$('details').append(b);}
}
function setEntry(name,value){const i=overlay[name].findIndex(x=>x.id===value.id);if(i<0)overlay[name].push(value);else overlay[name][i]=value;}
async function load() {
  if(!mayNavigate())return;const my=++sequence;controller?.abort();controller=new AbortController();busy(true);status('Reading existing captured structure. No scan or provider call.');
  try {
    const next=await request(params(),null,controller.signal);if(my!==sequence)return;data=next;
    if(data.status!=='READY'){cy?.destroy();cy=null;overlay=null;clearInspector();$('elementList').replaceChildren();$('identity').textContent='No snapshot loaded for this source.';$('coverage').textContent='No graph available.';status(data.message||'No captured project available. Create an explicit scan from Local.',true);return;}
    overlay=copy(data.overlay);setDirty(false);clearInspector();redraw();
    $('identity').textContent=`${data.identity.profile?.syntheticFixture?'SYNTHETIC DEMO — not your repository\n':''}${data.identity.source} · ${data.identity.snapshotId.slice(0,22)}…\n${data.freshness.status} · captured ${data.identity.capturedAt||'date unavailable'}`;
    const cov=data.coverage;
    $('limits').textContent=`${cov.scan.read??'Unknown'} files read by the scan · ${cov.unparsedFiles} captured but unparsed · ${cov.unresolvedImports} unresolved imports · ${cov.ambiguousImports} ambiguous imports · ${cov.unresolvedCalls} call sites with unresolved targets. ${cov.nodeOverflow||cov.edgeOverflow?'Projection capacity was exceeded.':''}`;
    $('unresolved').replaceChildren(...data.unresolved.map(c=>element('p',`${c.source.path}:${c.source.line} · ${c.name} · target not resolved`)));
    $('revision').textContent=`User revision ${data.sequence} · ${data.revision?data.revision.slice(0,16)+'…':'nothing saved'}`;
    $('previous').disabled=offset===0;$('next').disabled=!data.projection.hasMore;
    status((data.identity.profile?.syntheticFixture?'SYNTHETIC DEMO — not an analysis of your repository. ':'')+'Static capture loaded. Drag or annotate nodes; save explicitly. User relations never become extracted facts.');
  }catch(e){if(my===sequence&&e.name!=='AbortError')status(e.message,true);}
  finally{if(my===sequence)busy(false);}
}
$('annotation').onsubmit=event=>{event.preventDefault();if(loading||!selected||selected.edge)return;for(const [name,key,field] of [['aliases','label','alias'],['notes','text','note']]){const v=$(field).value.trim();overlay[name]=overlay[name].filter(x=>x.id!==selected.id);if(v)overlay[name].push({id:selected.id,[key]:v});}setDirty();redraw({fit:false});status('Annotation prepared. Save view to persist; source identity is unchanged.');};
$('save').onclick=async()=>{
  if(!dirty||loading||!data)return;busy(true);
  try{const r=await request(params(),{action:'save',source:data.identity.source,snapshotId:data.identity.snapshotId,graphDigest:data.graphDigest,expectedRevision:data.revision,overlay});data.revision=r.revision;data.sequence=r.sequence;overlay=copy(r.overlay);data.overlay=copy(r.overlay);setDirty(false);$('revision').textContent=`User revision ${r.sequence} · ${r.revision.slice(0,16)}…`;status('User model saved locally. Extracted code, Proof, debt and policy were not changed.');}
  catch(e){status(e.message==='ATLAS_CONFLICT'?'A newer revision exists. Your edits are retained here; export or discard them before reloading.':e.message==='ATLAS_STALE'?'The captured structure changed. Your unsaved edits remain here; they were not applied to the new snapshot.':e.message,true);}
  finally{busy(false);}
};
$('discard').onclick=()=>{if(loading||!data||!overlay)return;overlay=copy(data.overlay);setDirty(false);redraw();status('Unsaved view edits discarded. Source facts and saved history are unchanged.');};
$('fit').onclick=()=>cy?.fit(undefined,35);
$('layout').onclick=()=>{if(loading||!cy)return;cy.layout({name:'breadthfirst',directed:true,padding:45,spacingFactor:1.35,animate:false}).run();for(const n of cy.nodes()){const p=n.position();setEntry('positions',{id:n.id(),x:Math.round(p.x),y:Math.round(p.y)});}setDirty();};
$('reload').onclick=()=>load();$('search').onclick=()=>{if(mayNavigate()){offset=0;load();}};
$('query').onkeydown=e=>{if(e.key==='Enter')$('search').click();};
for(const id of ['source','view'])$(id).onchange=()=>{if(mayNavigate()){offset=0;focus='';load();}else if(data)$(id).value=id==='source'?data.identity.source:data.projection.view;};
$('previous').onclick=()=>{if(mayNavigate()){offset=Math.max(0,offset-200);load();}};$('next').onclick=()=>{if(mayNavigate()){offset+=200;load();}};
$('whole').onclick=()=>{if(mayNavigate()){focus='';offset=0;load();}};
$('focus').onclick=()=>{if(selected&&!selected.edge&&mayNavigate()){focus=selected.id;offset=0;$('view').value='all';load();}};
$('hideNode').onclick=()=>{if(loading||!selected||selected.edge)return;if(!overlay.hidden.includes(selected.id))overlay.hidden.push(selected.id);setDirty();clearInspector();redraw();};
$('showHidden').onclick=()=>{if(loading||!overlay||!overlay.hidden.length)return;overlay.hidden=[];setDirty();redraw();status('Hidden elements restored in the current loaded projection. Save, then reload to include elements outside this page.');};
$('openSource').onclick=async()=>{
  if(!selected?.source||selected.edge)return;const my=++sourceSeq,node=selected.id;$('sourceCode').hidden=false;$('sourceCode').textContent='Reading captured source…';
  try{const r=await request(params({action:'source',node,snapshot:data.identity.snapshotId}));if(my!==sourceSeq)return;$('sourceCode').textContent=r.lines.map(l=>`${l.line}: ${l.text}${l.truncated?' [truncated]':''}`).join('\n');}
  catch(e){if(my===sourceSeq)$('sourceCode').textContent='Source unavailable: '+e.message;}
};
function openEditor(mode,id=null) {
  if(loading||!overlay)return;editMode=mode;editId=id;$('editorError').textContent='';$('nodeFields').hidden=mode!=='node';$('edgeFields').hidden=mode!=='edge';$('editorTitle').textContent=(id?'Edit':'Add')+' user '+(mode==='node'?'element':'relation');
  if(mode==='node'){const n=overlay.nodes.find(n=>n.id===id);$('newKind').value=n?.kind||'component';$('newLabel').value=n?.label||'';$('newMembers').value=(n?.members||[]).join('\n');}
  else{const nodes=displayNodes();for(const field of ['edgeFrom','edgeTo'])$(field).replaceChildren(...nodes.map(n=>{const option=element('option',n.displayLabel);option.value=n.id;return option;}));const e=overlay.edges.find(e=>e.id===id);if(e){$('edgeFrom').value=e.from;$('edgeTo').value=e.to;}$('edgeKind').value=e?.kind||'dependency';$('edgeLabel').value=e?.label||'';}
  $('editor').showModal();$(mode==='node'?'newLabel':'edgeFrom').focus();
}
$('addNode').onclick=()=>openEditor('node');$('addEdge').onclick=()=>openEditor('edge');$('closeEditor').onclick=()=>$('editor').close();
$('editorForm').onsubmit=e=>{
  e.preventDefault();if(loading||!overlay)return;if(editMode==='node'){const label=$('newLabel').value.trim(),members=$('newMembers').value.split('\n').map(s=>s.trim()).filter(Boolean);if(!label||members.length>24||members.some(m=>m.length>160)){return $('editorError').textContent='Enter a label and at most 24 member lines, each at most 160 characters.';}const n={id:editId||uid(),kind:$('newKind').value,label,members};const i=overlay.nodes.findIndex(x=>x.id===n.id);if(i<0)overlay.nodes.push(n);else overlay.nodes[i]=n;}
  else{const from=$('edgeFrom').value,to=$('edgeTo').value,kind=$('edgeKind').value;if(!from||!to||(from===to&&['generalization','realization'].includes(kind)))return $('editorError').textContent='Choose valid endpoints; inheritance cannot target itself.';const rel={id:editId||uid(),from,to,kind,label:$('edgeLabel').value.trim()};const i=overlay.edges.findIndex(x=>x.id===rel.id);if(i<0)overlay.edges.push(rel);else overlay.edges[i]=rel;}
  setDirty();$('editor').close();redraw();status('User-declared model changed. Save explicitly; no source or policy change.');
};
$('deleteUser').onclick=()=>{if(loading||selected?.origin!=='user-model')return;const id=selected.id;if(selected.edge)overlay.edges=overlay.edges.filter(e=>e.id!==id);else{overlay.nodes=overlay.nodes.filter(n=>n.id!==id);overlay.edges=overlay.edges.filter(e=>e.from!==id&&e.to!==id);for(const key of ['notes','aliases','positions'])overlay[key]=overlay[key].filter(v=>v.id!==id);overlay.hidden=overlay.hidden.filter(v=>v!==id);}clearInspector();setDirty();redraw();};
$('history').onclick=async()=>{
  if(!data)return;$('historyRows').textContent='Reading local revisions…';$('historyDialog').showModal();
  try{const h=await request(params({action:'history'}));$('historyRows').replaceChildren();if(!h.revisions.length)$('historyRows').textContent='No saved user-model revision yet.';for(const r of h.revisions){const b=element('button',`Revision ${r.sequence} · ${r.createdAt} · ${r.revision.slice(0,12)}`);b.onclick=async()=>{if(!mayNavigate())return;try{const value=await request(params({action:'revision',revision:r.revision}));overlay=copy(value.overlay);setDirty();redraw();$('historyDialog').close();status('Historical user model prepared. Save to append a new revision, or discard.');}catch(e){status(e.message,true);}};$('historyRows').append(b);}if(h.hasEarlier)$('historyRows').append(element('p','Only the latest 20 revisions are listed; earlier files remain retained locally.'));}
  catch(e){$('historyRows').textContent=e.message;}
};
$('closeHistory').onclick=()=>$('historyDialog').close();
function download(name,text,type){const blob=new Blob([text],{type}),u=URL.createObjectURL(blob),a=element('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('jsonExport').onclick=async()=>{if(!data)return;try{const r=await request(params({action:'export',format:'json'}));r.unsavedUserModel=dirty?overlay:null;download('idleproof-atlas.json',JSON.stringify(r,null,2),'application/json');status('Exported private local snapshot. Sharing this file may disclose paths, symbols and your notes.');}catch(e){status(e.message,true);}};
$('umlExport').onclick=async()=>{if(!mayNavigate())return;try{const r=await request(params({action:'export',format:'mermaid'}));download('idleproof-atlas.mmd',r.text,'text/plain');}catch(e){status(e.message,true);}};
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';if(cy)cy.style(style());};
async function observe(){
  if(!monitoring||!hostVisible||document.hidden||!$('monitorPanel').open)return;const my=monitorSeq;
  try{const r=await fetch('/api/state'),state=await r.json();if(my!==monitorSeq||!monitoring||!hostVisible)return;const control=state.controlPlane||{},events=control.recentEvents||[];
    $('activity').replaceChildren(element('p',`Latest task: ${state.session?.task?.anchor||state.session?.task?.title||'No observed task'} · trace ${control.provenance?.valid?'valid':'unavailable / invalid'}`));
    for(const v of events.slice(-6).reverse()){const p=v.event?.policy,decision={allow:'ALLOW',ask:'REVIEW',deny:'BLOCK'}[p?.decision]||'OBSERVED';$('activity').append(element('p',`${decision} · ${v.event?.eventType||v.event?.hook_event_name||v.event?.type||'event'} · ${v.event?.tool_name||v.event?.tool||''} · ${p?.reason||'No policy decision on this event.'}`));}
  }catch(e){if(my===monitorSeq)$('activity').textContent='Local activity unavailable.';}
  finally{if(my===monitorSeq&&monitoring&&hostVisible&&!document.hidden&&$('monitorPanel').open)monitorTimer=setTimeout(observe,2500);}
}
function stopMonitor(){monitoring=false;monitorSeq++;clearTimeout(monitorTimer);$('monitor').textContent='Start observing';}
$('monitor').onclick=()=>{if(!hostVisible)return;if(monitoring)return stopMonitor();monitoring=true;monitorSeq++;$('monitor').textContent='Stop observing';observe();};
$('monitorPanel').ontoggle=()=>{if(!$('monitorPanel').open)stopMonitor();};document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMonitor();});
$('assurance').onclick=async()=>{const button=$('assurance');button.disabled=true;$('obligations').textContent='Reading existing Core context…';try{const r=await request(params({action:'assurance'}));$('obligations').textContent=JSON.stringify(r,null,2);}catch(e){$('obligations').textContent='Core context unavailable: '+e.message;}finally{button.disabled=false;}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{stopMonitor();controller?.abort();cy?.destroy();});
if(matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.dataset.theme='dark';
// Script defer/module ordering does not imply provider or model initialization.
// Atlas is a zoomable *overview*: a large repository may start at minZoom=.12.
// Cytoscape's generic mousewheel normalization plus the previous .2 sensitivity
// made several ordinary notches barely move the camera. Normalize both discrete
// mouse notches and fine-grained trackpads here, before Cytoscape registers its
// own wheel listener; never double-apply a gesture or change user-model data.
function zoomAtPointer(event) {
  if(!cy||!event.cancelable||event.ctrlKey||event.metaKey)return; // browser pinch/shortcuts
  const raw=event.deltaY;
  if(!Number.isFinite(raw)||raw===0)return;
  const delta=event.deltaMode===0?raw:Math.sign(raw)*100; // line/page wheel: one notch
  const steps=Math.max(-1,Math.min(1,delta/100)); // cap spikes; preserve smooth trackpad increments
  const next=Math.min(cy.maxZoom(),Math.max(cy.minZoom(),cy.zoom()*Math.pow(2.6,-steps)));
  // The zoom anchor is the pointer, not the centre of a potentially huge graph.
  const rect=$('canvas').getBoundingClientRect();
  event.preventDefault();event.stopImmediatePropagation();
  if(next!==cy.zoom())cy.zoom({level:next,renderedPosition:{x:event.clientX-rect.left,y:event.clientY-rect.top}});
}
// Register once, before load() constructs Cytoscape and its default wheel listener.
$('canvas').addEventListener('wheel',zoomAtPointer,{capture:true,passive:false});
if(typeof window.cytoscape!=='function')status('Local graph runtime unavailable. The existing Local cockpit is unaffected.',true);else load();

notifyHost('idleproof:atlas-ready');
