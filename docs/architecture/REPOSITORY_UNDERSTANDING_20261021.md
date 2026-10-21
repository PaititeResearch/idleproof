# Repository understanding — experimental architecture and delivery contract

**Status:** experimental, isolated from the human-recipe candidate; do not merge or deploy automatically.
**Baseline:** IdleProof `1edb27b06d1a5a96bfb113b8ec854dc9831dde63`, PR #43; Core and Portal unchanged.
**User intent:** a comprehensive, reliable repository-understanding system, with technical learning, deep reverse engineering, editable UML, source-linked debt and observed agent decisions. The user's BYOK model is a replaceable interpreter, not the authority of facts.

## 1. Product promise and non-promises

The system should be the user's **traceable reference for what is known about a specific repository version**, not a claim of universal infallibility. Parsers, resolution and models have limits. A trust boundary must prevent a drawn edge or generated explanation from becoming verified implementation. A passing test only qualifies its stated scope. Unknown, unsupported, excluded, stale and failed states remain visible rather than silently becoming zero, absent or successful.

The product supports progressive technical understanding: overview -> a module -> a definition -> a typed relation -> captured source -> an optional explanation. English UI chrome is intentional. The answer language is selected by the user. Technical terms are learning material, not defects to strip unconditionally.

Markdown, prompts, registers, logs and blueprint ingestion/questioning **remain deferred as previously requested**. This experiment does not add a parser or expand provider transmission for them. The approved selection-popover/history UX work remains a separate iteration; current recipe behavior is not changed by the atlas.

## 2. One source of extracted structure, several consumers

```
Local repository / selected Git tree
    -> explicit Core capture + provider profile + coverage
    -> validated immutable Local scan projection
    -> repository graph (typed syntax + provenance + unresolved records)
          -> dependency view / definition view / UML projection
          -> focused source navigation
          -> user-model overlay (separate editable revision store)
          -> future optional BYOK explanation of approved graph context

Existing Core evidence / debt / canonical events -> explicit read-only context
Existing agent hooks -> existing policy decisions -> observed-activity view
```

No secondary engine may reinterpret an imported graph as a stronger authority than its producer. Core keeps canonical capture and assurance. Local owns interaction and private view state. Portal, when a future contract is approved, can synchronize source-free metadata and user models without converting them to Proof. This experiment does not implement that sync.

### Layers and ownership

| Layer | Owner / input | Invariants |
|---|---|---|
| Repository acquisition | Local operator; a GitHub repository is cloned explicitly | No automatic recursive cloning, submodule execution or dependency installation |
| Capture | Existing DiffWitness Core | Exact tree or WORKTREE snapshot, content hashes, parser/profile and coverage |
| Structure | Existing extractor contracts | Names are not resolution; imports are not calls; no implicit runtime observation |
| Graph projection | `atlas-graph.mjs` | Pure deterministic projection, hard bounds, source links, no execution |
| Editable UML / layout | `atlas-store.mjs` | User overlay only, optimistic revision control, private history, no source mutation |
| Safety | Existing hooks/policy engine | ALLOW/REVIEW/BLOCK remains tied to actual observed actions; map edits grant nothing |
| Debt and assurance | Existing Core/ledger | No debt derived from diagram aesthetics, duplicate code or a model opinion |
| Learning | Existing explanation and thread harness | Explicit consent, user model/provider, bounded context, cost/reservations, no mastery from prose |
| Visualization | Pinned local Cytoscape 3.34.4 | Offline runtime, no CDN or model call, accessible list alongside canvas |

## 3. Typed authority and evidence

Every extracted definition includes `snapshotId`, `path`, `sourceSha256`, line span and provider when available. Stable graph IDs are content-derived from identity components. `graphDigest` also binds the source capture, provider profile and coverage. It is integrity metadata, not a signed certificate or proof that a parser is correct.

- `OBSERVED`: a declaration or file exists in the captured syntax as reported by the producer.
- `INFERRED`: a static relationship, e.g. an import with a unique candidate; not a runtime guarantee.
- `UNKNOWN`: an unresolved/ambiguous import destination or unavailable interpretation.
- `DECLARED`: the user's planned element, relation, note or alias. This is never promoted to OBSERVED or VERIFIED.

Coverage has separate axes: original scan completeness, bounded graph projection completeness, current view/page size and unknown semantic/runtime completeness. An empty page or graph filter does not prove that an element is absent from the repository.

The current Core file relation contract admits imports. **The experiment does not invent inheritance, interprocedural call edges or sequence traces.** It shows class definitions and lexically nested declarations, preserving that containment is not ownership, composition or dispatch. Call expressions whose targets are not resolved remain an inspectable list rather than false edges.

## 4. Editable UML behavior (implemented vertical slice)

`/atlas.html` is a separate local experimental page gated by `IDLEPROOF_EXPERIMENTAL_ATLAS=1` (or the explicit server option in tests). No normal cockpit or hook imports its renderer. The default server rejects its API/page.

- Select modules, classes/interfaces or all captured definitions; search and focus a 1/2-hop neighborhood through the API; pages cap at 200 captured elements and 800 relations.
- Drag/rearrange elements, assign display aliases, attach private notes and hide elements from a view. Original labels, paths and source hashes remain unchanged.
- Add/edit/delete user components, modules, classes, interfaces and notes; edit declared member lines; add/edit/delete dependency, association, generalization and realization relationships between visible elements.
- Save explicitly, using `expectedRevision`; concurrent stale writes return `409` and are not merged silently. No autosave as a side effect of selection.
- Read revision history on request; restoring prepares a new edit, and saving appends another revision. Old records remain.
- Export JSON with facts separated from the user model, or a conservative Mermaid `classDiagram`. All user links/objects stay DECLARED. Imported file dependencies are UML dependency-style views, not inferred class composition.
- Read immutable source by node identity; the return must match the captured hash. A changed working file cannot substitute for the old cited capture.
- Optionally observe current Local tool events; live polling stops when the panel/page is hidden. No approvals are issued here. Open existing Local controls for an actual approval.
- Explicitly read received Core debt/evidence context. Missing Core context is not a zero-debt result.

