# Atlas Deep JavaScript / TypeScript provider

Implementation reviewed: `src/atlas-deep-javascript.mjs`, 22 October 2026. This document describes the implemented parse-only provider, not the wider capabilities of the TypeScript compiler or a promise of complete JavaScript semantics.

## Integration and trust boundary

The provider imports the vendored TypeScript **5.9.3** parser and checks `ts.version` against that exact value. The vendored bytes and notices are recorded in `src/vendor/typescript-5.9.3/PROVENANCE.md`. Version changes require a new qualification; the candidate does not load whichever TypeScript version happens to be installed in the target project.

The input contains immutable source strings selected by the existing Core capture, their content hashes and a snapshot/repository identity. `analyzeJavaScript(input)` invokes `ts.createSourceFile` and an internal lexical resolver. It does not create a compiler program/host, type checker or language server; read `tsconfig.json`; install dependencies; load target packages or plugins; execute the target; or emit JavaScript. `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts` and `.tsx` files can be parsed. Parsing a `.cjs` file does not mean CommonJS resolution is supported.

Local runs occur in the bounded analysis worker, outside hooks. The provider returns a versioned producer result which the shared admission layer checks against selected file hashes, source spans, graph endpoints and authority rules. It cannot replace Core observations, Atlas V1 overlays, Proof conclusions, debt or agent permissions. Parser/provenance consistency does not prove that every resolver rule is correct.

## Implemented scope

| Construct | Current behavior |
|---|---|
| Lexical function declaration | A unique declaration in the qualified module/lexical scope can resolve to its source definition. Recursion and nested functions are covered. |
| Closures | A direct arrow/function expression, direct IIFE or qualified `const` alias can resolve. Callback parameters and callable return values remain unknown. |
| ESM imports | Relative direct/default/named/namespace imports and explicit named re-exports can resolve through captured sources. Package imports remain external. |
| Local module paths | Exact paths or one unique supported extension/index candidate are admitted. Multiple candidates remain unknown. No package exports, compiler aliases, host filesystem search or loader conditions are applied. |
| Simple construction | `new` on a unique non-decorated, non-derived class can identify the class binding. This is not a resolved constructor dispatch graph or an assertion of execution. |
| Methods and properties | Declarations are retained. Arbitrary object/property/computed dispatch, overrides and inheritance remain unresolved. A qualified ESM namespace export is a narrower supported case. |
| TypeScript declarations | Interfaces, namespaces and enums have source nodes where implemented. Type aliases are not expanded into semantic nodes; namespace runtime-object dispatch is unsupported. |
| Async / conditions / returns | `AWAITS`, `BRANCH` and `RETURNS_TO` retain syntax with exact source spans. No execution, scheduling, complete CFG or branch reachability is claimed. |
| Argument dependencies | An identifier argument may reference its lexical binding through `PASSES_ARGUMENT`. Values, callee-parameter mapping and interprocedural transformations remain unknown. |
| Events / cross-service calls | Ordinary call syntax is retained. No `EMITS`/`SUBSCRIBES` runtime relationship, HTTP route matching, IPC or frontend/backend contract inference is implemented. |

`CALLS` is **INFERRED**, identifies exactly one qualified binding target and references the retained call site. The contract assumes the captured initialized lexical bindings; it does not establish whether an invocation succeeds, is reachable or ever happens. A name match alone is insufficient. This provider currently withholds unresolved targets rather than manufacturing candidate sets; its ambiguous counter can therefore be zero even when ambiguous module-path cases are retained as `UNKNOWN`.

## Conservative scope and mutation rules

The resolver creates separate scopes for blocks, function parameters/bodies, loop bindings, catches, switches and TypeScript namespaces. Parameters shadow enclosing names. In particular, parameter default expressions cannot borrow a declaration from the function body: a call in a default is resolved against its parameter/enclosing environment. Named function expressions have their own local binding.

Captured mutations invalidate a previously unique callable binding throughout the analysis. This intentionally sacrifices flow-sensitive recall: a call textually before a later assignment can remain unknown. Mutable initializers, destructured callable values, duplicate declarations, cyclic aliases, excessive alias depth, conditional Annex B function declarations and unsupported constructs cannot silently acquire a unique target.

The independent adversarial review exposed scope/mutation cases which are now explicitly covered:

- Switch lexical declarations cannot escape their switch scope.
- Array/object rest assignments invalidate the affected callable binding.
- Enum initializer and class static-block assignments are visited.
- Class heritage expressions, computed method names and decorator expressions are visited in the enclosing environment, including side-effecting assignments.
- Parameter/variable destructuring defaults are visited; assignments inside them cannot leave an outer binding falsely certain.
- `new C()` before a class declaration completes is withheld. A `const` alias initializer cannot borrow a later lexical value.
- Namespace members and external properties cannot be substituted with an identically spelled lexical declaration.

Captured reassignment of an exported function also prevents an imported live binding from becoming certain. Decorated declarations retain an unknown effective target. Direct `eval`, `with`, or an `eval` identifier makes the file's lexical resolution conservative. This does not detect every conceivable form of dynamic code injection; external mutation, hot reload, custom module loaders and code outside the selected capture remain explicit assumptions/limitations.

Shared-script globals are outside the qualified module profile. A plain script's top-level `function f(){}` followed by `f()` does not receive an assumed private module binding merely because the parser can read it. CommonJS, `import =`, export-star, package dependencies, compiler path aliases, overload/type-checker dispatch and compilation-specific transforms are not resolved.

## Type-only imports: source facts and emitted effects

Type-only imports/exports cannot supply a runtime call target. An admitted type-only source dependency is represented as `TYPE_IMPORTS`, not as a runtime execution edge. Both `import type { T }` and an all-type named import such as `import { type T }` are kept out of callable resolution.

The latter form is **not** a guarantee of no module side effects. With `verbatimModuleSyntax`, an all-type named import can become an empty import while a whole-statement `import type` is erased. The provider does not load compiler options or emit code, so its type-only dependency resolution explicitly says **emitted module side effects UNKNOWN without compiler options**. `IMPORTS` itself denotes a captured module-path relation; it does not establish runtime loading. See the [official TypeScript explanation](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html).

## Source identity, coordinates and determinism

Every node/edge/call site retains snapshot, exact path, SHA-256, one-based line/end line, column/end column, language, producer name and producer version. TypeScript columns are the parser's zero-based UTF-16 code-unit positions, with exclusive end positions; they must not be silently interpreted as Python UTF-8 byte offsets. Cross-language consumers should use the language/provider contract when interpreting columns. The current source UI opens by line and content hash.

Node IDs include repository/snapshot, path, syntax kind and source position. Equal admitted inputs produce deterministic results; a new snapshot separates identities. Content hashes are checked before parsing and again in shared admission. A hash establishes byte consistency, not authenticated authorship or semantic truth.

Files with parser diagnostics retain a module-level source node plus bounded diagnostic codes and no function/call-resolution output from that malformed file. Importers cannot resolve through its incomplete declarations. Unsupported/malformed sources and unknown/external sites remain in coverage. No semantic completeness percentage is asserted.

## Resource limits and dependency cost

Provider limits are 256 input files, 262,144 bytes per file, 4,194,304 total input bytes, 28,000 nodes, 56,000 edges, 19,000 call sites, traversal depth 500 and alias/re-export resolution depth 64. The enclosing worker adds its own timeout/output/memory limits and stricter admission. Hitting a provider limit rejects the result; it is not relabelled as complete.

The vendored parser is 9,112,572 bytes; license and third-party notices bring the retained vendor payload to 9,159,593 bytes, excluding provenance documentation. These are disk-byte measurements, not memory or latency measurements. Worker startup/analysis metrics are reported by the integration layer; no claim of a complete TypeScript program being type-checked is made.

## Executed qualification and limits

The following command was executed on the current integrated candidate with Node 24.19.0:

```bash
node --test test/atlas-deep-javascript.test.mjs test/atlas-deep-semantic-review.test.mjs
```

Result: **48 tests passed, zero failed, zero skipped**. This combined run includes the 19 JS-provider tests and the independently authored cross-language semantic-review cases. Its local diagnostic log is a work artifact, not a claim of exact-head GitHub CI or human acceptance. The independent suite includes Python cases, so the total must not be reported as 48 JS-only tests.

The JS cases cover qualified targets and negative cases, aliases/re-exports, lexical shadowing and defaults, mutation, type-only imports, dynamic/returned callables, absent dependencies, construction, malformed source, eval, shared scripts, namespaces, preinitialization, deterministic identities, syntax-only async/data observations, bounds and a sentinel proving the malicious target was not executed during analysis. The independent review adds the cases listed above.

All these are authored qualification fixtures, not an independently annotated open-source benchmark, a runtime equivalence proof or validation of the user's historical project. Broader correctness, compiler-version variants, large real-world repository recall and REA comparative precision/performance remain unqualified unless recorded separately in the candidate's qualification report.
