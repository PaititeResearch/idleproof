// Pure, bounded policies shared by the network path and offline regression tests.
export const REQUEST_VERSION = 2;
export function selectEvidence(model, paths = []) {
  const files = model.files.filter(f => f.extraction);
  if (paths.length) return files.filter(f => paths.includes(f.path));
  const degree = new Map();
  for (const e of model.edges || []) for (const p of [e.from, e.to]) if (p) degree.set(p, (degree.get(p) || 0) + 1);
  const mentioned = new Set((model.intentMap?.statements || []).flatMap(s => (s.components || []).map(c => c.path)));
  const score = f => (mentioned.has(f.path) ? 100 : 0) + Math.min(30, degree.get(f.path) || 0) + (f.extraction.description?.behaviors?.some(b => b.clauses?.length) ? 5 : 0);
  const sorted = [...files].sort((a,b) => score(b)-score(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const chosen = [];
  const add = (group, n) => { for (const f of group.slice(0,n)) if (!chosen.includes(f) && chosen.length < 12) chosen.push(f); };
  const docs = sorted.filter(f => f.extraction.description?.intent?.length);
  const production = sorted.filter(f => f.role === 'production');
  const tests = sorted.filter(f => f.role === 'test');
  add(docs, 4); add(production, 6); add(tests, 2);
  add(production.filter(f => !chosen.includes(f)), 12);
  add(sorted.filter(f => !chosen.includes(f)), 12);
  return chosen;
}

export function validateAnswer(value, known) {
  // Return a fixed reason, never model-supplied text or raw completion.
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'claims,nextTests,unknowns') return 'ROOT_FIELDS';
  for (const key of ['claims','nextTests']) {
    if (!Array.isArray(value[key]) || value[key].length > 8) return 'ITEM_LIMIT';
    for (const item of value[key]) {
      if (!item || Object.keys(item).sort().join(',') !== 'citations,text') return 'ITEM_FIELDS';
      if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 1000) return 'TEXT_LIMIT';
      if (!Array.isArray(item.citations) || !item.citations.length || item.citations.length > 8) return 'CITATIONS_REQUIRED';
      if (item.citations.some(c => !known.has(c))) return 'UNKNOWN_CITATION';
    }
  }
  if (!Array.isArray(value.unknowns) || value.unknowns.length > 8 || value.unknowns.some(t => typeof t !== 'string' || !t.trim() || t.length > 500)) return 'UNKNOWNS_FORMAT';
  return null;
}

export function completionDiagnostics(result) {
  const u = result?.usage || {}, choice = result?.choices?.[0];
  const count = v => Number.isInteger(v) && v >= 0 ? v : null;
  const finish = choice?.finish_reason;
  return {
    finishReason: ['stop','length','content_filter','tool_calls','error'].includes(finish) ? finish : 'unknown',
    inputTokens: count(u.prompt_tokens), outputTokens: count(u.completion_tokens),
    reasoningTokens: count(u.completion_tokens_details?.reasoning_tokens),
    contentPresent: typeof choice?.message?.content === 'string' && choice.message.content.trim().length > 0
  };
}

export function reasoningOptions(model) {
  if (!model.supported_parameters?.some(p => ['reasoning','include_reasoning'].includes(p))) return {};
  // This feature summarizes bounded evidence; reserve the small output budget for
  // the answer. require_parameters prevents silent routing to an incompatible endpoint.
  // Mandatory-reasoning models must be selected/configured separately, not retried silently.
  if (model.reasoning?.mandatory) throw new Error('BYOK_REASONING_REQUIRED');
  return {reasoning:{enabled:false}};
}
