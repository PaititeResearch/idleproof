import {renderByokPreview,renderByokResult,formatByokStatus,formatByokError} from './byok-view.js';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let latest=null,busy=false;
// Presentation only: bracketed epistemic annotations keep their exact text and gain a styled wrapper.
const EPISTEMIC=['DECLARED','OBSERVED','INFERRED','VERIFIED','UNKNOWN'];
const ep=(label,rest='')=>{const kind=String(label??'').toUpperCase();return `<span class="ep ep-${EPISTEMIC.includes(kind)?kind.toLowerCase():'other'}">[${escape(label)}${rest}]</span>`;};
const count=(label,value,last=false)=>`<span${label==='errors'&&Number(value)>0?' class="has-errors"':''}>${label} <b>${escape(value)}</b><span class="sep">${last?'.':';'}</span></span> `;
async function get(url,options) {
  const response=await fetch(url,options);
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}
async function request(options) {
  return get('/api/project-scan', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(options)});
}
function render({content=true}={}) {
  if(!latest)return;
  const {model:m,task,job}=latest,technical=$('scanView').value==='technical';
  $('scanActiveTask').textContent=task?`Current task: ${task.title} | ${task.status} | ${task.matchedFiles.length} touched paths in this baseline. Exact change: ${task.changeId||'not recorded'}.`:'No active task recorded. A global scan works before any agent history.';
  $('scanProgress').textContent=job.state==='running'?`Scanning locally: ${job.progress?.position||0} inventory entries processed. Pause takes effect between bounded batches.`:job.error||`Job: ${job.state}${m?` | captured ${m.header.capturedAt} | ${latest.freshness.status}. ${latest.freshness.detail}`:''}`;
  $('scanStart').disabled=job.state==='running';
  $('scanResume').disabled=!job.snapshotId||job.state==='running'||job.state==='complete';
  if(!content)return;
  if(!m){for(const id of ['scanCoverage','scanOverview','scanIntent','scanChanges','scanFiles','scanDuplicates','scanUnknowns'])$(id).innerHTML='';return;}
  const c=m.header.coverage;
  $('scanCoverage').innerHTML=`<div class="scan-coverage"><p class="scan-coverage-head"><strong>${escape(m.header.source)}: ${c.read} read / ${c.inventoryEntries} inventory entries</strong>. <span class="${c.inventoryComplete?'cov-complete':'cov-incomplete'}">${c.inventoryComplete?'Inventory complete in the selected enumeration scope':'INCOMPLETE denominator'}</span>.</p><p class="scan-counts">${count('Parsed',c.statuses.parsed||0)}${count('unsupported',c.statuses.unsupported||0)}${count('unparsed',c.statuses.unparsed||0)}${count('excluded',c.statuses.excluded||0)}${count('omitted',c.statuses.omitted||0)}${count('errors',c.statuses.error||0,true)}</p></div><details><summary>Scope, exclusions, limits and source identity</summary><pre>${escape(JSON.stringify({snapshot:m.header.snapshotId,selection:m.header.selection,profile:m.header.profile,coverage:c,consistency:m.header.consistency},null,2))}</pre></details>`;
  const operations=m.files.flatMap(f=>(f.extraction?.description?.behaviors||[]).map(b=>({file:f.path,...b})));
  const interfaces=m.files.flatMap(f=>(f.extraction?.description?.interfaces||[]).map(i=>({file:f.path,...i})));
  const tests=m.files.filter(f=>f.role==='test'&&f.sourceSha256);
  $('scanOverview').innerHTML=`<h3>How the selected project is organized</h3><p>The capture describes ${operations.length} declarations, ${m.edges.filter(e=>e.to).length} resolved static import references, ${m.edges.filter(e=>!e.to).length} unresolved references and ${tests.length} candidate test files. These counts describe the analyzed scope; they do not measure human understanding or successful execution.</p>${interfaces.length?'<h4>Entry points and interfaces to inspect</h4>'+interfaces.slice(0,32).map(i=>`<p class="scan-iface">${escape(i.kind)}: <strong>${escape(i.name)}</strong> ${i.target?`<code>${escape(i.target)}</code>`:''} in <code>${escape(i.file)}</code> ${ep(i.authority,'; not executed')}</p>`).join(''):'<p>Entry points and runtime interfaces remain UNKNOWN in this capture.</p>'}`;
  const docs=m.files.filter(f=>f.extraction?.description?.intent.length);
  $('scanIntent').innerHTML=docs.length?`<h3>Owner intentions</h3><p>Selected document statements are DECLARED. Their implementation remains UNKNOWN until a supported relationship and verification exist.</p>${docs.map(f=>`<details><summary><span class="scan-path">${escape(f.path)}</span></summary>${f.extraction.description.intent.map(i=>`<p>${escape(i.text)}${i.truncated?' [excerpt truncated]':''} ${ep('DECLARED',`; line ${escape(i.line)}`)}</p>`).join('')}<p>Statements omitted: ${f.extraction.description.omitted?.documentStatements||0}</p></details>`).join('')}`:'<p>Intent UNKNOWN: select the project owner\'s document or inspect recorded objectives. A filename is not a requirement.</p>';
  $('scanChanges').innerHTML=m.changes?`<details><summary>Comparison with prior scan: ${escape(m.changes.comparison)}</summary><pre>${escape(JSON.stringify(m.changes,null,2))}</pre></details>`:'<p>This is the first selected baseline; historical rationale is not inferred.</p>';
  if(m.intentMap) $('scanIntent').innerHTML+=`<h4>Declared requirements and source candidates</h4>${m.intentMap.statements.filter(s=>s.components.length).map(s=>`<details><summary>${escape(s.declaration)} ${ep('DECLARED')}</summary><p>${escape(s.source.path)}:${s.source.line}. Implementation ${s.implementation}; verification ${s.verification}.</p>${s.components.map(c=>`<button type="button" class="scan-jump" data-scan-jump="${escape(c.path)}">Inspect ${escape(c.path)}</button>`).join(' ')}<p>Test candidates: ${s.testCandidates.map(t=>escape(t.path)).join(', ')||'UNKNOWN'}. Static import references do not establish coverage.</p><p>${escape(s.nextAction)}</p></details>`).join('')}<p>Unlinked declarations remain UNKNOWN. ${m.intentMap.statementsOmitted} statements omitted from this view.</p>`;
  const filter=$('scanFilter').value.toLowerCase();
  const all=m.files.filter(f=>f.extraction&&JSON.stringify([f.path,f.extraction.description,f.extraction.symbols]).toLowerCase().includes(filter));
  $('scanFiles').innerHTML=`<h3>Behaviors and connections</h3><p>Showing ${Math.min(all.length,60)} / ${all.length}; search the captured components to narrow this view.</p>`+all.slice(0,60).map(f=>{
    const d=f.extraction.description,relations=m.edges.filter(e=>e.from===f.path||e.to===f.path);
    const behavior=d.behaviors.map(b=>`<p><strong>${escape(b.symbol)}</strong>, line ${b.line}: ${b.clauses.map(c=>`${escape(c.kind)} <code>${escape(c.text)}</code>${c.truncated?' [truncated]':''}`).join('; ')||escape(b.meaning)} ${ep('OBSERVED',` syntax; ${escape(b.clausesOmitted||0)} clauses omitted`)}</p>`).join('');
    return `<details${filter&&all.length<4?' open':''}><summary><span class="scan-path">${escape(f.path)}</span> <span class="scan-meta">| ${escape(f.role)} ${ep('INFERRED',' path role')} | <span class="scan-status scan-status-${escape(f.status)}">${escape(f.status)}</span></span></summary>${behavior||'<p>Behavior UNKNOWN: no supported description was extracted.</p>'}${d.dependencies.length?`<p>Manifest declarations: ${d.dependencies.map(x=>`${escape(x.name)} (${escape(x.scope)})`).join(', ')}. Presence does not establish runtime use.</p>`:''}${relations.slice(0,64).map(e=>`<p>${escape(e.from)} &rarr; ${escape(e.to||e.reference)}: ${escape(e.resolution)}; ${escape(e.meaning)} ${ep(e.authority)}</p>`).join('')||'<p>No local relationship resolved in this scope.</p>'}<p>Relations omitted by this view: ${Math.max(0,relations.length-64)+(f.relationsOmitted||0)}. Description limits: ${escape(JSON.stringify(d.omitted||{}))}</p><button type="button" class="scan-source-button" data-scan-file="${escape(f.path)}" data-scan-line="${d.behaviors[0]?.line||1}">Why? Open captured source</button><pre class="scan-source" hidden></pre><p class="scan-provenance">Source ${escape(f.sourceSha256)}. Snapshot ${escape(m.header.snapshotId)}. Tests and Proof are not inferred.</p>${technical?`<pre>${escape(JSON.stringify(f.extraction,null,2))}</pre>`:''}</details>`;
  }).join('');
  $('scanDuplicates').innerHTML=m.duplicates.length?`<h3>Duplicate candidates</h3>${m.duplicates.map(d=>`<p>${d.paths.map(escape).join(' / ')}: identical bytes ${ep('OBSERVED')}. ${escape(d.action)} Debt: ${escape(d.debt)}.</p>`).join('')}`:'<p>No identical production files found in the captured selection. This does not establish semantic uniqueness or unused code.</p>';
  if(m.header.triage) {
    const t=m.header.triage;
    $('scanDuplicates').innerHTML+=`<h3>Core responsibility review candidates</h3><p>${t.coverage.filesInspected} / ${t.coverage.productionParsedFiles} parsed production files inspected; ${t.coverage.units} units; ${t.coverage.pairsCompared} / ${t.coverage.candidatePairs} candidate pairs compared. ${t.coverage.complete?'Within this bounded triage selection':'INCOMPLETE triage'}. ${t.coverage.findingsOmitted} findings omitted.</p>`+t.findings.map(f=>`<details><summary>${escape(f.kind)}: ${f.locations.map(l=>escape(l.path+':'+l.line)).join(' / ')} ${ep('INFERRED')}</summary><p>${escape(f.interpretation)}</p><pre>${escape(JSON.stringify({locations:f.locations,differences:f.differences},null,2))}</pre><p>${escape(f.acceptanceTest)}</p><p>Debt: ${escape(f.debt)}</p></details>`).join('');
  }
  $('scanUnknowns').innerHTML='<h3>What remains unknown and what to inspect next</h3>'+m.unknowns.map(v=>`<p>${escape(v)}</p>`).join('')+'<p>Review unresolved references and omitted files, link declared objectives through Core, then authorize and run discriminating tests separately.</p>';
}
async function refresh(){
  if(busy)return;busy=true;
  try{
    const source=$('scanSource').value;
    const known=latest?.model?.header.source===source?latest.model.header.snapshotId:'';
    const next=await get(`/api/project-scan?source=${source}&known=${known}`);
    if(next.modelUnchanged)next.model=latest.model;
    latest=next;render({content:!next.modelUnchanged});
  }catch(e){$('scanProgress').textContent=e.message;}finally{busy=false;}
}
$('scanFiles').onclick=async event=>{
  const button=event.target.closest('[data-scan-file]');if(!button)return;
  const target=button.nextElementSibling;
  try{
    const query=new URLSearchParams({snapshot:latest.model.header.snapshotId,path:button.dataset.scanFile,line:button.dataset.scanLine});
    const source=await get('/api/project-source?'+query);
    target.textContent=`${source.snapshotId}\n${source.path} | ${source.sourceSha256}\n`+source.lines.map(l=>`${l.line}: ${l.text}${l.truncated?' [truncated]':''}`).join('\n');
    target.hidden=false;
  }catch(e){target.textContent=e.message;target.hidden=false;}
};
$('scanStart').onclick=async()=>{try{await request({action:'scan',source:$('scanSource').value,documents:$('scanDocuments').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),ci:$('scanCI').checked});await refresh();}catch(e){$('scanProgress').textContent=e.message;}};
$('scanCancel').onclick=async()=>{try{await request({action:'cancel'});await refresh();}catch(e){$('scanProgress').textContent=e.message;}};
$('scanResume').onclick=async()=>{try{const id=latest?.job?.snapshotId;if(!id)throw new Error('No captured scan to resume.');await request({action:'scan',resume:id});await refresh();}catch(e){$('scanProgress').textContent=e.message;}};
$('scanSource').onchange=refresh;$('scanView').onchange=()=>render();$('scanFilter').oninput=()=>render();
$('scanIntent').onclick=event=>{const button=event.target.closest('[data-scan-jump]');if(button){$('scanFilter').value=button.dataset.scanJump;render();$('scanFiles').scrollIntoView({behavior:'smooth',block:'start'});}};
$('scanMemoryLoad').onclick=async()=>{
  try{
    const query=new URLSearchParams({source:$('scanSource').value,query:$('scanMemoryQuery').value});
    const handoff=await get('/api/project-handoff?'+query);
    const n=handoff.navigation;
    let citations=$('scanMemoryCitations');
    if(!citations){citations=document.createElement('div');citations.id='scanMemoryCitations';$('scanMemory').after(citations);}
    citations.replaceChildren();
    for(const item of n.recordedItems||[])if(item.source?.eventId&&item.source?.eventHash){
      const button=document.createElement('button');button.type='button';button.textContent=`Open original event: ${item.id}`;
      button.onclick=async()=>{try{const event=await get('/api/project-memory-event?'+new URLSearchParams({id:item.source.eventId,hash:item.source.eventHash}));let detail=citations.querySelector('pre');if(!detail){detail=document.createElement('pre');citations.append(detail);}detail.textContent=JSON.stringify(event,null,2);}catch(e){$('scanMemory').textContent=e.message;}};
      citations.append(button);
    }
    $('scanMemory').textContent=[`Recorded context: ${handoff.memoryStatus} (${n.contextId||'none'})`,
      ...(n.recordedItems||[]).flatMap(i=>[`${i.kind}: ${i.label} [${i.authority}] / ${i.id}`,
        `Source event: ${i.source?.eventId||'not supplied'} / ${i.source?.eventHash||'unknown'}`,
        ...i.components.map(c=>`  ${c.predicate} ${c.path} [${c.authority}]`),
        ...i.testCandidates.map(t=>`  Candidate test ${t.path}; coverage UNKNOWN`),
        ...i.changes.map(c=>`  Recorded change ${c.changeId}; Proof ${c.proof?.claim||'UNKNOWN'}; measured debt ${c.softwareDebt?.points??'UNKNOWN'}. Current applicability UNKNOWN.`),i.verification,'']),
      `Known Core debt: ${JSON.stringify(n.knownDebt||[])}`,`Required evidence: ${JSON.stringify(n.requiredEvidence||[])}`,
      ...(n.warnings||[]),n.limitations||''].join('\n');
  }catch(e){$('scanMemory').textContent=e.message;}
};
$('scanHandoff').onclick=async()=>{try{const data=await get('/api/project-handoff?source='+$('scanSource').value);await navigator.clipboard.writeText(JSON.stringify(data,null,2));$('scanProgress').textContent='Copied the local sourced handoff. It contains local project descriptions; review it before sharing.';}catch(e){$('scanProgress').textContent=e.message+' Use idleproof project handoff --json if clipboard access is unavailable.';}};
refresh();setInterval(()=>{if(!document.hidden)refresh();},5000);

