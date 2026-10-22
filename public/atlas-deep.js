// Read-only experimental views. Only the explicit Analyze button starts analysis.
const $=id=>document.getElementById(id);
const element=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);return el;};
const ARRAY=v=>Array.isArray(v)?v:[];
let state=null,graph=null,cy=null,selected=null,focus='',offset=0,operation=0,sourceOperation=0,busy=false,pollTimer=null,graphController=null,runtimeExample=null,runtimeBusy=false;
const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').classList.toggle('error',error);};
const params=extra=>new URLSearchParams({source:$('source').value,...extra});
async function request(extra={},body=null,signal){
  const response=await fetch('/api/atlas-deep?'+params(extra),{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal});
  const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;
}
function controls(){
  const running=state?.status==='RUNNING';
  $('analyze').disabled=busy||running||!state?.identity?.snapshotId||$('source').value!=='HEAD';
  $('cancel').disabled=busy||!running;$('source').disabled=busy||running;$('reload').disabled=busy;
}
function identity(data){
  const id=data?.identity;
  $('identity').textContent=id?`${id.syntheticFixture||id.captureProfile?.syntheticFixture?'SYNTHETIC FIXTURE — not your repository\n':''}${id.source||$('source').value} · ${id.snapshotId}\nTree ${id.tree||'not available'}`:'No captured snapshot available.';
}
function clearInspector(){
  selected=null;sourceOperation++;$('selectedTitle').textContent='Select a function';$('authority').replaceChildren();$('details').textContent='Inspect the exact source and method of a function, call site or relation.';
  $('nodeActions').hidden=true;$('connections').hidden=true;$('sourceCode').hidden=true;
}
function clearGraph(){
  graph=null;cy?.destroy();cy=null;clearInspector();$('elementList').replaceChildren();$('callSites').replaceChildren();$('callSummary').textContent='No call sites loaded.';
  $('coverage').textContent='No analysis loaded.';$('previous').disabled=true;$('next').disabled=true;$('limitations').replaceChildren();$('capabilities').textContent='No analysis loaded.';
  $('runtimeEvents').replaceChildren();$('reconciliation').hidden=true;$('runtimeView').hidden=true;$('canvas').hidden=false;
}
function schedule(){
  clearTimeout(pollTimer);pollTimer=null;
  if(state?.status==='RUNNING'&&!document.hidden)pollTimer=setTimeout(()=>refresh(false),800);
}
function describeState(data){
  state=data;identity(data);controls();
  $('job').textContent=data.job?`Analysis ${data.job.status||data.status}${data.job.stale?' · capture changed; this job belongs to an earlier identity':''}${data.job.startedAt?' · started '+data.job.startedAt:''}`:'';
  const text={IDLE:'Ready to analyze this captured snapshot. Analysis starts only when you choose Analyze captured source.',RUNNING:'Static analysis is running. You can stop it; the original Module atlas remains available.',READY:'Captured analysis is available. Static relations do not establish runtime execution.',CANCELLED:'Analysis stopped. No project code was executed.',FAILED:'Analysis failed. The original Module atlas and saved annotations remain available.',NO_SCAN:'No captured snapshot available. Create an explicit scan in Local first.'}[data.status]||'Analysis status unavailable.';
  notice(data.error?`${text} ${data.error}`:data.message||text,data.status==='FAILED');
  if(data.support==='WORKTREE_UNSUPPORTED')notice('Deep analysis currently supports committed snapshots only. Working-tree Atlas V1 remains available.');
  schedule();
}
async function refresh(load=true){
  const seq=++operation;try{
    const next=await request({action:'status'});if(seq!==operation)return;
    const changed=state?.identity?.snapshotId!==next.identity?.snapshotId,wasRunning=state?.status==='RUNNING';
    describeState(next);if(changed||next.status==='NO_SCAN')clearGraph();
    if(next.status==='READY'&&(load||wasRunning||!graph))await loadGraph();
  }catch(error){if(seq===operation){notice(error.message,true);clearTimeout(pollTimer);}}
}
async function action(name){
  if(busy||!state?.identity?.snapshotId)return;busy=true;controls();const seq=++operation;clearTimeout(pollTimer);
  try{
    const next=await request({}, {action:name,source:$('source').value,snapshotId:state.identity.snapshotId,...(name==='cancel'&&state.job?.id?{jobId:state.job.id}:{})});
    if(seq!==operation)return;describeState(next);if(next.status==='READY')await loadGraph();
  }catch(error){if(seq===operation)notice(error.message,true);}finally{if(seq===operation){busy=false;controls();schedule();}}
}
const CSS=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function graphStyle(){return [
  {selector:'node',style:{'background-color':CSS('--panel'),'border-color':CSS('--observed'),'border-width':1.7,'color':CSS('--ink'),'label':'data(label)','font-size':11,'text-wrap':'wrap','text-max-width':170,'text-valign':'center','shape':'round-rectangle','width':190,'height':65,'padding':8}},
  {selector:'node[kind="callsite"],node[kind="call_site"],node[kind="call-site"]',style:{'shape':'diamond','width':165,'height':65,'border-color':CSS('--unknown')}},
  {selector:'node[kind="condition"]',style:{'shape':'diamond','border-color':CSS('--accent')}},
  {selector:'edge',style:{'width':1.3,'line-color':CSS('--muted'),'target-arrow-color':CSS('--muted'),'target-arrow-shape':'triangle','curve-style':'bezier','line-style':'dashed','label':'data(label)','font-size':9,'color':CSS('--muted'),'text-background-color':CSS('--panel'),'text-background-opacity':.95,'text-background-padding':2,'text-rotation':'autorotate'}},
  {selector:'edge[kind="CALLS"]',style:{'line-style':'solid','line-color':CSS('--accent'),'target-arrow-color':CSS('--accent')}},
  {selector:'edge[kind="MAY_CALL"]',style:{'line-style':'dashed','line-color':CSS('--unknown'),'target-arrow-color':CSS('--unknown')}},
  {selector:':selected',style:{'border-width':3,'border-color':CSS('--accent'),'line-color':CSS('--accent'),'target-arrow-color':CSS('--accent')}}
];}
const name=id=>graph?.nodes.find(n=>n.id===id)?.qualifiedName||graph?.nodes.find(n=>n.id===id)?.label||id;
function draw({fit=true}={}){
  if(!graph)return;
  const runtime=['runtime','sequence'].includes($('view').value);$('canvas').hidden=runtime;$('runtimeView').hidden=!runtime;
  if(runtime){cy?.destroy();cy=null;renderRuntime();return;}
  const nodes=ARRAY(graph.nodes),edges=ARRAY(graph.edges),columns=$('canvas').clientWidth<600?1:4,elements=[];
  for(let i=0;i<nodes.length;i++){const node=nodes[i];elements.push({group:'nodes',data:{...node,label:`«${node.kind}»\n${node.label||node.qualifiedName||node.id}`},position:{x:135+(i%columns)*260,y:90+Math.floor(i/columns)*150}});}
  for(const edge of edges)elements.push({group:'edges',data:{...edge,source:edge.from,target:edge.to,label:edge.kind+(edge.branch?' · '+edge.branch:'')}});
  const camera=cy?{zoom:cy.zoom(),pan:{...cy.pan()}}:null;cy?.destroy();
  cy=window.cytoscape({container:$('canvas'),elements,style:graphStyle(),layout:{name:'preset',fit},minZoom:.12,maxZoom:2.5,boxSelectionEnabled:false,pixelRatio:Math.min(window.devicePixelRatio||1,2)});
  cy.on('tap','node,edge',event=>inspect(event.target.id()));if(fit)cy.fit(undefined,40);else if(camera)cy.viewport(camera);
}
function renderRuntime(){
  const runtime=graph?.runtime||state?.runtime||{},sessions=ARRAY(runtime.sessions);
  $('runtimeTitle').textContent=$('view').value==='sequence'?'Observed sequence':'Runtime observations';
  $('runtimeStatus').textContent=runtime.reason||(!sessions.length?'No qualified runtime observation is attached to this capture.':'Events belong to the identified sessions below; they do not establish every possible execution.');
  $('runtimeEvents').replaceChildren();$('reconciliation').hidden=true;
  if(runtimeExample?.status==='READY'&&runtimeExample.syntheticFixture===true&&runtimeExample.trace?.syntheticFixture===true&&runtimeExample.trace?.kind==='OBSERVED_RUNTIME'){
    const trace=runtimeExample.trace,id=trace.identity,exampleId=runtimeExample.graph?.identity;
    if(id?.snapshotId!==exampleId?.snapshotId||id?.repositoryId!==exampleId?.repositoryId||id?.tree!==exampleId?.tree){$('runtimeDemoStatus').textContent='Synthetic example identity mismatch. Observation withheld.';return;}
    $('runtimeDemoStatus').textContent=`SYNTHETIC FIXTURE · ${trace.sessionId} · ${trace.status} · ${trace.events.length} observed events. This is not an execution of the captured repository.`;
    for(const event of trace.events.slice(0,200))$('runtimeEvents').append(element('li',`${event.sequence} · ${event.event} · ${event.function?.qualifiedName||'?'} · ${event.function?.path||'?'}:${event.function?.line||'?'}${event.caller?' · caller '+event.caller.qualifiedName:''}${event.durationNs!==undefined?' · '+(event.durationNs/1e6).toFixed(3)+' ms':''}`));
    $('reconciliation').hidden=false;$('reconciliation').textContent=JSON.stringify({syntheticFixture:true,identity:trace.identity,sessionId:trace.sessionId,proof:'UNKNOWN',coverage:trace.coverage,reconciliation:runtimeExample.reconciliation,limitations:trace.limitations},null,2);
    return;
  }
  for(const session of sessions){
    const item=element('li');item.append(element('strong',`Session ${session.id||session.sessionId||'unidentified'} · ${session.status||'UNKNOWN'}`));
    // A session with mismatching identity is never rendered as observed here.
    const id=session.identity||session;
    if(id.snapshotId!==graph.identity.snapshotId||id.tree!==graph.identity.tree){item.append(element('p','STALE / identity not matched. Events withheld.'));$('runtimeEvents').append(item);continue;}
    const events=ARRAY(session.events),list=element('ol');
    for(const event of events.slice(0,200))list.append(element('li',`${event.sequence??event.index??'?'} · ${event.kind||event.type||'event'} · ${event.path||event.source?.path||''}:${event.line||event.source?.line||'?'} · ${event.functionName||event.function||event.targetId||''}`));
    item.append(list,element('p',`${Math.min(events.length,200)} of ${events.length} retained events shown. Values and secrets are not displayed.`));$('runtimeEvents').append(item);
  }
}
async function runRuntimeExample(){
  if(runtimeBusy||!state?.identity?.snapshotId)return;runtimeBusy=true;$('runtimeDemo').disabled=true;$('runtimeDemoStatus').textContent='Checking isolation for the built-in synthetic example. Your repository is not executed.';
  try{
    const result=await request({}, {action:'runtime-demo',source:$('source').value,snapshotId:state.identity.snapshotId});runtimeExample=result;
    if(result.status==='READY')renderRuntime();
    else {$('runtimeDemoStatus').textContent=`${result.status||'UNAVAILABLE'} · ${result.reason||result.error||'No admissible runtime observation.'} · ${result.executed===false?'Nothing was executed.':'No complete observation is claimed.'}`;$('runtimeEvents').replaceChildren();$('reconciliation').hidden=true;}
  }catch(error){$('runtimeDemoStatus').textContent=error.message;}finally{runtimeBusy=false;$('runtimeDemo').disabled=false;}
}
function row(dl,key,value){if(value===undefined||value===null||value==='')return;dl.append(element('dt',key),element('dd',typeof value==='string'?value:JSON.stringify(value)));}
function inspect(id){
  if(!graph)return;const node=graph.nodes.find(n=>n.id===id),edge=graph.edges.find(e=>e.id===id),call=graph.callSites.find(c=>c.id===id),item=node||edge||call;if(!item)return;
  sourceOperation++;selected={...item,edge:Boolean(edge),call};$('sourceCode').hidden=true;$('nodeActions').hidden=false;
  $('selectedTitle').textContent=edge?`${edge.kind} · ${name(edge.from)} → ${name(edge.to)}`:item.qualifiedName||item.label||call?.expression||item.id;
  const authority=element('span',`${item.authority||'UNKNOWN'} · ${edge?'static relation':call?'call syntax':'source observation'}`);authority.className='authority '+(item.authority==='INFERRED'?'inferred':['POSSIBLE','UNKNOWN'].includes(item.authority)?'possible':'');$('authority').replaceChildren(authority);
  const dl=element('dl');row(dl,'Kind',item.kind||'callsite');row(dl,'Source path',item.source?.path);row(dl,'Source span',item.source?`${item.source.line}–${item.source.endLine??item.source.line}${item.source.column!==undefined?' · column '+item.source.column:''}`:null);row(dl,'Snapshot',item.source?.snapshotId);row(dl,'Content hash',item.source?.sourceSha256);row(dl,'Provider',item.source?.provider);row(dl,'Provider version',item.source?.providerVersion);row(dl,'Resolution method',item.resolution);row(dl,'Limitations',item.limitations);
  if(edge){row(dl,'From',name(edge.from));row(dl,'To',name(edge.to));row(dl,'Authority',edge.authority);row(dl,'Call site',edge.callSiteId);row(dl,'Branch',edge.branch);row(dl,'Meaning',edge.kind==='CALLS'?'Target resolved under the stated static contract. Execution and reachability are not established.':edge.kind==='MAY_CALL'?'Possible target; not a uniquely established call.':'Source-derived relation within the provider contract. Not runtime execution.');}
  if(call){row(dl,'Call expression',call.expression);row(dl,'Target status',call.status);row(dl,'Resolution basis',call.reason);row(dl,'Targets',call.targetIds.map(name).join(', ')||'Not established');}
  $('details').replaceChildren(dl);$('focus').disabled=Boolean(edge)||!node;$('openSource').disabled=!item.source;
  $('connections').hidden=Boolean(edge)||!node;
  if(node){renderConnections(node);}
  cy?.$id(id).select();
}
function linkButton(label,id){const button=element('button',label);button.type='button';button.onclick=()=>{inspect(id);$('selectedTitle').scrollIntoView({block:'nearest'});};return button;}
function renderConnections(node){
  const incoming=graph.edges.filter(e=>['CALLS','MAY_CALL'].includes(e.kind)&&e.to===node.id),outgoing=graph.edges.filter(e=>['CALLS','MAY_CALL'].includes(e.kind)&&e.from===node.id);
  $('incoming').replaceChildren(...incoming.map(e=>linkButton(`${e.kind} · ${name(e.from)} · ${e.authority}`,e.id)));if(!incoming.length)$('incoming').textContent='None shown in this projection.';
  $('outgoing').replaceChildren(...outgoing.map(e=>linkButton(`${e.kind} · ${name(e.to)} · ${e.authority}`,e.id)));
  for(const call of graph.callSites.filter(c=>c.callerId===node.id&&c.status!=='RESOLVED'))$('outgoing').append(linkButton(`${call.status} · ${call.expression}`,call.id));
  if(!$('outgoing').childElementCount)$('outgoing').textContent='None shown in this projection.';
  $('connectionLimits').textContent=`Only currently returned relations are listed. ${graph.projection?.boundaryRelations||0} relations cross this page. Focus a function to inspect its neighborhood; absence is not proof of no callers.`;
}
function renderLists(){
  $('elementList').replaceChildren();
  for(const n of graph.nodes){const b=linkButton(`${n.kind} · ${n.qualifiedName||n.label} · ${n.authority}`,n.id);b.dataset.node=n.id;$('elementList').append(b);}
  for(const e of graph.edges){const b=linkButton(`${e.kind} · ${name(e.from)} → ${name(e.to)} · ${e.authority}`,e.id);b.dataset.edge=e.id;$('elementList').append(b);}
  $('callSites').replaceChildren();
  for(const c of graph.callSites){const button=linkButton('',c.id);button.className='call-row';button.dataset.state=c.status;button.append(element('span',c.status),element('strong',c.expression||'Call expression'),element('small',`${c.source.path}:${c.source.line} · ${c.reason}`));button.firstChild.className='call-state';$('callSites').append(button);}
  const counts=graph.coverage?.calls;$('callSummary').textContent=counts?`${counts.total} call sites in analysis · ${counts.resolved} resolved · ${counts.ambiguous} ambiguous · ${counts.unknown} unknown · ${counts.external} external. ${graph.callSites.length} shown in this view.`:`${graph.callSites.length} call sites shown in this view.`;
  const p=graph.projection||{};$('coverage').textContent=`${graph.nodes.length} of ${p.matchedNodes??graph.nodes.length} matching nodes shown · ${graph.edges.length} relations · ${p.boundaryRelations||0} relations cross this view${p.edgesOmitted?' · '+p.edgesOmitted+' edges omitted by limit':''}${p.callSitesOmitted?' · '+p.callSitesOmitted+' call sites omitted by limit':''}.`;
  $('previous').disabled=offset===0;$('next').disabled=!p.hasMore;
  $('limitations').replaceChildren(...ARRAY(graph.limitations).map(text=>element('li',text)));
  $('capabilities').textContent=JSON.stringify({providers:graph.providers,capabilities:graph.capabilities,coverage:graph.coverage,metrics:graph.metrics},null,2);
  const meaning={calls:'CALLS identifies a statically resolved target under the provider contract. MAY_CALL remains a possibility. A call expression alone is not a resolved target.',focused:'A bounded neighborhood around the selected function. Relations outside the returned page remain outside this view.',control:'Static control structure describes source paths and branches. Reachability and branch execution are not established by this view.',data:'Source-derived data dependencies are scoped to the supported provider contract. They are not observed values or a proof of all possible data flow.',runtime:'Only retained observations from an identified compatible session may be shown. No program executes when opening this view.',sequence:'Sequence order must come from actual retained runtime events. Static call edges are never converted into an invented execution sequence.'};
  $('viewMeaning').textContent=meaning[$('view').value];
}
async function loadGraph(){
  if(state?.status!=='READY'){notice('Analyze the selected captured snapshot before opening its semantic views.');return;}
  graphController?.abort();graphController=new AbortController();const my=graphController;
  notice('Reading the bounded analysis projection. No project execution.');
  try{
    const next=await request({action:'graph',view:$('view').value,focus,query:$('query').value.trim(),offset:String(offset)},null,my.signal);if(my!==graphController)return;
    graph=next;identity(next);clearInspector();renderLists();draw();notice(`Analysis loaded · ${$('view').selectedOptions[0].textContent}. Unknowns and coverage limits remain explicit.`);
  }catch(error){if(error.name!=='AbortError'&&my===graphController)notice(error.message,true);}
}
async function source(){
  if(!selected?.source||!graph)return;const seq=++sourceOperation,item=selected;
  // Relations anchor at their call site when available; no path is supplied by the browser.
  const node=item.edge?(item.callSiteId||graph.nodes.find(n=>n.source?.path===item.source.path&&n.source?.line===item.source.line)?.id):item.id;
  if(!node){notice('This relation has no separate admitted source node. Inspect one of its endpoint definitions.',true);return;}
  $('sourceCode').hidden=false;$('sourceCode').textContent='Reading captured source…';
  try{const value=await request({action:'source',snapshot:graph.identity.snapshotId,node});if(seq!==sourceOperation)return;if(value.sourceSha256!==item.source.sourceSha256)throw new Error('Source identity does not match the selected evidence.');$('sourceCode').textContent=ARRAY(value.lines).map(line=>`${String(line.line).padStart(4)}  ${line.text}${line.truncated?' … [truncated]':''}`).join('\n')+(value.redacted?'\n\nLocal display redaction applies; content hash identifies the original captured file.':'');}catch(error){if(seq===sourceOperation)$('sourceCode').textContent=error.message;}
}
function zoomAtPointer(event){
  if(!cy||event.ctrlKey||event.metaKey||!Number.isFinite(event.deltaY)||event.deltaY===0)return;
  const raw=event.deltaY,delta=event.deltaMode===0?raw:Math.sign(raw)*100,steps=Math.max(-3,Math.min(3,delta/100)),next=Math.min(cy.maxZoom(),Math.max(cy.minZoom(),cy.zoom()*Math.pow(2.6,-steps)));
  event.preventDefault();event.stopImmediatePropagation();const rect=$('canvas').getBoundingClientRect();if(next!==cy.zoom())cy.zoom({level:next,renderedPosition:{x:event.clientX-rect.left,y:event.clientY-rect.top}});
}
$('canvas').addEventListener('wheel',zoomAtPointer,{capture:true,passive:false});
$('analyze').onclick=()=>action('analyze');$('cancel').onclick=()=>action('cancel');$('reload').onclick=()=>refresh(true);
$('runtimeDemo').onclick=runRuntimeExample;
$('source').onchange=()=>{operation++;sourceOperation++;graphController?.abort();clearTimeout(pollTimer);state=null;focus='';offset=0;clearGraph();controls();refresh();};
$('view').onchange=()=>{offset=0;loadGraph();};$('search').onclick=()=>{offset=0;loadGraph();};$('query').onkeydown=e=>{if(e.key==='Enter'){$('search').click();}};
$('whole').onclick=()=>{focus='';offset=0;loadGraph();};$('previous').onclick=()=>{offset=Math.max(0,offset-150);loadGraph();};$('next').onclick=()=>{offset+=150;loadGraph();};
$('focus').onclick=()=>{if(selected&&!selected.edge){focus=selected.id;offset=0;$('view').value='focused';loadGraph();}};$('openSource').onclick=source;
$('fit').onclick=()=>cy?.fit(undefined,40);$('layout').onclick=()=>draw();$('zoomIn').onclick=()=>{if(cy)cy.zoom({level:Math.min(cy.maxZoom(),cy.zoom()*1.6),renderedPosition:{x:cy.width()/2,y:cy.height()/2}});};$('zoomOut').onclick=()=>{if(cy)cy.zoom({level:Math.max(cy.minZoom(),cy.zoom()/1.6),renderedPosition:{x:cy.width()/2,y:cy.height()/2}});};
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';if(cy)cy.style(graphStyle());};
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(pollTimer);pollTimer=null;}else if(state?.status==='RUNNING')refresh(false);});
window.addEventListener('pagehide',()=>{clearTimeout(pollTimer);graphController?.abort();});
refresh();
