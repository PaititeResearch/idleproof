# REA assessment for DiffWitness / IdleProof

Reviewed 2026-10-21 at **morluto/rea `d2015e94f32a51b898918b5b39b374c134119fd5`**. This is a selective source/doc review, not a security audit, integration test, performance measurement, or live execution of REA.

## Sources inspected (primary)

- README: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/README.md
- JavaScript/application workflows: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/docs/javascript-application-workflows.md
- CLI/Evidence: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/docs/cli.md
- Completion ledger implementation: https://github.com/morluto/rea/blob/d2015e94f32a51b898918b5b39b374c134119fd5/src/domain/evidenceCompletionLedger.ts
- Repository license metadata reports MIT; any later code reuse must include the actual upstream license and copyright notices.

## What the inspected material supports

REA is an agent-facing MCP/CLI analysis toolkit covering applications, native binaries and runtime investigations. Its documented static JS/.NET workflows read artifacts without executing the application; runtime workflows are different operations with effects. It is not an UML renderer and does not make an arbitrary LLM infallible.

The JavaScript workflow documents a structural Application Graph and a separate semantic relation graph, tied to artifact/content identity. It distinguishes static source observations, passive runtime observations, relationship inferences and unavailable facts. It documents exact selected projections, retained provenance, source ranges, paginated views, unresolved boundaries and caller-selected semantic tracing. It explicitly treats TypeScript type-only declarations differently from runtime dependencies, with unresolved compiler assumptions retained.

The CLI guide recommends retaining the full Evidence and asking for small summary/module views, rather than placing a very large evidence object in an agent context. Its size examples are upstream examples, not benchmarks run for IdleProof.

The inspected `evidenceCompletionLedger.ts` implementation uses strict records keyed by claim IDs and evidence IDs; statuses include pass/fail/unsupported/truncated/unknown. It canonicalizes and hashes records, checks sorted unique identities, recomputes summary counts and only marks complete when all records pass. This is directly relevant as a contract-design reference, not proof that all producers are correct.

## Useful design transfers (our assessment)

1. **Separate structure, semantics and runtime.** We keep source definitions and static import candidates distinct; unresolved calls are not connected by name heuristics.
2. **Artifact-bound identities.** Our graph and edits bind to exact scan/profile/content identities; edits cannot upgrade evidence authority.
3. **Read views over retained evidence.** A map view is a bounded projection with explicit counts, not a new full scan or an unbounded prompt.
4. **First-class unknowns.** An empty filtered view cannot establish absence. Unsupported and omitted areas remain visible.
5. **Complete accounting is not optimistic success.** Strict completeness outcomes are an excellent future reference for adapter qualification, but no copied REA ledger is installed here.

## Why REA is not installed wholesale now

The project also exposes process/browser/native instrumentation, external analysis backends and setup integration with coding agents. Those are distinct capabilities and trust boundaries. Installing it as an automatic action behind a map click would expand the attack/effect surface and violate the present scan-only scope. The reviewed README requires newer Node versions than this development container's Node 22.16.0. We did not execute its setup, install native providers, open target processes, copy its source or issue a live model call.

A future adapter should start with explicitly supplied retained static Evidence, enforce the upstream schema/version and subject digest, preserve authority/coverage, reject mismatched or oversized artifacts, and never treat an external producer result as an existing DiffWitness causal Proof. Dynamic execution requires a separate consented, sandboxed capability. Such an adapter is **NOT implemented** by this experiment.

## Graph runtime choice

Cytoscape.js 3.34.4 (MIT) supplies pan/zoom, selection, dragging, accessible companion-control integration and bounded layout; the application owns semantic correctness. We vendor the exact runtime locally, preserve LICENSE, and record npm integrity + SHA-256 files. No CDN at runtime. Official references: https://js.cytoscape.org/ and https://github.com/cytoscape/cytoscape.js/releases/tag/v3.34.4 . ELK, Mermaid rendering, Structurizr and PlantUML are not installed. Mermaid is a **text export** only, never an evaluation of user-provided DSL.
