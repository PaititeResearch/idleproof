import { createHash } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { inferFileRole } from './semantics.mjs';
import { readProjectSource } from './project-source.mjs';
import { loadStructureExtractions, supportsStructurePath, structureLanguageFor } from './structure-provider.mjs';
import { changedSymbolsFromLines, collectChanges } from './change-evidence.mjs';
import { detectConcepts } from './analyze.mjs';
import { isExcludedProjectPath } from './project-source.mjs';
import { sqlStatementTables } from './sql-shape.mjs';

const MAX_RELATED_FILES = 8;
const cache = new Map();

const TECHNOLOGIES = [
  ['Stripe', /\bstripe\b/i], ['Supabase', /\bsupabase\b/i], ['PostgreSQL', /\bpostgres(?:ql)?\b|\bpsycopg\b/i],
  ['MySQL', /\bmysql\b/i], ['SQLite', /\bsqlite\b/i], ['MongoDB', /\bmongodb\b|\bmongoose\b/i],
  ['OAuth', /\boauth\b/i], ['OpenID Connect', /\boidc\b|open\s?id/i], ['JWT', /\bjwt\b/i],
  ['React', /\breact\b/i], ['Next.js', /\bnext(?:\.js|js)?\b/i], ['Vite', /\bvite\b/i], ['Vue', /\bvue\b/i], ['Svelte', /\bsvelte\b/i],
  ['Prisma', /\bprisma\b/i], ['Drizzle', /\bdrizzle\b/i], ['Redis', /\bredis\b/i], ['Valkey', /\bvalkey\b/i],
  ['Kafka', /\bkafka\b/i], ['RabbitMQ', /\brabbitmq\b|\bamqp\b/i], ['Celery', /\bcelery\b/i],
  ['GitHub Actions', /github\s+actions|\.github\/workflows/i], ['Docker', /\bdocker\b/i], ['Kubernetes', /\bkubernetes\b|\bk8s\b/i],
  ['Terraform', /\bterraform\b|\.tf\b/i], ['AWS', /\baws\b|amazon web services|\bboto3\b/i], ['S3', /\b(?:aws\s*)?s3\b/i],
  ['Google Cloud', /google cloud|\bgcp\b/i], ['Firebase', /\bfirebase\b/i], ['Azure', /\bazure\b/i],
  ['Playwright', /\bplaywright\b/i], ['Vitest', /\bvitest\b/i], ['Jest', /\bjest\b/i], ['Pytest', /\bpytest\b/i],
  ['FastAPI', /\bfastapi\b/i], ['Django', /\bdjango\b/i], ['Flask', /\bflask\b/i], ['Rails', /\brails\b|active\s*record/i],
  ['Laravel', /\blaravel\b/i], ['Spring', /\bspring(?:boot)?\b/i], ['.NET', /\basp\.net\b|\bdotnet\b|\b\.net\b/i],
  ['OpenAI', /\bopenai\b/i], ['Anthropic', /\banthropic\b|\bclaude\b/i]
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stripCommentEvidence(text = '') {
  // Comments are useful to humans but are weak evidence for what code actually does. Remove the
  // common comment-only forms before extracting symbols/routes/tables/technology signals so an old
  // note cannot silently become an IdleProof "fact". Strings and executable lines stay untouched.
  const withoutBlocks = String(text)
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n');
  return withoutBlocks.split(/\r?\n/).map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//')) return '';
    if (trimmed.startsWith('--')) return '';
    if (trimmed.startsWith('#')) {
      // Preserve shebangs, Rust attributes and C/C++ preprocessor directives.
      if (/^#!|^#\[|^#\s*(?:include|define|if|ifdef|ifndef|elif|else|endif|pragma|error)\b/.test(trimmed)) return line;
      return '';
    }
    return line;
  }).join('\n');
}

