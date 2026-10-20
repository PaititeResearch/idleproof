const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const details=(label,value)=>`<details><summary>${escape(label)}</summary><pre>${escape(JSON.stringify(value,null,2))}</pre></details>`;
const messages={
  BYOK_OUTPUT_TRUNCATED:'Generation reached its output limit before completing the response. Partial output is not presented as an explanation.',
  BYOK_EMPTY_RESPONSE:'The provider returned a response without usable text.',
  BYOK_EMPTY_INTERPRETATION:'The response contains no sourced explanation. This workflow still needs verification.',
  BYOK_ANSWER_REJECTED:'The response does not meet the required format or citation rules and was rejected.',
  BYOK_INVALID_JSON:'The response does not contain valid, complete JSON.',
  BYOK_HTTP_429:'The provider is currently rate-limiting requests. You can try again later.',
  BYOK_HTTP_401:'The API key was rejected. Check its local configuration.',
  BYOK_HTTP_403:'The provider denied access.',
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
const reasons={ROOT_FIELDS:'Invalid top-level fields.',ITEM_LIMIT:'Missing or oversized list.',ITEM_FIELDS:'Invalid claim fields.',TEXT_LIMIT:'Empty or oversized text.',CITATIONS_REQUIRED:'Missing or too many citations.',UNKNOWN_CITATION:'A citation is outside the approved context.',UNKNOWNS_FORMAT:'Invalid unknowns format.'};
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
  return `<h3>Context to send</h3><p>${escape(preview.model)} · ${p.evidence.length} files selected${s?` of ${s.eligible}; ${s.omitted} not sent`:''}.</p><p>${p.includeSource?'Code descriptions and selected document excerpts included.':'Code descriptions excluded: only structure is provided.'} ${p.includeMemory?'Bounded Core context included when available.':'Core memory excluded.'}</p><p>Output limit: ${escape(preview.requestPolicy?.maxTokens)} tokens. Reasoning disabled when supported. No automatic retries.</p><ul>${p.evidence.map(e=>`<li>${escape(e.citation)} — ${escape(e.path)}</li>`).join('')}</ul><p>This selection is partial. A static relationship does not prove execution.</p>${preview.retryOf?'<p>Explicit retry: a new call may incur a charge. Review the context before sending.</p>':''}${details('View the exact outgoing content',p)}`;
}
export function renderByokResult(result) {
  const cost=result.reportedCostUsd==null?'Actual cost unknown; reservation retained.':`Reported cost: ${result.reportedCostUsd.toFixed(8)} USD.`;
  const meta=`<p>${escape(cost)} Duration: ${((result.latencyMs||0)/1000).toFixed(1)} s.${result.cached?' Previously recorded result; no new call.':''}</p>`;
  // Valid model-reported gaps remain a FALLBACK, never a successful interpretation.
  // Old cached failures without this optional field keep their original rendering.
  if(result.status==='FALLBACK'&&result.code==='BYOK_EMPTY_INTERPRETATION'&&Array.isArray(result.limitations)&&result.limitations.length) {
    const limits=result.limitations.filter(value=>typeof value==='string'&&value.trim()&&value.length<=500).slice(0,8);
    if(limits.length)return `<h3>More context is needed</h3><p>The model did not provide a sourced answer from this selection.</p><h4>Model-reported limits</h4><ul>${limits.map(value=>`<li>${escape(value)}</li>`).join('')}</ul><p>Review the selected files and source-description option, then prepare a new preview. Nothing will be added or sent automatically.</p>${meta}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  }
  if(result.status!=='INTERPRETATION')return `<h3>Explanation unavailable</h3><p>${escape(messages[result.code]||'The request did not complete. Local observations remain available.')}</p>${result.diagnostics?.validationReason?`<p>${escape(validationMessage(result.diagnostics))}</p>`:''}${meta}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  const sourceMap=new Map(result.evidence.map(e=>[e.citation,e]));
  const section=(title,items)=>items.length?`<h3>${title}</h3><ul>${items.map(i=>`<li><p>${escape(i.text)}</p>${i.citations.map(c=>{const e=sourceMap.get(c);return e?.path?`<button type="button" data-ai-source="${escape(e.path)}" data-ai-snapshot="${escape(e.snapshotId)}">${escape(c)} · ${escape(e.path)}</button>`:`<span>${escape(c)} · ${escape(e?.id||'recorded source')}</span>`;}).join(' ')}</li>`).join('')}</ul>`:'';
  return `<h3>Explanation for review</h3><p>Interpretation of the selected context. This response does not validate tests, Proof or your understanding.</p>${section('What the sources show',result.answer.claims)}${section('Proposed checks — not executed',result.answer.nextTests)}${result.answer.unknowns.length?`<h3>Limitations and unknowns</h3><ul>${result.answer.unknowns.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:''}${meta}<pre id="aiSourceDetail" hidden></pre>${details('Technical details and provenance',result)}`;
}
export function formatByokStatus(s) {
  if(s.status==='CONNECTED')return `Connection checked without generation or sending project context. Model available: ${s.modelAvailable?'yes':'no'}. Structured output: ${s.structuredOutputAvailable?'yes':'no'}. Key spending limit acceptable: ${s.providerCapAcceptable?'yes':'no'}.`;
  if(s.status==='UNAVAILABLE')return messages[s.code]||'Connection unavailable.';
  return s.configured?`${s.model} · total budget ${s.budgetUsd} USD · maximum ${s.maxRequestUsd} USD per request · ${s.maxTokens} tokens. Reported spending and reservations: ${s.reservedUsd} USD. No automatic calls.`:'Configure a dedicated capped key through the CLI. Keys are not entered on this page.';
}