let consent=null,lastFailure=null,aiBusy=false,previewSequence=0;
const aiOptions=()=>({source:$('scanSource').value,paths:$('aiPaths').value.split(/\r?\n/).map(p=>p.trim()).filter(Boolean),includeSource:$('aiIncludeSource').checked,includeMemory:$('aiIncludeMemory').checked,quality:$('aiQuality').checked,question:$('aiQuestion').value});
const aiRequest=body=>get('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const invalidate=()=>{previewSequence++;consent=null;lastFailure=null;$('aiRetry').hidden=true;$('aiSend').disabled=true;};
for(const id of ['aiPaths','aiQuestion','aiIncludeSource','aiIncludeMemory','aiQuality','scanSource'])$(id).addEventListener('input',invalidate);
$('aiTestConnection').onclick=async()=>{try{$('aiStatus').textContent=formatByokStatus(await aiRequest({action:'test',allowNetwork:true}));}catch(e){$('aiStatus').textContent=formatByokError(e);}};
$('optionalAI').addEventListener('toggle',async()=>{if($('optionalAI').open)try{$('aiStatus').textContent=formatByokStatus(await get('/api/ai/status'));}catch(e){$('aiStatus').textContent=formatByokError(e);}});
async function preparePreview(retryOf=null) {
  if(aiBusy)return;
  invalidate();const sequence=previewSequence;
  try{
    const options={...aiOptions(),...(retryOf?{retryOf}:{})},preview=await aiRequest({action:'preview',...options});
    if(sequence!==previewSequence)return;
    consent={...options,consentDigest:preview.digest};
    $('aiPreview').innerHTML=renderByokPreview(preview);$('aiSend').disabled=!preview.configured;
    $('aiResult').textContent='';
  }catch(e){if(sequence===previewSequence)$('aiPreview').textContent=formatByokError(e);}
}
$('aiPreviewButton').onclick=()=>preparePreview();
$('aiRetry').onclick=()=>preparePreview(lastFailure);
$('aiSend').onclick=async()=>{
  if(!consent||aiBusy)return;
  const approved=consent;invalidate();const sequence=previewSequence;aiBusy=true;
  $('aiPreviewButton').disabled=true;$('aiResult').textContent='Generating an explanation. Local observations remain available.';
  try{
    const result=await aiRequest({action:'explain',...approved});
    $('aiResult').innerHTML=renderByokResult(result);
    // Input edits during a request invalidate retry consent too.
    if(sequence===previewSequence&&result.status==='FALLBACK'&&result.retryable){lastFailure=result.digest;$('aiRetry').hidden=false;}
  }catch(e){$('aiResult').textContent=formatByokError(e);}
  finally{aiBusy=false;$('aiPreviewButton').disabled=false;}
};
// Cancelling says what it can know: a call in flight may already be charged; without one, nothing was sent.
$('aiCancel').onclick=async()=>{const inFlight=aiBusy;try{await aiRequest({action:'cancel'});$('aiResult').textContent=inFlight?'Cancellation requested. A call already sent may still be charged.':'No request in progress. Nothing was sent.';}catch(e){$('aiResult').textContent=formatByokError(e);}};
let sourceSequence=0;
$('aiResult').onclick=async event=>{
  const button=event.target.closest('[data-ai-source]');if(!button)return;
  const sequence=++sourceSequence;
  let target=$('aiSourceDetail');
  if(!target){target=document.createElement('pre');target.id='aiSourceDetail';}
  target.setAttribute('tabindex','-1');
  target.setAttribute('aria-live','polite');
  target.setAttribute('aria-label','Captured source');
  button.after(target);
  target.hidden=false;
  target.textContent='Loading captured source: '+button.dataset.aiSource+'…';
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'nearest'});
  try{
    const source=await get('/api/project-source?'+new URLSearchParams({snapshot:button.dataset.aiSnapshot,path:button.dataset.aiSource,line:'1'}));
    if(sequence!==sourceSequence||$('aiSourceDetail')!==target)return;
    target.textContent='Captured source: '+source.path+'\n'+source.snapshotId+' | '+source.sourceSha256+'\n'+source.lines.map(l=>l.line+': '+l.text+(l.truncated?' [truncated]':'')).join('\n');
    target.scrollIntoView({block:'nearest'});
  }catch(e){
    if(sequence!==sourceSequence||$('aiSourceDetail')!==target)return;
    target.textContent='Unable to load captured source: '+e.message;
    target.scrollIntoView({block:'nearest'});
  }
};