function symbolsFromText(text) {
  const symbols = [];
  const patterns = [
    /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/g,
    /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b/g,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
    /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/gm,
    /^\s*class\s+([A-Za-z_][\w]*)\s*(?:\(|:)/gm,
    /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)\s*\(/gm,
    /\bfn\s+([A-Za-z_][\w]*)\s*[<(]/g,
    /\b(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|final\s+|abstract\s+)*(?:class|interface|enum|record|struct)\s+([A-Za-z_][\w]*)\b/g,
    /^\s*def\s+([A-Za-z_][\w!?=]*)\b/gm,
    /\bfunction\s+([A-Za-z_][\w]*)\s*\(/g,
    /\b(?:func|function)\s+([A-Za-z_][\w]*)\s*\(/g
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) symbols.push(match[1]);
  return unique(symbols).slice(0, 60);
}

function externalDependency(value, language = null) {
  const target=String(value || '').trim();
  if(!target||target.startsWith('.')||target.startsWith('/')||target.startsWith('#')
      ||target.startsWith('node:')||target.startsWith('file:')||target.startsWith('data:')
      ||/^[A-Za-z]:[\\/]/.test(target)) return null;
  if(['javascript','typescript'].includes(language)&&isBuiltin(target)) return null;
  if(language==='rust'&&['crate','self','super','std','core','alloc'].includes(target.replace(/^::/,'').split('::')[0])) return null;
  // Go standard and unresolved local names have no host-qualified first segment.
  // Raw imports remain available in canonical extraction; do not label them as
  // third-party task dependencies without an external-looking module path.
  if(language==='go'&&!target.split('/')[0].includes('.')) return null;
  return target;
}

function dependenciesFromText(text) {
  const dependencies = [];
  const add = (value) => {
    const cleaned = externalDependency(value);
    if (!cleaned) return;
    dependencies.push(cleaned);
  };
  for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"`]([^'"`]+)['"`]/g)) add(match[1]);
  for (const match of text.matchAll(/\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) add(match[1]);
  for (const match of text.matchAll(/^\s*(?:from|import)\s+([A-Za-z_][\w.]*)/gm)) add(match[1].split('.')[0]);
  for (const block of text.matchAll(/\bimport\s*\(([^)]*)\)/gs)) for (const match of String(block[1]).matchAll(/["`]([^"`]+)["`]/g)) add(match[1]);
  for (const match of text.matchAll(/^\s*import\s+["`]([^"`]+)["`]/gm)) add(match[1]);
  for (const match of text.matchAll(/^\s*use\s+([A-Za-z_][\w]*)::/gm)) if (!['crate','self','super','std','core','alloc'].includes(match[1])) add(match[1]);
  for (const match of text.matchAll(/^\s*import\s+([A-Za-z_][\w.]*)\s*;?$/gm)) add(match[1].split('.').slice(0, 3).join('.'));
  for (const match of text.matchAll(/^\s*require(?:_relative)?\s*[('" ]+([^'"\s)]+)/gm)) add(match[1]);
  return unique(dependencies).slice(0, 24);
}

function routesFromText(text) {
  const routes = [];
  const literal = /["'`]((?:\/api\/|\/auth\/|\/webhooks?\/|\/admin(?:\/|$)|\/v\d+\/)[^"'`\s)]*)["'`]/g;
  for (const match of text.matchAll(literal)) routes.push(match[1]);
  for (const match of text.matchAll(/\b(?:app|router|server)\.(?:get|post|put|patch|delete|use)\s*\(\s*["'`]([^"'`]+)["'`]/g)) routes.push(match[1]);
  for (const match of text.matchAll(/@(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*[rRuU]?["']([^"']+)["']/g)) routes.push(match[1]);
  for (const match of text.matchAll(/@(?:RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g)) routes.push(match[1]);
  return unique(routes).slice(0, 16);
}

function tablesFromText(text) {
  const tables = [];
  const source = String(text).split(/\r?\n/).filter((line) => !/^\s*from\s+[.A-Za-z_][\w.]*\s+import\b/i.test(line)).join('\n');
  tables.push(...sqlStatementTables(source));
  const patterns = [
    /\.(?:from|table)\s*\(\s*["'`]([A-Za-z_][\w.-]*)["'`]\s*\)/gi,
    /\b__tablename__\s*=\s*["']([A-Za-z_][\w.-]*)["']/gi
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) tables.push(match[1]);
  return unique(tables).slice(0, 24);
}

const nameParts = (value = '') => String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 3);

// Whole identifiers and their snake/camel/kebab parts: `gift_wrap_fee_cents` in a request must
// match the symbol `gift_wrap_fee_cents` and its parts.
function wordTokens(value = '') {
  const words = String(value).match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
  return new Set(words.flatMap((word) => [word.toLowerCase(), ...nameParts(word)]));
}

const CHANGE_WEIGHT = { added:60, modified:40 };

// The symbol the evidence points to, and why: a symbol the change adds or modifies, then one the
// request names. Without either, no symbol is singled out: the first declaration of a file says
// nothing about the task.
function chooseSymbol(symbols, prompt, changed = new Map()) {
  if (!symbols.length) return { symbol:null, evidence:null };
  const tokens = wordTokens(prompt);
  const scored = symbols.map((symbol, index) => {
    const exact = tokens.has(String(symbol).toLowerCase().split('.').at(-1)) ? 100 : 0;
    const hits = nameParts(symbol.split('.').at(-1)).filter((part) => tokens.has(part)).length;
    const change = CHANGE_WEIGHT[changed.get(symbol)] || 0;
    return { symbol, change, prompt:exact + hits * 10, score:change + exact + hits * 10 - index * 0.01 };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.change) return { symbol:best.symbol, evidence:changed.get(best.symbol) };
  if (best.prompt) return { symbol:best.symbol, evidence:'request' };
  return { symbol:null, evidence:null };
}

function technologiesFrom(text) {
  return TECHNOLOGIES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function preferredContextFile(session = {}) {
  const touched = [...(session.touchedFiles || [])].at(-1) || null;
  const live = session.currentResource || null;
  const capabilities = new Set(session.currentCapabilities || []);
  const reading = capabilities.has('code.read') || capabilities.has('database.read') || capabilities.has('scm.read');
  return reading ? (live || touched) : (touched || live);
}

// Symbols the change touched in a file without a parser: declarations in the added lines.
function heuristicChangedSymbols(symbols, change) {
  if (!change) return new Map();
  if (change.newFile) return new Map(symbols.map((symbol) => [symbol, 'added']));
  const declared = new Set(symbolsFromText(stripCommentEvidence(change.addedText || '')));
  return new Map(symbols.filter((symbol) => declared.has(symbol)).map((symbol) => [symbol, 'modified']));
}

function inspectTaskFile(cwd, file, prompt, admitted, extractions, evidence = new Map()) {
  const safe = admitted.get(file);
  if (!safe) {
    const fallback = { file:file || null, symbol:null, symbolEvidence:null, route:null, table:null, technologies:[], dependencies:[], importReferences:[], symbols:[],
      changed:false, newFile:false, changedSymbols:[], codeConcepts:[],
      structureCoverage:{provider:'unavailable',parsed:null,canonical:false,reason:'source-unavailable'} };
    return { ...fallback, fileRole:inferFileRole(file || '', fallback) };
  }
  const change = evidence.get(safe.relative) || null;
  const canonical = extractions.byPath.get(safe.relative);
  // A language with a canonical provider whose extraction is unavailable or rejected has no
  // structural facts: text matching cannot tell a declaration from one quoted in a string, so
  // it would present an absent symbol as observed. Only languages without a provider keep the
  // explicitly labelled legacy heuristic.
  const providerFailed = !canonical && supportsStructurePath(safe.relative);
  const structureCoverage = canonical
    ? {provider:canonical.provider,sourceSha256:safe.sha256,parsed:canonical.parsed,canonical:true}
    : providerFailed
      ? {provider:'unavailable',sourceSha256:safe.sha256,parsed:null,canonical:false,reason:extractions.reason}
      : {provider:'legacy-heuristic',sourceSha256:safe.sha256,parsed:null,canonical:false,reason:'language-adapter-pending'};
  const cacheKey = JSON.stringify([safe.absolute, safe.sha256, createHash('sha256').update(prompt).digest('hex'),
                                 canonical||structureCoverage, change ? [change.newFile, change.ranges] : null]);
  if (cache.has(cacheKey)) return structuredClone(cache.get(cacheKey));

  // The request can rank observed symbols, but cannot create file-specific facts.
  // Documentation is declared prose, including any code examples it may quote.
  const documentSource = inferFileRole(safe.relative).role === 'docs';
  const evidenceText = documentSource ? '' : stripCommentEvidence(safe.text);
  const sourceLanguage = canonical?.language || structureLanguageFor(safe.relative);
  const dataSource = ['sql','json','toml','yaml'].includes(sourceLanguage);
  const unresolvedOrigin = ['java','kotlin','csharp','ruby','php'].includes(sourceLanguage);
  const displayName = symbol => {
    const name=canonical.language==='python' ? symbol.qualified_name : symbol.qualified_name.slice(safe.relative.length+2);
    return dataSource ? name : name.split('.').at(-1);
  };
  const symbols = canonical ? unique(canonical.symbols.map(displayName)).slice(0,60)
                            : dataSource||providerFailed ? [] : symbolsFromText(evidenceText);
  // Data syntax has its own admitted facts. Values and SQL literal/query text
  // must not re-enter task facts through the legacy code-language heuristics.
  const routes = dataSource ? [] : routesFromText(evidenceText);
  const tables = dataSource ? sourceLanguage==='sql'&&canonical
    ? canonical.symbols.filter(symbol=>symbol.kind==='table').map(displayName) : []
    : tablesFromText(evidenceText);
  const importReferences = canonical ? unique(canonical.imports.map(item=>item.target)).slice(0,24) : [];
  const dependencies = dataSource||unresolvedOrigin||providerFailed ? [] : canonical ? unique(canonical.imports.map(item=>externalDependency(
    canonical.language==='python' ? item.target.split('.')[0] : item.target,canonical.language))).slice(0,24)
    : dependenciesFromText(evidenceText);
  const changedSymbols = canonical
    ? changedSymbolsFromLines(canonical.symbols.map((symbol) => ({ name:displayName(symbol), line:symbol.line, end_line:symbol.end_line })), change)
    : heuristicChangedSymbols(symbols, change);
  const choice = chooseSymbol(symbols, prompt, changedSymbols);
  // Concepts the code itself supports: what the change adds, or the inspected file when unchanged.
  const conceptText = documentSource ? '' : change ? stripCommentEvidence(change.newFile ? safe.text : change.addedText || '') : evidenceText;
  const base = {
    file:safe.relative,
    symbol:choice.symbol,
    symbolEvidence:choice.evidence,
    changed:Boolean(change),
    newFile:Boolean(change?.newFile),
    changedSymbols:[...changedSymbols].slice(0, 12).map(([name, kind]) => ({ name, kind })),
    codeConcepts:dataSource ? [] : detectConcepts(conceptText),
    route:routes[0] || null,
    table:tables[0] || null,
    technologies:unique(technologiesFrom(dataSource ? '' : evidenceText)).slice(0, 12),
    dependencies,
    importReferences,
    symbols:symbols.slice(0, 12),
    symbolCount:symbols.length,
    structureCoverage
  };
  const signal = { ...base, fileRole:inferFileRole(safe.relative, base) };
  cache.set(cacheKey, structuredClone(signal));
  if (cache.size > 160) cache.delete(cache.keys().next().value);
  return signal;
}

// At handoff the subject is the change itself: a changed production file with changed symbols, then
// a changed test file, ranked by how the request names them. A file only read is never the subject.
function changeSubject(inspected, prompt) {
  const tokens = wordTokens(prompt);
  const score = (item) => (item.changedSymbols.length ? 100 : 0) + (item.fileRole?.role === 'test' ? 0 : 50)
    + ({ added:10, modified:5 }[item.symbolEvidence] || 0)
    + nameParts(item.file).filter((part) => tokens.has(part)).length
    + (item.symbol && tokens.has(String(item.symbol).toLowerCase()) ? 20 : 0);
  return inspected.filter((item) => item.changed)
    .map((item, index) => ({ item, score:score(item) - index * 0.001 }))
    .sort((a, b) => b.score - a.score)[0]?.item || null;
}

export function extractTaskSignals(cwd = process.cwd(), session = {}, {onStructureFailure=null, structureOptions={}} = {}) {
  const prompt = String(session.prompt || '');
  const preferred = preferredContextFile(session);
  const handoff = session.status === 'complete';
  const touchedNow = unique([preferred, ...(session.touchedFiles || []).slice(-MAX_RELATED_FILES)]).filter(Boolean);
  // Handoff: the whole change (one diff and the new files). Live: only the files in view.
  const { files: changedPaths, evidence } = collectChanges(cwd, session, { only: handoff ? null : touchedNow });
  const changed = handoff ? changedPaths.filter((file) => !isExcludedProjectPath(file)).slice(0, MAX_RELATED_FILES) : [];
  const touched = unique([preferred, ...(session.touchedFiles || []).slice(-MAX_RELATED_FILES)]).filter(Boolean).slice(-MAX_RELATED_FILES);
  // The changed files come first so a long reading session cannot push them out of the bound.
  const candidates = unique([...changed, ...touched]).slice(0, MAX_RELATED_FILES);
  const admitted = new Map(unique([preferred,...candidates]).filter(Boolean).map(file=>[file,readProjectSource(cwd,file)]));
  const sources = [...new Map([...admitted.values()].filter(Boolean).map(source=>[source.relative,source])).values()]
    .filter(source=>supportsStructurePath(source.relative));
  const extractions = loadStructureExtractions(cwd,sources,{...structureOptions,onFailure:onStructureFailure});
  const inspect = (file) => inspectTaskFile(cwd, file, prompt, admitted, extractions, evidence);
  const relatedFiles = candidates.map(inspect);
  const preferredSignals = inspect(preferred);
  const current = (handoff && changeSubject([preferredSignals, ...relatedFiles], prompt)) || preferredSignals;
  const allTechnologies = unique([...(current.technologies || []), ...relatedFiles.flatMap((item) => item.technologies || [])]).slice(0, 16);
  const codeConcepts = unique([...(current.codeConcepts || []), ...relatedFiles.filter((item) => item.changed).flatMap((item) => item.codeConcepts || [])]);
  return { ...current, technologies:allTechnologies, codeConcepts, relatedFiles };
}

