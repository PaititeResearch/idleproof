// Optional, source-anchored discussion. No paid call without an explicit
// preview-and-send gesture. Fixed UI chrome stays English for international use.
import {renderByokPreview,renderByokResult,formatByokError} from './byok-view.js';
const $=id=>document.getElementById(id);
const host=$('aiResult'),card=$('aiLearningThread'),log=$('aiThreadLog'),anchorBox=$('aiThreadAnchor');
let root=null,thread=null,anchor=null,previewConsent=null,busy=false,sequence=0,sourceSequence=0;
const endpoint='/api/ai/thread';
const requests=async(url,body)=>{
  const options=body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined;
  const response=await fetch(url,options),data=await response.json();
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
};
const el=(tag,text,css)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(css)e.className=css;return e;};
// UX only: the saved thread, consent, provider calls and source binding remain untouched.
// A text selection exposes a small action. Only an explicit click opens the nearby
// composer. History is available independently and closed by default.
const selectionAction=el('button','Ask about selection','ai-selection-action');
selectionAction.type='button';selectionAction.hidden=true;
selectionAction.setAttribute('aria-controls','aiLearningThread');
selectionAction.setAttribute('aria-expanded','false');
document.body.append(selectionAction);
const historyShortcut=el('button','Conversation history','ai-thread-history-shortcut');
historyShortcut.type='button';historyShortcut.hidden=true;
historyShortcut.setAttribute('aria-controls','aiLearningThread');
historyShortcut.setAttribute('aria-expanded','false');
const historyPanel=$('aiThreadHistory'),latest=$('aiThreadLatest');
let selectedRange=null,anchorElement=null,anchorRect=null,openOrigin=null,panelMode=null;
const clamp=(v,min,max)=>Math.max(min,Math.min(v,Math.max(min,max)));
function rectForSelection() {
  if(selectedRange) {
    try {
      const r=selectedRange.getBoundingClientRect();
      if(r.width>0&&r.height>0)return r;
    }catch{/* Detached selection: retain the last explicit anchor. */}
  }
  return anchorElement?.getBoundingClientRect()||anchorRect;
}
function positionSelectionAction() {
  if(selectionAction.hidden||!anchor)return;
  const r=rectForSelection();if(!r)return;
  if(r.bottom<0||r.top>innerHeight){selectionAction.hidden=true;return;}
  const w=selectionAction.offsetWidth||170,h=selectionAction.offsetHeight||36;
  const y=r.bottom+8+h<=innerHeight-8?r.bottom+8:r.top-h-8;
  selectionAction.style.left=clamp(r.left,8,innerWidth-w-8)+'px';
  selectionAction.style.top=clamp(y,8,innerHeight-h-8)+'px';
}
function positionPanel(r=rectForSelection()) {
  if(card.hidden)return;
  if(matchMedia('(max-width:650px)').matches) {
    card.style.left='';card.style.top='';return; // CSS bottom sheet
  }
  const w=card.offsetWidth,h=card.offsetHeight;
  const target=r||{top:innerHeight/3,bottom:innerHeight/3,left:innerWidth/2};
  const below=target.bottom+10,above=target.top-h-10;
  const y=below+h<=innerHeight-12?below:above>=12?above:clamp(below,12,innerHeight-h-12);
  card.style.left=clamp(target.left,12,innerWidth-w-12)+'px';
  card.style.top=clamp(y,12,innerHeight-h-12)+'px';
}
function closePopover({focus=false,reopenAction=false}={}) {
  if(card.hidden)return;
  card.hidden=true;historyPanel.open=false;
  historyShortcut.setAttribute('aria-expanded','false');
  selectionAction.setAttribute('aria-expanded','false');
  const previous=openOrigin;openOrigin=null;panelMode=null;
  if(reopenAction&&anchor){selectionAction.hidden=false;positionSelectionAction();}
  if(focus&&previous?.isConnected&&!previous.hidden)previous.focus({preventScroll:true});
}
function openPopover({history=false,origin=null,rect=null}={}) {
  if(!root)return;
  const source=rect||rectForSelection();
  panelMode=history?'history':'question';openOrigin=origin;
  selectionAction.hidden=true;
  $('aiThreadComposer').hidden=history;
  $('aiThreadHeading').textContent=history?'Conversation history':'Ask about this passage';
  historyPanel.open=history;
  card.hidden=false;
  historyShortcut.setAttribute('aria-expanded',String(history));
  selectionAction.setAttribute('aria-expanded',String(!history));
  positionPanel(source);
  (history?historyPanel.querySelector('summary'):$('aiThreadQuestion')).focus({preventScroll:true});
}
selectionAction.onclick=()=>openPopover({origin:selectionAction});
historyShortcut.onclick=()=>openPopover({history:true,origin:historyShortcut,rect:historyShortcut.getBoundingClientRect()});
$('aiThreadClose').onclick=()=>closePopover({focus:true,reopenAction:panelMode==='question'});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(!card.hidden){event.preventDefault();closePopover({focus:true,reopenAction:panelMode==='question'});}
  else if(!selectionAction.hidden)selectionAction.hidden=true;
});
document.addEventListener('pointerdown',event=>{
  if(!card.hidden&&!card.contains(event.target)&&event.target!==selectionAction&&event.target!==historyShortcut)closePopover();
});
window.addEventListener('resize',()=>{if(!card.hidden)positionPanel();else positionSelectionAction();},{passive:true});
document.addEventListener('scroll',()=>{if(!card.hidden)return;positionSelectionAction();},{capture:true,passive:true});
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
function selectAnchor(index,selection,{rect=null,range=null,element=null}={}) {
  if(!root||root.status!=='INTERPRETATION'||!Number.isInteger(index)||!root.answer?.claims?.[index])return;
  const full=root.answer.claims[index].text;
  const quote=String(selection||'').trim();
  if(quote.length<3||quote.length>360||!full.includes(quote)){
    status('Select a passage of up to 360 characters inside a single explanation section.');return;
  }
  closePopover();anchor={claimIndex:index,selection:quote};invalidate();
  selectedRange=range||null;anchorElement=element||null;anchorRect=rect||null;
  anchorBox.replaceChildren();anchorBox.append(el('strong','Selected passage · '),el('span',quote));
  $('aiThreadPreviewButton').disabled=false;latest.hidden=true;latest.replaceChildren();
  historyPanel.open=false;
  selectionAction.hidden=false;positionSelectionAction();
  status('Selection captured locally. Choose Ask about selection to preview focused sources; no provider call was made.');
}
function selectionInRoot() {
  if(!root||typeof window.getSelection!=='function')return;
  const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return;
  const start=selection.anchorNode?.nodeType===1?selection.anchorNode:selection.anchorNode?.parentElement;
  const end=selection.focusNode?.nodeType===1?selection.focusNode:selection.focusNode?.parentElement;
  const a=start?.closest?.('section[data-ai-claim-index]'),b=end?.closest?.('section[data-ai-claim-index]');
  if(!a||a!==b)return;
  // Selecting citation buttons or technical provenance must not add unapproved context.
  if(!start.closest?.('p')||!end.closest?.('p'))return;
  const range=selection.getRangeAt(0).cloneRange();
  selectAnchor(Number(a.dataset.aiClaimIndex),selection.toString(),{range,rect:range.getBoundingClientRect(),element:a});
}
host.addEventListener('mouseup',selectionInRoot);
host.addEventListener('keyup',selectionInRoot);
host.addEventListener('click',event=>{
  const button=event.target.closest?.('button[data-ai-discuss]');if(!button)return;
  const index=Number(button.dataset.aiDiscuss),claim=root?.answer?.claims?.[index];
  if(claim){
    selectAnchor(index,claim.text.slice(0,Math.min(300,claim.text.length)),{rect:button.getBoundingClientRect(),element:button});
    openPopover({origin:button,rect:button.getBoundingClientRect()});
  }
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
log.addEventListener('click',event=>{const button=event.target.closest?.('button[data-ai-source]');if(button)openSource(button);});
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
  historyShortcut.textContent='Conversation history · '+count;
  historyShortcut.hidden=count===0;
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
  if(historyPanel.open)log.scrollTop=log.scrollHeight;
}
function showLatest(data) {
  const turn=data?.turns?.at(-1);if(!turn)return;
  latest.replaceChildren(el('small',`Question · ${turn.question}`));
  const result=turn.result;
  if(result){
    const cost=Number.isFinite(result.reportedCostUsd)?` · ${result.reportedCostUsd.toFixed(6)} USD reported`:'';
    latest.append(el('small',result.status==='INTERPRETATION'?'Model explanation — not Proof'+cost:'Incomplete · no reviewed answer'+cost));
    appendAnswer(latest,result);
    if(result.status!=='INTERPRETATION'&&result.unreviewedDraft) {
      const detail=el('details'),summary=el('summary','View the unreviewed draft (not verified)');
      detail.append(summary);appendAnswer(detail,{status:'INTERPRETATION',answer:result.unreviewedDraft.answer,presentation:result.unreviewedDraft.presentation,evidence:result.unreviewedDraft.evidence});latest.append(detail);
    }
  }else latest.append(el('p','Saved answer unavailable; no new request was made.'));
  latest.hidden=false;
}
async function showRoot(result,{restore=false}={}) {
  if(result?.status!=='INTERPRETATION'||!result.digest||!result.presentation)return;
  if(!restore||root?.digest!==result.digest) {
    anchor=null;invalidate();anchorBox.textContent='Select a passage in the explanation above to ask about it.';
    $('aiThreadPreviewButton').disabled=true;$('aiThreadQuestion').value='';
  }
  // A restored discussion never opens a large panel or scrolls the original explanation.
  card.hidden=true;selectionAction.hidden=true;selectedRange=null;anchorElement=null;anchorRect=null;
  latest.hidden=true;latest.replaceChildren();historyPanel.open=false;
  root=result;decorate();
  if(!historyShortcut.isConnected)host.prepend(historyShortcut);
  try{const data=await requests(`${endpoint}?${new URLSearchParams({rootDigest:root.digest})}`);if(data.rootDigest===root.digest)renderThread(data);}
  catch(e){status('Local discussion cannot be loaded: '+formatByokError(e));}
}
window.addEventListener('idleproof:ai-result',event=>showRoot(event.detail?.result));
$('optionalAI').addEventListener('toggle',async()=>{
  if(!$('optionalAI').open||root)return;
  try{
    const data=await requests(`${endpoint}?rootDigest=latest`);
    if(!data.root)return;
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
  try{const result=await requests(endpoint,{...approved,action:'explain'});renderThread(result);showLatest(result);positionPanel();status('Follow-up saved privately on this machine. Model interpretations are not Proof.');}
  catch(e){status(formatByokError(e)+' Any attempted call may still have an uncertain charge.');}
  finally{busy=false;$('aiThreadPreviewButton').disabled=!anchor;}
};
$('aiThreadCancel').onclick=async()=>{
  try{await requests('/api/ai',{action:'cancel'});status('Cancellation requested. An in-flight call may still be charged.');}
  catch(e){status(formatByokError(e));}
};
