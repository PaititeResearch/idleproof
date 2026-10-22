// Optional, source-anchored discussion. No paid call without an explicit
// preview-and-send gesture. Fixed UI chrome stays English for international use.
import {renderByokPreview,renderByokResult,formatByokError} from './byok-view.js';
const $=id=>document.getElementById(id);
const host=$('aiResult'),card=$('aiLearningThread'),log=$('aiThreadLog'),anchorBox=$('aiThreadAnchor');
const cardHome=card.parentElement,history=$('aiThreadHistory');
let root=null,thread=null,anchor=null,previewConsent=null,busy=false,sequence=0,sourceSequence=0;
const endpoint='/api/ai/thread';
const requests=async(url,body)=>{
  const options=body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined;
  const response=await fetch(url,options),data=await response.json();
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
};
const el=(tag,text,css)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(css)e.className=css;return e;};
const invalidate=()=>{sequence++;previewConsent=null;$('aiThreadSend').disabled=true;$('aiThreadPreview').textContent='Preview required before sending. No call authorized.';};
const status=value=>{$('aiThreadStatus').textContent=value;};
function decorate() {
  if(!root?.answer?.claims||!root?.presentation?.headings||typeof host.querySelectorAll!=='function')return;
  const parts=Array.from(host.querySelectorAll('section')).filter(e=>e.querySelector('h4')&&e.querySelector('p'));
  for(let index=0;index<root.answer.claims.length&&index<parts.length;index++) {
    const section=parts[index];section.dataset.aiClaimIndex=String(index);
    if(section.querySelector('[data-ai-discuss]'))continue;
    const button=el('button','Ask about this section','ai-ask-section');button.type='button';button.dataset.aiDiscuss=String(index);
    section.append(button);
  }
}
function selectAnchor(index,selection,source=null) {
  if(!root||root.status!=='INTERPRETATION'||!Number.isInteger(index)||!root.answer?.claims?.[index])return;
  const full=root.answer.claims[index].text;
  const quote=String(selection||'').trim();
  if(quote.length<3||quote.length>360||!full.includes(quote)){
    status('Select a passage of up to 360 characters inside a single explanation section.');return;
  }
  anchor={claimIndex:index,selection:quote};invalidate();
  anchorBox.replaceChildren();anchorBox.append(el('strong','Selected passage · '),el('span',quote));
  // Reposition the EXISTING Selected passage section directly after the
  // chosen paragraph. No floating action, overlay, or replacement controls.
  const paragraph=source?.closest?.('p')||source?.closest?.('section[data-ai-claim-index]')?.querySelector('p');
  if(paragraph&&host.contains(paragraph))paragraph.after(card);
  else cardHome.append(card);
  card.classList.add('ai-thread-selected');
  history.open=false;
  $('aiThreadPreviewButton').disabled=false;card.hidden=false;
  status('This selection is local. Ask a question and preview the exact source context before sending.');
}
function selectionInRoot() {
  if(!root||typeof window.getSelection!=='function')return;
  const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return;
  const start=selection.anchorNode?.nodeType===1?selection.anchorNode:selection.anchorNode?.parentElement;
  const end=selection.focusNode?.nodeType===1?selection.focusNode:selection.focusNode?.parentElement;
  const a=start?.closest?.('section[data-ai-claim-index]'),b=end?.closest?.('section[data-ai-claim-index]');
  if(!a||a!==b)return;
  // Selecting citation buttons or technical provenance must not add unapproved context.
  if(!start.closest?.('p')||!end.closest?.('p')||card.contains(start)||card.contains(end))return;
  selectAnchor(Number(a.dataset.aiClaimIndex),selection.toString(),end.closest('p'));
}
host.addEventListener('mouseup',selectionInRoot);
host.addEventListener('keyup',selectionInRoot);
host.addEventListener('click',event=>{
  const button=event.target.closest?.('button[data-ai-discuss]');if(!button)return;
  const index=Number(button.dataset.aiDiscuss),claim=root?.answer?.claims?.[index];
  if(claim){selectAnchor(index,claim.text.slice(0,Math.min(300,claim.text.length)),button);$('aiThreadQuestion').focus({preventScroll:true});}
});
async function openSource(button) {
  const id=++sourceSequence,output=el('pre','Loading captured source…');output.tabIndex=-1;
  button.after(output);output.focus({preventScroll:true});
  try{
    const params=new URLSearchParams({snapshot:button.dataset.aiSnapshot,path:button.dataset.aiSource,line:'1'});
    const data=await requests('/api/project-source?'+params);
    if(id!==sourceSequence)return;
    output.textContent=`${data.path} · ${data.sourceSha256}\n${data.lines.map(l=>`${l.line}: ${l.text}${l.truncated?' [truncated]':''}`).join('\n')}`;
  }catch(e){if(id===sourceSequence)output.textContent='Captured source unavailable: '+formatByokError(e);}
}
log.addEventListener('click',event=>{const button=event.target.closest?.('button[data-ai-source]');if(button){event.stopPropagation();openSource(button);}});
function appendAnswer(container,result) {
  if(!result||result.status!=='INTERPRETATION'||!result.answer?.claims?.length){
    container.append(el('p','No reviewed answer accepted. The attempt and any uncertain reservation remain recorded.'));return;
  }
  const evidence=new Map((result.evidence||[]).map(v=>[v.citation,v]));
  result.answer.claims.forEach((claim,i)=>{
    container.append(el('h4',result.presentation?.headings?.[i]||`Explanation ${i+1}`),el('p',claim.text));
    const citations=el('div');
    for(const citation of claim.citations||[]){
      const e=evidence.get(citation);
      if(e?.path&&e?.snapshotId){const button=el('button',`${citation} · ${e.path}`);button.type='button';button.dataset.aiSource=e.path;button.dataset.aiSnapshot=e.snapshotId;citations.append(button);}
    }
    container.append(citations);
  });
  if(result.answer.unknowns?.length){container.append(el('h4','What remains unknown'));for(const t of result.answer.unknowns)container.append(el('p',t));}
}
function renderThread(data) {
  thread=data;log.replaceChildren();
  const count=data?.turns?.length||0;
  $('aiThreadHistoryCount').textContent=count===1?'1 question':count+' questions';
  history.hidden=count===0;
  card.hidden=!card.classList.contains('ai-thread-selected')&&count===0;
  if(!count){log.append(el('p','No follow-ups yet. Select a passage in the explanation above.'));return;}
  for(const turn of data.turns){
    const article=el('article',undefined,'ai-thread-turn');article.append(el('small',`Question · ${new Date(turn.createdAt).toLocaleString()}`));
    article.append(el('blockquote',`“${turn.selection}”`),el('p',turn.question));
    const result=turn.result;
    if(result) {
      const cost=Number.isFinite(result.reportedCostUsd)?` · ${result.reportedCostUsd.toFixed(6)} USD reported`:'';
      article.append(el('small',`${result.status==='INTERPRETATION'?'Model explanation — not Proof':'Incomplete · no reviewed answer'}${cost}`));
      appendAnswer(article,result);
      if(result.status!=='INTERPRETATION'&&result.unreviewedDraft){
        const detail=el('details'),summary=el('summary','View the unreviewed draft (not verified)');detail.append(summary);
        appendAnswer(detail,{status:'INTERPRETATION',answer:result.unreviewedDraft.answer,presentation:result.unreviewedDraft.presentation,evidence:result.unreviewedDraft.evidence});article.append(detail);
      }
    }else article.append(el('p','Stored answer is unavailable; no new request was made.'));
    log.append(article);
  }
  if(history.open)log.scrollTop=log.scrollHeight;
}
async function showRoot(result,{restore=false}={}) {
  // The composer may be inside an old explanation's DOM when a new result
  // replaces innerHTML. Preserve the same DOM node/handlers by parking it.
  if(card.parentElement!==cardHome)cardHome.append(card);
  card.classList.remove('ai-thread-selected');
  card.hidden=true;
  history.open=false;
  if(result?.status!=='INTERPRETATION'||!result.digest||!result.presentation)return;
  if(!restore||root?.digest!==result.digest){
    anchor=null;invalidate();
    anchorBox.textContent='Select a passage in the explanation above to ask about it.';
    $('aiThreadPreviewButton').disabled=true;
  }
  root=result;decorate();
  const digest=result.digest;
  try {
    const data=await requests(`${endpoint}?${new URLSearchParams({rootDigest:digest})}`);
    if(data.rootDigest===digest&&root?.digest===digest)renderThread(data);
  }catch(e){if(root?.digest===digest)status('Local discussion cannot be loaded: '+formatByokError(e));}
}
// If an old automatic history lookup finishes after a newer explanation, it
// must not erase that explanation or relocate the in-progress Selected passage.
let restoreVersion=0;
window.addEventListener('idleproof:ai-result',event=>{
  restoreVersion++;
  void showRoot(event.detail?.result);
});
$('optionalAI').addEventListener('toggle',async()=>{
  const version=++restoreVersion;
  if(!$('optionalAI').open||root)return;
  try{
    const data=await requests(`${endpoint}?rootDigest=latest`);
    if(version!==restoreVersion||!$('optionalAI').open||root||!data.root)return;
    host.innerHTML=renderByokResult(data.root);
    await showRoot(data.root,{restore:true});
    if(data.stale)status('The project snapshot has changed. Previous messages stay readable, but new questions need a fresh explanation.');
  }catch{/* No previous discussion is a normal first-run state. */}
});
$('aiThreadQuestion').addEventListener('input',()=>{invalidate();$('aiThreadPreviewButton').disabled=!anchor;});
$('aiThreadPreviewButton').onclick=async()=>{
  if(!root||!anchor||busy)return;
  invalidate();const current=sequence;
  const question=$('aiThreadQuestion').value.trim();
  if(!question){status('Write a question before requesting a preview.');return;}
  const args={action:'preview',rootDigest:root.digest,source:$('scanSource').value,claimIndex:anchor.claimIndex,selection:anchor.selection,question};
  try{
    const data=await requests(endpoint,args);if(current!==sequence||data.rootDigest!==root.digest)return;
    previewConsent={...args,consentDigest:data.preview.digest};
    $('aiThreadPreview').innerHTML=renderByokPreview(data.preview);
    $('aiThreadSend').disabled=!data.preview.configured;
    status('This context is scoped to the selected passage. No provider request has been made.');
  }catch(e){if(current===sequence){$('aiThreadPreview').textContent=formatByokError(e);status('Nothing has been sent.');}}
};
$('aiThreadSend').onclick=async()=>{
  if(!previewConsent||busy)return;
  const approved=previewConsent;invalidate();busy=true;
  $('aiThreadPreviewButton').disabled=true;status('Generating one explicitly approved follow-up. No automatic retries.');
  try{const result=await requests(endpoint,{...approved,action:'explain'});renderThread(result);history.open=true;log.scrollTop=log.scrollHeight;status('Follow-up saved privately on this machine. Model interpretations are not Proof.');}
  catch(e){status(formatByokError(e)+' Any attempted call may still have an uncertain charge.');}
  finally{busy=false;$('aiThreadPreviewButton').disabled=!anchor;}
};
$('aiThreadCancel').onclick=async()=>{
  try{await requests('/api/ai',{action:'cancel'});status('Cancellation requested. An in-flight call may still be charged.');}
  catch(e){status(formatByokError(e));}
};
