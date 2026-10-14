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
  BYOK_INTERRUPTED:'The previous request was interrupted. Its result and cost remain uncertain.'
};
const reasons={ROOT_FIELDS:'Invalid top-level fields.',ITEM_LIMIT:'Missing or oversized list.',ITEM_FIELDS:'Invalid claim fields.',TEXT_LIMIT:'Empty or oversized text.',CITATIONS_REQUIRED:'Missing or too many citations.',UNKNOWN_CITATION:'A citation is outside the approved context.',UNKNOWNS_FORMAT:'Invalid unknowns format.'};
export function renderByokPreview(preview) {
  const p=preview.packet,s=p.selection;
  return `<h3>Context to send</h3><p>${escape(preview.model)} · ${p.evidence.length} files selected${s?` of ${s.eligible}; ${s.omitted} not sent`:''}.</p><p>${p.includeSource?'Code descriptions and selected document excerpts included.':'Code descriptions excluded: only structure is provided.'} ${p.includeMemory?'Bounded Core context included when available.':'Core memory excluded.'}</p><p>Output limit: ${escape(preview.requestPolicy?.maxTokens)} tokens. Reasoning disabled when supported. No automatic retries.</p><ul>${p.evidence.map(e=>`<li>${escape(e.citation)} — ${escape(e.path)}</li>`).join('')}</ul><p>This selection is partial. A static relationship does not prove execution.</p>${preview.retryOf?'<p>Explicit retry: a new call may incur a charge. Review the context before sending.</p>':''}${details('View the exact outgoing content',p)}`;
}
export function renderByokResult(result) {
  const cost=result.reportedCostUsd==null?'Actual cost unknown; reservation retained.':`Reported cost: ${result.reportedCostUsd.toFixed(8)} USD.`;
  const meta=`<p>${escape(cost)} Duration: ${((result.latencyMs||0)/1000).toFixed(1)} s.${result.cached?' Previously recorded result; no new call.':''}</p>`;
  if(result.status!=='INTERPRETATION')return `<h3>Explanation unavailable</h3><p>${escape(messages[result.code]||'The request did not complete. Local observations remain available.')}</p>${result.diagnostics?.validationReason?`<p>${escape(reasons[result.diagnostics.validationReason]||'Invalid format.')}</p>`:''}${meta}<p>No new call will be made automatically.</p>${details('Technical diagnostics (no key or raw response)',result)}`;
  const sourceMap=new Map(result.evidence.map(e=>[e.citation,e]));
  const section=(title,items)=>items.length?`<h3>${title}</h3><ul>${items.map(i=>`<li><p>${escape(i.text)}</p>${i.citations.map(c=>{const e=sourceMap.get(c);return e?.path?`<button type="button" data-ai-source="${escape(e.path)}" data-ai-snapshot="${escape(e.snapshotId)}">${escape(c)} · ${escape(e.path)}</button>`:`<span>${escape(c)} · ${escape(e?.id||'recorded source')}</span>`;}).join(' ')}</li>`).join('')}</ul>`:'';
  return `<h3>Explanation for review</h3><p>Interpretation of the selected context. This response does not validate tests, Proof or your understanding.</p>${section('What the sources show',result.answer.claims)}${section('Proposed checks — not executed',result.answer.nextTests)}${result.answer.unknowns.length?`<h3>Limitations and unknowns</h3><ul>${result.answer.unknowns.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:''}${meta}<pre id="aiSourceDetail" hidden></pre>${details('Technical details and provenance',result)}`;
}
export function formatByokStatus(s) {
  if(s.status==='CONNECTED')return `Connection checked without generation or sending project context. Model available: ${s.modelAvailable?'yes':'no'}. Structured output: ${s.structuredOutputAvailable?'yes':'no'}. Key spending limit acceptable: ${s.providerCapAcceptable?'yes':'no'}.`;
  if(s.status==='UNAVAILABLE')return messages[s.code]||'Connection unavailable.';
  return s.configured?`${s.model} · total budget ${s.budgetUsd} USD · maximum ${s.maxRequestUsd} USD per request · ${s.maxTokens} tokens. Reported spending and reservations: ${s.reservedUsd} USD. No automatic calls.`:'Configure a dedicated capped key through the CLI. Keys are not entered on this page.';
}
