# Atlas Deep Understanding: producer research and integration decision

Research date: 2026-10-22. This is a read-only source review, not a performance or correctness certification of an external analyzer. No REA package was installed, no REA tool was executed, and no target application was run for this comparison.

## Decision

Keep the first Python resolver internal and source-bound, with a versioned producer contract that can later move into Core without changing Atlas V1. For JavaScript/TypeScript, evaluate a pinned compiler/parser behind the same contract. Do not make REA a mandatory dependency or claim an integrated REA adapter in this candidate: its incremental accuracy, recall and resource cost have not been measured on the Atlas corpus. A retained-Evidence importer remains a separately qualified extension.

This decision is about evidence currently available. It does not establish that REA is inferior. REA's retained evidence, separate structural/semantic graphs, explicit uncertainty and application-boundary analysis are useful design references. The integration gate requires measured additional correct relations, not a larger graph.

## Revisions and evidence examined

The GitHub connector confirmed public `morluto/rea`, default branch `main`, and the requested revision `d2015e94f32a51b898918b5b39b374c134119fd5`. At the time of this review, current main was `edccb430c4ace4595ceff71e1b837351e7634938`, dated 2026-10-22 13:52:01 UTC. Both inspected package manifests report 6.7.0; this is repository metadata, not verification of an npm release.

The pinned manifest has 42 direct production dependencies, including Babel parser/types 8.0.4, and requires Node `^22.19.0 || ^24.11.0 || >=26.0.0`. Those requirements differ from IdleProof's Node >=20 baseline. Dependency count is measured from the manifest; installation size, transitive count and startup cost were not measured.

Targeted comparison with current main found:

| Inspected path | Comparison with requested revision |
|---|---|
| `docs/javascript-application-workflows.md` | Identical blob content |
| `src/application/javascript/JavaScriptSemanticGraphEvidence.ts` | Identical blob content |
| `src/domain/javascript/javascriptSemanticResourceLimits.ts` | Identical blob content |
| `src/domain/javascript/javascriptSemanticCallResolution.ts` | Source-range containment moved to a shared helper |
| `src/domain/evidenceCompletionLedger.ts` | Canonical digest/order helpers and integer schema code refactored |
| `docs/javascript-application-graph.md` | Adds `accesses` to the documented relation vocabulary |
| `LICENSE` | Same MIT license blob |

This is a targeted comparison, not an audit of every change between the commits. Pin artifact identity and supported schema separately from package version.

## What the source review establishes

The [application graph contract][rea-graph] defines distinct authorities and states, source/artifact locations, extractor versions, coverage, limitations and content-derived commitments. It rejects inconsistent graph identities and dangling relationships. Its domain model itself does not set aggregate graph-size limits: Atlas therefore needs its own admission limits before parsing/importing an external graph. A correct digest checks consistency, not truth or trusted authorship.

The [workflow documentation][rea-workflows] distinguishes retained module queries, graph traversal, semantics and comparisons. It explicitly preserves type-only declarations, incomplete source coverage, ambiguous matching and dynamic unknowns. Its shared `evidence_contexts` representation requires context lookup when recovering provenance; importing only individual facts would lose authority. Reachability is not runtime execution. Graph and export-shape comparisons are useful inspection mechanisms, not equivalence proofs.

The inspected [local-call resolver][rea-resolver] resolves direct local callables and identifiers through binding/read-position facts. Conditional alternatives retain candidate sets. Missing imported initializers are unresolved at this local stage; this file alone does not establish complete intermodule call support. Cycles and unsupported projected targets remain incomplete. This makes it inappropriate to translate every upstream `calls` edge into a certain Atlas `CALLS` relation without checking resolution and coverage.

The [semantic evidence producer][rea-evidence] assigns syntax observations and static inferences different authorities. The [resource-limit module][rea-limits] exposes bounds on candidate alternatives, nesting, getter/alias work and primitive JSON bytes, with explicit unknown outcomes. These bounds do not establish an overall process memory bound. The [completion ledger][rea-ledger] keeps pass, fail, unsupported, truncated and unknown separately; complete means all recorded claims passed, not universal program understanding.

## Producer comparison

