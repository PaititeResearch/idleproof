# Atlas Deep Understanding — experimental integration contract

Date: 2026-10-22. Candidate base: `b8f03f9e7b98d6ae44ba1401ff0afa76f2f06cae`, PR #46. No deployment or merge is authorized by this document.

## Audit and ownership

Atlas V1 is a pure bounded projection in `atlas-graph.mjs` of the canonical Core scan, with independent declared overlays in `atlas-store.mjs`. It exposes module candidates, observed definitions and unresolved call syntax. Its source API uses Core's captured-source route. Its browser has independent zoom, edit/history and same-origin embedding contracts. None of those graph, overlay, source or browser files is changed by Deep.

The snapshot producer qualified with V1 is Core `7f043a3cbaf1b2c3e59d48bc6509a1ae627f8a23`. Core's current main observed during audit is a different revision, `61dbf48c0dcff3a7c7e569d7074570a9e5762e1c`; it must not silently replace the qualified producer. The Python extractor enumerates syntax, not sound interprocedural dispatch. Existing source identity, selection, inventory and Proof contracts are reusable. No Core or Portal code change is needed for this bounded HEAD candidate.

This first semantic producer lives in Local as an explicitly experimental adapter. It consumes immutable bytes already admitted by Core, never replaces Core facts, and can be moved behind a Core transport later. The duplicate parsing is intentional and bounded: the existing V1 summary does not contain all lexical scopes or expression spans required for resolution. A future Core migration requires a separate producer contract/branch; this candidate does not change the installed Core.

## Architecture and opt-in

Both `IDLEPROOF_EXPERIMENTAL_ATLAS=1` and `IDLEPROOF_EXPERIMENTAL_ATLAS_DEEP=1` are required. With Deep disabled, `/atlas.html` remains byte-identical to the base and its API/editor stays unchanged. Only the explicitly enabled server injects a link to a separate read-only `/atlas-deep.html`. No new parser is loaded by hooks or ordinary navigation.

The user explicitly requests analysis by POST. The loader reads only paths in the existing scan selection with extraction and source hash, checks Git regular-file mode and immutable tree, and compares exact blob bytes to the captured SHA-256. It neither reads live source content nor runs checkout, filters, build scripts, imports or project dependencies. Sensitive names and unsafe paths are refused even in forged scan data. Markdown and general context expansion are excluded. WORKTREE deep analysis is explicitly unsupported until a complete captured-byte transport is qualified.

The trusted Node worker and Python AST/data providers run outside the target directory with a minimal environment, stdin source transport and fixed tool code. This process boundary limits parser work; **it is not a sandbox for executing a target**. Runtime uses a separate fail-closed adapter. Its only permitted target is a built-in synthetic fixture selected by an explicit action; neither the API nor CLI accepts arbitrary source paths, entrypoints or commands.

## Schema and authority

`idleproof.atlas-deep.v1` binds repository identity (SHA-256 of local real path), snapshot, tree, capture profile and analysis profile. Each node/edge has path, file SHA-256, line range, provider and provider version. Python byte columns and JavaScript UTF-16 coordinates retain their provider semantics; JSON/TOML names use explicitly labelled file anchors. There is no cross-language coordinate conversion.

Nodes are source observations. `CALLS` edges are **INFERRED static** only when a provider supplies one resolved target and an exact corresponding callsite. `MAY_CALL` edges are POSSIBLE. Unknown/external sites remain in the denominator. A known syntax declaration does not prove runtime reachability. IDs include provider-defined source/scope identity; graph digest uses canonical serialization without volatile timing. Source hashes establish integrity, not producer correctness, authenticity or causal Proof.

The admission layer rejects duplicate/dangling IDs, missing source hashes, source/provider mismatches, invalid spans, unsupported authorities, mismatched callsite relations and over-budget output. External REA graphs are not accepted. Runtime records and user-declared UML never enter the static authority path. Proof remains UNKNOWN; no debt, obligation, approval or policy mutation occurs.

## Jobs, limits and storage

Analysis is asynchronous, one job per project, cancellable, with a 60-second worker limit and bounded stdout. Git operations have individual 10-second limits. Input is capped at 256 selected files, 256 KiB each and 4 MiB total. Output admission caps 30,000 nodes, 60,000 edges and 20,000 callsites. Projections show at most 150 nodes/600 edges with explicit omissions. Node old-space is capped at 384 MiB; Python providers have their own bounds. These are resource controls, not a universal OS-wide memory or availability guarantee.

The cache retains at most three graphs in the server process, bound to repository/snapshot/selection/profile. A restart requires a new explicit request. No user overlay migration, source edit, disk analysis cache or background retry is introduced. Cancelled or stale jobs never publish a replacement graph. Saved V1 annotations/history remain in their original store.

## API

All routes use the existing Local loopback/Host/Origin boundary; writes use a bounded JSON body. `/api/atlas-deep` GET defaults to `action=status` and never starts work. POST `analyze` and `cancel` require the expected `snapshotId` and `source`. POST `runtime-demo` explicitly checks isolation and runs only the fixed synthetic fixture if the check succeeds, returning its separate identity, trace and reconciliation. GET `graph` exposes calls/control/data/focused/runtime/sequence projections, GET `source` verifies snapshot/node and re-reads the exact captured blob with display redaction, and GET `export` emits the separate analysis graph. There is no paid model or arbitrary execution endpoint.

The API reports IDLE, RUNNING, READY, FAILED, CANCELLED or NO_SCAN; WORKTREE and unavailable runtime retain explicit reasons. READY means a graph was produced within its stated coverage, not that all files or semantics were understood.

## Qualification and rollback

Keep existing CI gates and performance thresholds. Compare the same V1 graph bytes and served page with Deep off; run provider positive/negative/adversarial cases, real pinned Core contracts, browser journeys, benchmark denominators and source mismatch tests. Team-authored fixtures, independent annotations, actual user capture and external repositories are separate categories. The real 16-call WSL pilot is not available from this execution host and cannot acquire PASS from a lookalike fixture.

Disable the Deep flag and restart only the isolated trial instance to return to V1. No database or overlay migration needs undoing. Candidate documentation must record which runtime isolation, browser, external corpus and human tests actually ran; unavailable facilities remain NOT_RUN rather than a weaker gate.
