# REA static evidence adapter — proposal only

Status: DESIGN PROPOSAL. No REA package, process, native tool, MCP registration, runtime capture or external Evidence importer is implemented or enabled by the Atlas-section candidate.

## Primary-source basis

Selective reading of morluto/rea at `d2015e94f32a51b898918b5b39b374c134119fd5`, especially `docs/javascript-application-workflows.md` (structural/semantic graphs, retained views, feature traces and version/export comparisons). Upstream capability statements below are documented capabilities, not independently measured accuracy or performance in IdleProof. The public README distinguishes static JavaScript/.NET analysis from runtime operations. Do not assume upstream main, npm and this pinned commit are identical.

## Proposed purpose

The current Atlas shows Core-captured definitions, lexical membership and static import candidates. It does not resolve universal interprocedural calls. REA could be an optional **additional evidence producer**, initially for JavaScript/TypeScript/Electron artifacts, not a replacement for Core or the user's selected BYOK model.

1. **Retained evidence and focused read views.** Import an explicitly chosen static Evidence artifact and project bounded module/reference views. Benefit: a map and follow-up question need not rescan files or send a complete application graph to a model. Measure actual retained bytes, selected bytes, latency and question accuracy before claiming savings.
2. **Feature decomposition.** Use `trace_application_feature` on qualified literal seeds (module, route, API, IPC channel) to propose a technical feature neighborhood. Benefit: show how an entrypoint crosses layers rather than merely listing files. A reachable static subgraph is not an independently proven business feature or observed execution path.
3. **Semantic relations.** `trace_javascript_semantics` documents definitions/reads, local uniquely resolved calls, arguments/returns, Promise/await flow and other bounded cases, with explicit ambiguous/dynamic records. Benefit: richer caller/dependency explanations and fewer guesses supplied to modest BYOK models. Do not flatten possible call targets into actual runtime calls; preserve type-only imports separately from runtime candidates.
4. **Version comparison, later.** `compare_application_versions` and `compare_javascript_export_shapes` can support structural/API-drift review. Removal requires compatible complete coverage; unknown must not become removed. This informs inspection, not semantic equivalence or a new causal Proof/debt verdict.

## Recommended first experiment

A file-based, local, read-only adapter for **already retained static Evidence** is the narrowest pilot. No automatic install/setup or generic MCP tool exposure. Upstream trace operations that return complete reachable graphs cannot be assumed bounded by our UI pagination; isolate them with process/time/memory/output limits, reject oversized output and show an explicit unsupported/too-large result rather than silently truncate authoritative evidence.

Data boundary:

`chosen Evidence -> strict versioned validation -> subject binding -> namespaced external-evidence store -> typed Atlas projection -> optional explicitly approved BYOK context`

Validate producer/tool version, schema, complete content integrity, artifact digest, exact path/range, linked context IDs, relation endpoints, coverage, uncertainty and limits. Bind retained source bytes to the selected Core capture when exact identities exist; otherwise keep an **external artifact** visibly separate, never attribute it to a Git HEAD from a filename alone. Canonical hashes establish consistency, not trustworthiness of a producer or a trusted signature by themselves.

Store external observations under a dedicated provenance namespace and capability profile. Never overwrite Core definitions, journal, scan, normative Proof, debt, user annotations or hooks. Conflicts between producers are visible and retained. User-defined diagram edges remain DECLARED, regardless of whether an external producer disagrees.

No bytes are sent to BYOK until preview + explicit consent. Diagram analysis does not grant allow/review/block permissions. REA instructions in imported files are data, never commands. File paths must stay inside the admitted artifact; reject links/traversal, duplicate identities, malformed JSON, unknown schema and unbounded payloads. No network or target-code execution in the importer.

## Acceptance before any integration

Use multiple hand-reviewed JS/TS/Electron fixtures: imports versus calls; `import type`; aliases/shadowing; duplicate function names; closures; conditional callbacks; async boundaries; unresolved dynamic imports; stale source maps; truncated captures; mismatched subject digests. Compare the existing Core-only graph to the proposed supplementary graph. Report supported relations, false edges, unresolved cases and coverage independently. Include crash/interruption and fail-closed resource limits. A richer-looking diagram, upstream examples or passing mocked schema tests is not proof of semantic gain.

Accept the pilot only if it yields useful additional correctly attributed relations on our corpus without changing existing controls, exposing source silently, increasing hook latency or requiring every user to install a large toolchain. Report results and tradeoffs before authorizing automatic local extraction. Native binaries, browser/process instrumentation and runtime observations remain separate later opt-ins.

## User-visible value (intended, not yet delivered)

“Show the layers involved in this route”, “which local functions feed this value?”, “what did this exported API change?”, and “which edges are known versus unresolved?” These are more concrete benefits than claiming generic deep reverse engineering. Model choice remains the user's; the harness supplies scoped evidence and calibrated boundaries rather than promising to make any model infallible.