$('scanMemoryAsk').onclick=async()=>{
  try {
    const answer=await get('/api/project-memory-question?'+new URLSearchParams({query:$('scanMemoryQuery').value}));
    const c=answer.context;
    $('scanMemory').textContent=[`Recorded answer: ${answer.status}`,`Capture: ${c.anchor.eventHead||'empty journal'}`,c.abstention||'',...c.facts.flatMap(f=>[`${f.category} [${f.epistemicStatus}] ${JSON.stringify(f.fields)}`,`Source: ${f.source.eventId} / ${f.source.eventHash}; recorded ${f.recordedAt}`]),`Scope: ${JSON.stringify(c.coverage)}`,c.authority].join('\n');
    let citations=$('scanMemoryCitations');if(!citations){citations=document.createElement('div');citations.id='scanMemoryCitations';$('scanMemory').after(citations);}citations.replaceChildren();
    for(const f of c.facts){const button=document.createElement('button');button.type='button';button.textContent=`Open ${f.source.eventId}`;button.onclick=async()=>{try{const event=await get('/api/project-memory-event?'+new URLSearchParams({id:f.source.eventId,hash:f.source.eventHash}));let detail=citations.querySelector('pre');if(!detail){detail=document.createElement('pre');citations.append(detail);}detail.textContent=JSON.stringify(event,null,2);}catch(e){$('scanMemory').textContent=e.message;}};citations.append(button);}
  }catch(e){$('scanMemory').textContent=e.message;}
};