| Approach | Concrete fit | Principal cost or limitation | License/source status |
|---|---|---|---|
| Internal Python AST resolver | Direct control over scope rules, source identity, no target imports, conservative call classification | Team owns semantic correctness; AST alone does not resolve bindings or dynamic behavior | Python standard-library API; retain interpreter version |
| Existing Tree-sitter extraction plus resolver | Reuses multilingual concrete syntax and source ranges | Parser output is not interprocedural resolution; every language needs semantic rules | Tree-sitter core MIT; individual grammar licenses must be checked |
| TypeScript Compiler API | Source AST, symbols, declarations, module-resolution hooks; suitable for a bounded in-memory project | Type-system identity is not a guaranteed runtime target; compiler options and declaration files need distinct treatment | Microsoft TypeScript Apache-2.0 |
| Language-service interface | Navigation/reference facilities with established project model | Background project reads, version skew and server lifecycle add complexity; no measured advantage here | Depends on the selected server; no server selected or installed |
| REA retained static Evidence adapter | Application/bundle/Electron boundaries, provenance-rich graph queries and comparisons | Additional schema/version boundary, large dependency surface if extraction is bundled, independent qualification still required | REA-authored code MIT; dependency and external-tool terms remain separate |
| Hybrid | Core capture remains canonical; supplementary producers retain their own authority | Requires conflict handling and exact artifact/source binding | Per-producer notices and versions required |

Tree-sitter describes itself as an incremental concrete-syntax parser, including recovery for malformed input. That supports inventory and locations, not a claim of semantic completeness. The TypeScript compiler API exposes a configurable host and a checker; an Atlas host should read only admitted captured bytes and avoid emission, dependency installation and target-code loading. The official API wiki currently warns that its examples cover TypeScript <=6.0 and that 7.1 changes the API. Pin the implementation version and reject unsupported versions.

Type-only imports require a specific negative test: `import type { A }` and `import { type A }` are not interchangeable for side effects under `verbatimModuleSyntax`; the latter can emit an empty import. Unknown compiler options must stay visible instead of creating an assumed runtime edge.

## Required adapter admission contract

1. Accept a user-selected, already retained static artifact; do not install REA, register MCP or launch analysis implicitly.
2. Apply byte/depth/collection limits before graph expansion. Reject unknown versions, dangling context references, duplicate IDs and inconsistent commitments.
3. Match exact source bytes, paths, source coordinates and root identity to the chosen Core snapshot. Unmatched artifacts remain external; labels and filenames are insufficient.
4. Preserve producer authority, ambiguity, omitted counts and limitations. Keep conflicts between producers. Never overwrite Atlas V1, user annotations, Proof or debt.
5. Test forged authority, stale identity, Unicode/path ambiguity, oversized graphs, unsupported schemas, type-only imports, shadowing, conditional callbacks and dynamic targets.
6. Admit semantic relations only after independent expected-edge comparison. Report all supported, unsupported and unresolved sites in denominators.

Runtime operations require their own verified isolation and consent boundary. A static importer is not authorization for process instrumentation. REA runtime functionality was not evaluated here.

## Measurement ledger

| Measurement | Result in this review |
|---|---|
| Git revision and selected blob comparison | Executed, as recorded above |
| Direct REA dependency count / engine floor | Executed from pinned manifest: 42 / Node constraints above |
| External producer precision, recall, false positives | NOT_RUN |
| External producer CPU, duration, memory, package size | NOT_RUN |
| REA versus Atlas corpus comparison | NOT_RUN |
| REA runtime isolation / instrumentation | NOT_RUN |
| Real `projet-multicouche` 16-call comparison | Not established by this research review |

No semantic winner is asserted from unexecuted benchmarks. Candidate-internal measurements belong in the qualification report and must distinguish team-authored fixtures from independently annotated repositories and the actual user's capture.

## Primary sources

REA links below are pinned to the requested revision; current-head comparison is separately identified above.

- [REA package manifest][rea-package], [license][rea-license], [third-party notices][rea-notices].
- [REA application graph][rea-graph], [workflow contracts][rea-workflows], [call-resolution implementation][rea-resolver], [semantic authority construction][rea-evidence], [resource limits][rea-limits], [completion ledger][rea-ledger].
- [Current main examined](https://github.com/morluto/rea/commit/edccb430c4ace4595ceff71e1b837351e7634938).
- [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [type import emission](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html), [TypeScript license](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt).
- [Tree-sitter introduction](https://tree-sitter.github.io/tree-sitter/), [core license](https://github.com/tree-sitter/tree-sitter/blob/master/LICENSE).
- [Python AST API](https://docs.python.org/3/library/ast.html): version-dependent grammar and UTF-8 byte offsets require an explicit coordinate contract.

[rea-package]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/package.json
[rea-license]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/LICENSE
[rea-notices]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/THIRD_PARTY_NOTICES.md
[rea-graph]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/docs/javascript-application-graph.md
[rea-workflows]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/docs/javascript-application-workflows.md
[rea-resolver]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/src/domain/javascript/javascriptSemanticCallResolution.ts
[rea-evidence]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/src/application/javascript/JavaScriptSemanticGraphEvidence.ts
[rea-limits]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/src/domain/javascript/javascriptSemanticResourceLimits.ts
[rea-ledger]: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/src/domain/evidenceCompletionLedger.ts
