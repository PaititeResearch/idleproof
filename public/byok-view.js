const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const details=(label,value)=>`<details><summary>${escape(label)}</summary><pre>${escape(JSON.stringify(value,null,2))}</pre></details>`;
const messages={
  BYOK_SOURCE_MISMATCH:'A captured source does not match the approved snapshot. Prepare a new preview; no generation was requested.',
  BYOK_REVIEW_CONTEXT_BUDGET:'The draft is too large for the approved review budget. No review was sent; the draft is not presented as a reviewed answer.',
  BYOK_REVIEW_TIME_INSUFFICIENT:'The first draft used most of the allowed time. No corrective review was sent; you can read the saved draft, clearly marked unreviewed.',
  BYOK_REVIEW_COST_UNKNOWN:'The draft cost is unknown. Its reservation is retained and no review was sent.',
  BYOK_THREAD_INVALID:'Select a short passage from one explanation section and enter a question. No provider request was made.',
  BYOK_THREAD_ROOT_UNAVAILABLE:'The original reviewed explanation is unavailable. Generate an explanation before starting a discussion.',
  BYOK_THREAD_STALE:'The project snapshot has changed. Existing discussions remain readable; prepare a new explanation from the current capture.',
  BYOK_THREAD_SOURCES_UNAVAILABLE:'This passage has no eligible captured source to follow. Select a passage with source citations.',
  BYOK_THREAD_STORAGE_INVALID:'The local discussion history cannot be read safely. No provider request was made.',
  BYOK_THREAD_FULL:'This discussion reached its local 24-question limit. Start from a new explanation.',

  BYOK_OUTPUT_TRUNCATED:'Generation reached its output limit before completing the response. Partial output is not presented as an explanation.',
  BYOK_EMPTY_RESPONSE:'The provider returned a response without usable text.',
  BYOK_EMPTY_INTERPRETATION:'The response contains no sourced explanation. This workflow still needs verification.',
  BYOK_ANSWER_REJECTED:'The response does not meet the required format or citation rules and was rejected.',
  BYOK_INVALID_JSON:'The response does not contain valid, complete JSON.',
  BYOK_HTTP_429:'The provider is currently rate-limiting requests. You can try again later.',
  BYOK_HTTP_401:'The API key was rejected. Check its local configuration.',
  BYOK_HTTP_403:'The provider denied access.',
  BYOK_HTTP_404:'OpenRouter returned HTTP 404. The model route or requested resource was not found; this status alone does not identify the cause.',
  BYOK_HTTP_400:'The provider rejected the requested parameters. Check model compatibility.',
  BYOK_REASONING_REQUIRED:'This model requires reasoning. Select a model that supports explanations without extended reasoning.',
  BYOK_CANCELLED_OR_TIMEOUT:'The request was cancelled or timed out. Its cost may remain unknown.',
  BYOK_BUDGET_EXHAUSTED:'The available budget or per-request limit does not allow this call.',
  BYOK_PROVIDER_CAP_REQUIRED:'The OpenRouter key spending limit does not allow this call.',
  BYOK_CONTENT_FILTERED:'The provider stopped the response because of its content filter.',
  BYOK_INTERRUPTED:'The previous request was interrupted. Its result and cost remain uncertain.',
  // Refusals before any generation. Nothing was sent to OpenRouter.
  BYOK_SCAN_REQUIRED:'Run a project scan first: the preview is built only from the captured scan. Nothing was sent.',
  BYOK_NOT_CONFIGURED:'No OpenRouter key is configured. Configure a dedicated capped key through the CLI. Nothing was sent.',
  BYOK_SCOPE_INVALID:'The question or the selected paths cannot be previewed. Use paths listed by the scan, at most 12. Nothing was sent.',
  BYOK_SENSITIVE_PATH:'A selected path looks sensitive and is never sent. Remove it from the selection. Nothing was sent.',
  BYOK_CONTEXT_BUDGET:'The selected context is larger than a preview allows. Select fewer files. Nothing was sent.',
  BYOK_EXPLICIT_CONSENT_REQUIRED:'This call needs a current preview and your explicit Send. Prepare the preview again. Nothing was sent.',
  BYOK_EXPLICIT_NETWORK_CONSENT_REQUIRED:'The connection test runs only when you request it. Nothing was sent.',
  BYOK_RETRY_INVALID:'This retry no longer matches a failed request. Prepare a new preview. Nothing was sent.',
  BYOK_CONFIG_INVALID:'The local OpenRouter configuration is invalid. Check it with the CLI. Nothing was sent.',
  BYOK_MODEL_UNAVAILABLE:'The configured model is unavailable or does not support structured output. No paid call was made.',
  BYOK_PRICE_UNKNOWN:'The model price is unknown, so no paid call was made.',
  BYOK_STORAGE_UNSAFE:'The local key storage is not private to your account. Fix it with the CLI. Nothing was sent.',
  BYOK_SECURE_STORAGE_UNAVAILABLE:'Secure key storage is unavailable on this machine. Nothing was sent.',
  BYOK_INVALID_CREDENTIAL:'The stored key is not valid. Nothing was sent.',
  // After a call was attempted: its outcome or cost may be uncertain.
  BYOK_RESPONSE_BUDGET:'The provider response exceeded the allowed size and was discarded. Its cost may remain unknown.',
  BYOK_COST_EXCEEDED_RESERVATION:'The reported cost exceeded the reservation. Further calls are blocked until you review the budget.',
  BYOK_UNAVAILABLE:'OpenRouter could not be reached or answered unexpectedly. Local observations remain available.'
};
// A refusal is shown as a sentence; an unknown code stays visible so it can be reported.
export function formatByokError(error) {
  const text=String(error?.message??error??'');
  if(messages[text])return messages[text];
  return /^BYOK_[A-Z0-9_]+$/.test(text)?`The request could not be completed (${text}).`:text;
}
const reasons={ROOT_FIELDS:'Invalid top-level fields.',ITEM_LIMIT:'Missing or oversized list.',ITEM_FIELDS:'Invalid claim fields.',TEXT_LIMIT:'Empty or oversized text.',CITATIONS_REQUIRED:'Missing or too many citations.',UNKNOWN_CITATION:'A citation is outside the approved context.',UNKNOWNS_FORMAT:'Invalid unknowns format.',HEADING_FORMAT:'The explanation section titles do not meet the required format.',COVERAGE_FORMAT:'The question-to-answer links are malformed or refer to missing sections.'};
const unknownDetails={
  UNKNOWNS_NOT_ARRAY:'The model returned the limitations section in the wrong format: it must be a list of plain text entries.',
  UNKNOWNS_ITEM_LIMIT:'The model returned more than 8 limitations.',
  UNKNOWN_NOT_STRING:'A limitation was not plain text (for example, an object or null).',
  UNKNOWN_EMPTY:'The model returned an empty limitation.',
  UNKNOWN_TEXT_LIMIT:'A limitation exceeded the 500-character limit.'
};
function validationMessage(diagnostics) {
  if(diagnostics?.validationReason==='UNKNOWNS_FORMAT'&&typeof diagnostics.validationDetail==='string'&&Object.hasOwn(unknownDetails,diagnostics.validationDetail))return unknownDetails[diagnostics.validationDetail];
  return reasons[diagnostics?.validationReason]||'Invalid format.';
}
export function renderByokPreview(preview) {
  const p=preview.packet,s=p.selection;
  const quality=preview.requestPolicy?.mode==='grounded-review';
  const plan=quality?`<p>Grounded review: up to 2 paid calls, sharing a planned total budget of ${escape(preview.requestPolicy.maxCostUsd)} USD for this explanation (not per call). At most ${escape(preview.requestPolicy.maxTokens)} output tokens per call; ${escape(preview.requestPolicy.deadlineMs/1000)}-second shared generation deadline. A corrective review is started only when at least ${escape(preview.requestPolicy.minReviewRemainingMs/1000)} seconds remain. The draft will be sent back to the same configured model for one corrective review when time allows. The whole plan must fit this budget before payment; provider-reported costs are reconciled. No automatic retries or hidden file selection.</p><p>Captured source windows: ${p.evidence.filter(e=>e.sourceExcerpt?.status==='captured-window').length}; inspect the exact content below. Windows are bounded, may omit code, and are not execution evidence.</p>`:'';
  const recovery=quality&&preview.requestPolicy?.draftRecovery==='review-deadline-only'?'<p>If the corrective review times out, the completed initial draft is saved locally as an unreviewed draft. You may open it separately; it is not a completed or verified explanation. Cancellation does not save this draft.</p>':'';
  const routingRecovery=quality&&preview.requestPolicy?.routingDraftRecovery==='explicit-no-endpoints-only'?'<p>If OpenRouter explicitly reports that no eligible endpoint is available for the review, the admitted draft is also saved locally as unreviewed. No model, privacy requirement or price ceiling is changed, and no additional call is made.</p>':'';
  return `<h3>Context to send</h3>${plan}${recovery}${routingRecovery}${p.answerPlan?details('Question checklist for the explanation',p.answerPlan):''}<p>${escape(preview.model)} · ${p.evidence.length} files selected${s?` of ${s.eligible}; ${s.omitted} not sent`:''}.</p><p>${p.includeSource?'Code descriptions and selected document excerpts included.':'Code descriptions excluded: only structure is provided.'} ${p.includeMemory?'Bounded Core context included when available.':'Core memory excluded.'}</p><p>Output limit: ${escape(preview.requestPolicy?.maxTokens)} tokens. Reasoning disabled when supported. No automatic retries.</p><ul>${p.evidence.map(e=>`<li>${escape(e.citation)} — ${escape(e.path)}</li>`).join('')}</ul><p>This selection is partial. A static relationship does not prove execution.</p>${preview.retryOf?'<p>Explicit retry: a new call may incur a charge. Review the context before sending.</p>':''}${details('View the exact outgoing content',p)}`;
}
// This disclosure is only reached for a local review deadline or an explicit
// no-endpoints review rejection, never for an arbitrary HTTP error.
// No model-supplied HTML, completion badge or automatic continuation is used.
function renderUnreviewedDraft(draft) {
  const a=draft?.answer;
  if(draft?.schema!=='idleproof.byok-draft.v1'||draft.status!=='UNREVIEWED'||draft.semanticVerified!==false||
    a?.authority!=='INFERRED'||a.proof!=='UNKNOWN'||a.requiresReview!==true||
    !Array.isArray(a.claims)||!a.claims.length||a.claims.length>8||
    !Array.isArray(a.unknowns)||a.unknowns.length>8||!Array.isArray(draft.evidence)||draft.evidence.length>20||
    a.claims.some(c=>typeof c?.text!=='string'||c.text.length>1000||!Array.isArray(c.citations)||!c.citations.length||c.citations.length>8)||
    a.unknowns.some(t=>typeof t!=='string'||t.length>500))return '';
  const sources=new Map(draft.evidence.filter(e=>e&&typeof e.citation==='string').map(e=>[e.citation,e]));
  if(a.claims.some(c=>c.citations.some(id=>!sources.has(id))))return '';
  const titles=Array.isArray(draft.presentation?.headings)?draft.presentation.headings:[];
  const parts=a.claims.map((item,i)=>`<section><h4>${escape(typeof titles[i]==='string'?titles[i]:'Draft section')}</h4><p>${escape(item.text).replace(/\n/g,'<br>')}</p>${item.citations.map(c=>{
    const e=sources.get(c);return e?.path?`<button type="button" data-ai-source="${escape(e.path)}" data-ai-snapshot="${escape(e.snapshotId)}">${escape(c)} · ${escape(e.path)}</button>`:`<span>${escape(c)} · ${escape(e?.id||'recorded source')}</span>`;
  }).join(' ')}</section>`).join('');
  const gaps=a.unknowns.length?`<h4>Draft limitations</h4><ul>${a.unknowns.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:'';
  return `<details><summary>View the saved draft — corrective review not completed</summary><p><strong>Unreviewed draft.</strong> Its format and citation identifiers were checked, not the accuracy of its claims. It may contain errors or omissions. This is not a completed review, an executed test, or Proof.</p>${parts}${gaps}<pre id="aiSourceDetail" hidden></pre></details>`;
}
export function renderByokResult(result) {
  const cost=result.reportedCostUsd==null?'Actual cost unknown; reservation retained.':`Reported cost: ${result.reportedCostUsd.toFixed(8)} USD.`;
  const review=result.review?`<p>Model review: ${escape(result.review.callsMade)}/2 calls; ${result.review.completed?'corrective pass completed, not independently verified':'incomplete; no reviewed explanation accepted'}. Costs below cover all attempted calls.</p>`:'';
  const meta=review+`<p>${escape(cost)} Duration: ${((result.latencyMs||0)/1000).toFixed(1)} s.${result.cached?' Previously recorded result; no new call.':''}</p>`;
  // New stage-aware failures keep legacy errors/rendering unchanged. A saved
  // first draft is never rendered as an INTERPRETATION or a completed review.
  const cause=result.diagnostics?.abortCause,stage=result.diagnostics?.failureStage;
  const durationSeconds=Number.isInteger(result.review?.deadlineMs)&&result.review.deadlineMs>=60000&&result.review.deadlineMs<=180000?result.review.deadlineMs/1000:60;
  if(result.status==='FALLBACK'&&result.code==='BYOK_REVIEW_TIME_INSUFFICIENT'&&stage==='review'&&result.review?.callsMade===1){
    const known=result.accounting?.knownReportedCostUsd;
    const money=Number.isFinite(known)&&known>=0&&result.accounting?.unresolvedReservedUsd===0
      ?`<p>Reported cost: ${escape(known.toFixed(8))} USD. No corrective call was attempted; its reservation was released.</p>`:'';
    return `<h3>Corrective review not started</h3><p>Less than 20 seconds remained within the shared ${escape(durationSeconds)}-second window after the draft. No second paid call was sent, and no reviewed explanation was accepted.</p>${meta}${money}${renderUnreviewedDraft(result.unreviewedDraft)}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  }
  if(result.status==='FALLBACK'&&result.code==='BYOK_CANCELLED_OR_TIMEOUT'&&['deadline','cancelled'].includes(cause)&&['preflight','draft','review'].includes(stage)) {
    const title=cause==='cancelled'?'Request cancelled':stage==='review'?'Review timed out':stage==='draft'?'Draft timed out':'Connection checks timed out';
    const notice=cause==='cancelled'?'You cancelled this request. No completed review is available.':stage==='review'?`The shared ${durationSeconds}-second deadline was reached during corrective review. No reviewed explanation was accepted.`:`The shared ${durationSeconds}-second deadline was reached before a complete draft was accepted.`;
    const a=result.accounting;
    const money=a&&Number.isFinite(a.knownReportedCostUsd)&&a.knownReportedCostUsd>=0&&Number.isFinite(a.unresolvedReservedUsd)&&a.unresolvedReservedUsd>=0
      ?`<p>Reported so far: ${escape(a.knownReportedCostUsd.toFixed(8))} USD. Unresolved reservation: ${escape(a.unresolvedReservedUsd.toFixed(8))} USD (not a confirmed charge). The total charge may still be unknown.</p>`:'';
    const draft=cause==='deadline'&&stage==='review'?renderUnreviewedDraft(result.unreviewedDraft):'';
    return `<h3>${title}</h3><p>${notice}</p>${meta}${money}${draft}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  }
  // Preserve an HTTP rejection as a failure, even when its admitted draft can
  // be inspected. Never echo the provider's free-form error text.
  const http=result.diagnostics?.httpStatus;
  if(result.status==='FALLBACK'&&(/^BYOK_HTTP_[45][0-9]{2}$/.test(result.code))&&
    (http===Number(result.code.slice(10))||result.code==='BYOK_HTTP_404')) {
    const routing=http===404&&result.diagnostics?.routingIssue==='NO_ENDPOINTS_FOUND';
    const title=stage==='review'?'Corrective review unavailable':'OpenRouter request rejected';
    const notice=routing?'OpenRouter reported that no eligible endpoint matched the request. Your model, privacy requirements and price ceilings were not relaxed.':messages[result.code]||`OpenRouter rejected the request (${result.code.replace('BYOK_HTTP_','HTTP ')}). The exact cause is not established.`;
    const a=result.accounting;
    const money=a&&Number.isFinite(a.knownReportedCostUsd)&&a.knownReportedCostUsd>=0&&Number.isFinite(a.unresolvedReservedUsd)&&a.unresolvedReservedUsd>=0
      ?`<p>Reported so far: ${escape(a.knownReportedCostUsd.toFixed(8))} USD. Unresolved reservation: ${escape(a.unresolvedReservedUsd.toFixed(8))} USD (not a confirmed charge). The total charge may still be unknown.</p>`:'';
    const draft=routing&&stage==='review'&&!result.diagnostics?.abortCause?renderUnreviewedDraft(result.unreviewedDraft):'';
    return `<h3>${title}</h3><p>${escape(notice)}</p>${meta}${money}${draft}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  }
  // Valid model-reported gaps remain a FALLBACK, never a successful interpretation.
  // Old cached failures without this optional field keep their original rendering.
  if(result.status==='FALLBACK'&&result.code==='BYOK_EMPTY_INTERPRETATION'&&Array.isArray(result.limitations)&&result.limitations.length) {
    const limits=result.limitations.filter(value=>typeof value==='string'&&value.trim()&&value.length<=500).slice(0,8);
    if(limits.length)return `<h3>More context is needed</h3><p>The model did not provide a sourced answer from this selection.</p><h4>Model-reported limits</h4><ul>${limits.map(value=>`<li>${escape(value)}</li>`).join('')}</ul><p>Review the selected files and source-description option, then prepare a new preview. Nothing will be added or sent automatically.</p>${meta}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  }
  if(result.status!=='INTERPRETATION')return `<h3>Explanation unavailable</h3><p>${escape(messages[result.code]||'The request did not complete. Local observations remain available.')}</p>${result.diagnostics?.validationReason?`<p>${escape(validationMessage(result.diagnostics))}</p>`:''}${meta}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  const sourceMap=new Map(result.evidence.map(e=>[e.citation,e]));
  const section=(title,items)=>items.length?`<h3>${title}</h3><ul>${items.map(i=>`<li><p>${escape(i.text)}</p>${i.citations.map(c=>{const e=sourceMap.get(c);return e?.path?`<button type="button" data-ai-source="${escape(e.path)}" data-ai-snapshot="${escape(e.snapshotId)}">${escape(c)} · ${escape(e.path)}</button>`:`<span>${escape(c)} · ${escape(e?.id||'recorded source')}</span>`;}).join(' ')}</li>`).join('')}</ul>`:'';
  if(result.presentation?.schema==='idleproof.byok-presentation.v1'&&result.presentation.format==='answer-first-v1'&&Array.isArray(result.presentation.headings)&&result.presentation.headings.length===result.answer.claims.length) {
    const qc=result.presentation.questionCoverage;
    const points=Array.isArray(qc?.points)?qc.points:[];
    const missing=Array.isArray(qc?.missing)?points.filter(p=>qc.missing.includes(p.id)):[];
    const incomplete=missing.length?`<p role="status">Some parts of your question have no answer link yet. This explanation needs completion.</p><ul>${missing.map(p=>`<li>${escape(p.text)}</li>`).join('')}</ul>`:'';
    const parts=result.answer.claims.map((item,i)=>`<section><h4>${escape(result.presentation.headings[i])}</h4><p>${escape(item.text).replace(/\n/g,'<br>')}</p>${item.citations.map(c=>{const e=sourceMap.get(c);return e?.path?`<button type="button" data-ai-source="${escape(e.path)}" data-ai-snapshot="${escape(e.snapshotId)}">${escape(c)} · ${escape(e.path)}</button>`:`<span>${escape(c)} · ${escape(e?.id||'recorded source')}</span>`;}).join(' ')}</section>`).join('');
    const gaps=result.answer.unknowns.length?`<h4>What the selected sources do not establish</h4><ul>${result.answer.unknowns.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:'';
    const checks=result.answer.nextTests.length?`<details><summary>Suggested checks — not executed</summary>${section('Additional checks',result.answer.nextTests)}</details>`:'';
    const coverage=qc?details('Question coverage — model-reported, not verified',qc):'';
    return `<h3>Explanation for review</h3><p>Based on the selected sources. Code-derived predictions are not executed tests or Proof.</p>${incomplete}${parts}${gaps}${checks}${meta}<pre id="aiSourceDetail" hidden></pre>${coverage}${details('Technical details and provenance',result)}`;
  }
  return `<h3>Explanation for review</h3><p>Interpretation of the selected context. This response does not validate tests, Proof or your understanding.</p>${section('What the sources show',result.answer.claims)}${section('Proposed checks — not executed',result.answer.nextTests)}${result.answer.unknowns.length?`<h3>Limitations and unknowns</h3><ul>${result.answer.unknowns.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:''}${meta}<pre id="aiSourceDetail" hidden></pre>${details('Technical details and provenance',result)}`;
}
export function formatByokStatus(s) {
  if(s.status==='CONNECTED')return `Connection checked without generation or sending project context. Model available: ${s.modelAvailable?'yes':'no'}. Structured output: ${s.structuredOutputAvailable?'yes':'no'}. Key spending limit acceptable: ${s.providerCapAcceptable?'yes':'no'}.`;
  if(s.status==='UNAVAILABLE')return messages[s.code]||'Connection unavailable.';
  return s.configured?`${s.model} · total budget ${s.budgetUsd} USD · maximum ${s.maxRequestUsd} USD per request · ${s.maxTokens} tokens. Reported spending and reservations: ${s.reservedUsd} USD. No automatic calls.`:'Configure a dedicated capped key through the CLI. Keys are not entered on this page.';
}