This is **not** a full UML 2.x editor, code generator, XMI round-trip tool, sequence reconstructor, collaboration server, universal semantic analyzer or REA integration. Editable diagram intent does not rewrite source code. These boundaries are deliberate reliability controls, not silently implemented features.

## 5. Persistence and concurrency

User models live under `.idleproof/atlas/`, directory mode 0700 and files 0600 on POSIX. Windows uses user-local OS access; no additional encryption claim is made. Symlinks, public files, hard-linked records and oversized inputs are rejected. Revisions contain exact snapshot/graph subjects, immutable content hashes and previous-revision links. The current pointer is published by same-directory atomic rename. Locking reuses the existing owned-process lock contract.

Hash chaining detects inconsistent contents but is **not authentication against a user who controls this machine and can rewrite the whole store**. Historical records cannot claim verified code. This is separate from the authoritative Core journal and existing signed provenance.

Limits: 90 KB user overlay, 200 user elements, 500 user relations, 2,000 position/hidden entries, 500 revisions per snapshot graph and 20 revision metadata entries per history response. Hitting a limit refuses the write; it does not silently truncate the saved model. Existing known or uncertain BYOK spend is never touched.

## 6. Performance and containment

The graph engine is a local, pinned MIT renderer, loaded only on the atlas page. No React migration, no live LLM calls, no ELK dependency yet. Cytoscape's bounded preset/breadthfirst layouts are sufficient for the first experiment; add heavier layout workers only after measuring their value.

Projection compilation uses an identity-keyed WeakMap over the existing captured model. Node and edge caps are 6,000 and 16,000; omitted quantities are explicit. Lexical member grouping is ordered-stack based rather than quadratic. Browser interaction handles a bounded page plus at most 200 user nodes. Drag does not write immediately or trigger reanalysis. Rendering resets only on deliberate view edits, not every text keystroke. Hidden live-monitor panels do not poll.

An actual benchmark is recorded in the tests for 1,000 synthetic files / 3,000 nodes, with elapsed time and classification MACHINE; it is not a universal production SLA. Existing hook p95 <=150ms gates are unchanged. The experiment must not enter the hook import graph.

## 7. Deeper reverse engineering: staged extension contracts

1. **Source-level extraction qualification:** language/feature corpus for classes, interfaces, imports, aliases, type-only imports, overloads, shadowing, reflection and generated code. Report support by provider/profile, not a single universal "parsed" badge.
2. **Typed semantic graph:** definition/read/write, unique local calls, argument/return flow, and explicit unresolved/dynamic sets. No target from basename matching alone. Preserve separate structural and semantic graph identities.
3. **Optional static REA adapter:** import verified, versioned, bounded retained Evidence for an explicitly selected local artifact; require subject/content identity and schema validation. Initially no process launch, native tool install, automatic target execution or incoming prompt execution. This requires its own conformance suite and consent boundary.
4. **Feature decomposition:** derive focused neighborhoods from literal identifiers and qualified relations; business grouping starts as user-declared or model-inferred, never a fact from a folder name.
5. **Version drift:** compare captures only with compatible selection/provider profiles. Preserve snapshots and explicitly reconcile user overlays; do not carry a layout/relationship into changed source silently.
6. **Assurance and debt joins:** attach exact existing causal receipt IDs and event hashes with their scopes; graph reachability does not transitively verify a declaration or create a debt value.
7. **Agent control plane:** retain the existing tool-action policy gate. A future task-level approval contract must bind task revision, action fingerprint, permitted operations, expiry and revocation; approve a task must not become a blanket permanent allow.
8. **Learning and UML interactions:** approve the exact context for node/edge questions. Keep English UI and user-selected response language; never send the entire graph/history by default. Existing selection UX iteration remains independently testable.
9. **Optional runtime evidence / native providers:** separate safety tier, explicit target consent, sandbox/resource limits, source provenance and execution traces. A static-map click must never start it. Not implemented or enabled in this experiment.

## 8. Qualification gates

- Pure tests: determinism, duplicate identities, ambiguous/dynamic references, exact source provenance, bounded graph/page semantics.
- Write tests: fact immutability, strict shape, injection rejection, concurrency, snapshots, crash-safe pointer behavior, privacy, history integrity and limits.
- Integration: real Core capture -> atlas -> source read, changed working file retains old citation, new captured snapshot rejects old edits, target module with side effects is never executed.
- Browser: actual local server and vendored renderer; mobile/desktop/light/dark; editing, layout, notes, persistence, revision restore, stale conflict, export, source drill-down, no script errors or automatic provider/control writes.
- Regressions: unchanged Local tests, contracts, policy and hook budgets; source architecture changes isolated behind a disabled-by-default experiment.
- Human acceptance: clear distinction between fact/unknown/user model; practical navigation on at least three real repositories; source-to-diagram review; failure/conflict/staleness paths; no claim of infallibility or model-independent semantic perfection.

## 9. Research / licensing

See `REA_RESEARCH_20261021.md`. REA has been reviewed as documentation and selected source, not executed or vendored. Cytoscape alone is vendored with license, registry integrity and file SHA-256 metadata in `public/vendor/cytoscape-provenance.json`. The original package lock, dependencies and manifests are not rewritten for this experiment. Do not remove its attribution when redistributing the built asset.
