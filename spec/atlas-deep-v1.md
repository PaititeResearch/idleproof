# Atlas Deep v1: static graph, provider and runtime contracts

Status: experimental implementation contract, 2026-10-22. Static schema: `idleproof.atlas-deep.v1`. Analysis profile: `atlas-deep-static-1`. This document describes the implementation in this branch; it does not qualify arbitrary programs or introduce a replacement for Core Proof or Atlas V1.

The authoritative implementation is [atlas-deep.mjs](../src/atlas-deep.mjs), with [worker](../src/atlas-deep-worker.mjs), [process bounds](../src/atlas-deep-process.mjs), [API](../src/atlas-deep-api.mjs), [Python provider](../src/atlas-deep-python.py), [JavaScript/TypeScript provider](../src/atlas-deep-javascript.mjs), [data provider](../src/atlas-deep-data.py), [runtime adapter](../src/atlas-deep-runtime.mjs) and [tracer](../src/atlas-deep-tracer.py). The separate runtime schemas are `idleproof.atlas-runtime.v1` and `idleproof.atlas-runtime-reconciliation.v1`.

## 1. Boundary and versioning

The static layer parses captured source bytes as data. It does not import target modules, resolve installed dependencies, invoke project scripts, load a target `tsconfig`, compile/emit code, or run a user program. The worker is a bounded trusted analyzer process, not a sandbox for executing target code. REA results and arbitrary external providers have no public ingestion endpoint in v1.

The server requires both `IDLEPROOF_EXPERIMENTAL_ATLAS=1` and `IDLEPROOF_EXPERIMENTAL_ATLAS_DEEP=1`. GET requests do not start analysis. A separate explicit Core scan must already exist. Deep does not expand the Core selection or write source, V1 overlays, debt, policy or Proof.

Schema, analysis profile and producer version are separate identifiers. A consumer must retain all three and must not reuse a result across identities merely because its filenames or labels are unchanged. New semantics require an explicitly reviewed profile/producer change; consumers must not infer compatibility from a provider's display name. The current Python interpreter patch version is reported separately from its adapter version. JavaScript uses the bundled TypeScript parser at exactly `5.9.3` and checks that version at runtime.

## 2. Captured input and identity

The analyzer transport has this shape:

```text
{
  identity: {
    repositoryId, snapshotId, tree, source,
    profile, captureProfile, syntheticFixture
  },
  files: [{path, sourceSha256, content}],
  coverage: {...}
}
```

For normal project analysis:

| Field | Meaning |
| --- | --- |
| `repositoryId` | SHA-256 of the local repository's resolved real path; a local identity, not a portable remote repository identifier. |
| `snapshotId` | Core identifier matching `^dwscan_[a-f0-9]{64}$`. |
| `tree` | Immutable Git tree object identity, 40 or 64 lowercase hexadecimal characters. |
| `source` | Exactly `HEAD`. Deep `WORKTREE` analysis is unsupported. |
| `profile` | `atlas-deep-static-1`. |
| `captureProfile` | Core header profile, or `null`. |
| `syntheticFixture` | Whether the capture profile explicitly declares a synthetic fixture. |
| `sourceSha256` | SHA-256 of the exact captured file bytes, independent of Git's object hash. |

Input comes from an admitted `idleproof.project-scan.v1` model with at most 20,000 inventory records. Only records with both extraction and a source hash are candidates. Paths must be relative, nonempty and unique, with no backslash, colon, control character, empty component, `.` or `..`. Sensitive filenames and excluded directories are refused by the loader even if supplied in a forged scan. Markdown and general context files are not added.

Candidate suffixes are case-sensitive: `.py`, `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.tsx`, `.json`, `.toml`, `.sql`, `.yaml`, `.yml`. Recognition by this list means eligible for provider dispatch, not full semantic support. Other admitted suffixes count as unsupported.

The loader enumerates the specified immutable tree and accepts only regular blobs with modes `100644` or `100755`. It obtains blob size and bytes by object identity, verifies the exact SHA-256, decodes strict UTF-8 and rejects NUL bytes. It does not read current working-tree source bytes. Git runs with lazy fetching, replacement objects, prompts, optional locks, fsmonitor and network protocols disabled; missing local objects cause failure rather than a fetch.

Files are considered in path order. File/count/total-byte excess is explicitly counted as `omittedByLimit`; invalid identity, encoding or provenance fails the analysis. The `files[].content` transport is not included in the exported graph.

## 3. Provider result envelope

The worker selects providers from the supplied suffixes and returns an array of results. Each result contains:

```text
{
  provider: {name, version, ...producerMetadata},
  nodes: [...], edges: [...], callSites: [...],
  capabilities: {...}, coverage: {...}, limitations: [string, ...],
  status?: "READY" | "PARTIAL" | "COMPLETE",
  metrics?: {...}
}
```

Admission accepts at most four distinct provider names. Name and version are nonempty strings of at most 100 characters; names match `^[a-z][a-z0-9-]+$`. Duplicate provider names, missing required arrays, an `error` member with a truthy value, or any other truthy `status` fail admission. Status is absent in the current JavaScript and successful data result envelopes. `READY` means that a result exists within its stated coverage; it does not mean complete semantics.

Every node, edge and callsite must name the enclosing provider and its exact version in its source reference. Current producers are:

| Provider / version | Qualified behavior | Explicit boundary |
| --- | --- | --- |
| `python-ast` / `1` | Python `ast` syntax; conservative lexical calls, unique unchanged aliases, exact captured imports, closures, plain class bindings/direct methods, partial normal-flow and lexical data relations. `provider.runtime` records the interpreter version. | No installed-module loading, source-root guesses, instance/polymorphic dispatch, complete CFG, reaching definitions, runtime values or execution proof. Dynamic/rebound/conditional targets remain possible or unknown. A class target does not establish `__new__`, `__init__` or metaclass dispatch. |
| `typescript` / `5.9.3` | Parse-only JavaScript/JSX/TypeScript/TSX; qualified lexical functions, constant aliases, direct closures, selected ESM imports/named re-exports and simple class construction. | No type checker, emit transforms, compiler options/path aliases, CommonJS semantics, shared-script global resolution, arbitrary property dispatch, complete CFG or runtime behavior. Files with parse diagnostics do not produce semantic relations. |
| `data-stdlib` / `1` | Full JSON parsing with duplicate decoded keys and nonstandard numeric constants rejected; TOML parsing when `tomllib` exists; bounded key/object inventory. | No retained scalar values. SQL/YAML independent validation, cross-language name links and exact key coordinates are unsupported. TOML object nodes do not assert an explicit section header. |

All providers receive the selected input envelope. Provider denominators consequently differ: Python counts Python files, JavaScript also records unsupported supplied suffixes, and the data adapter records every supplied file, including unsupported languages. These counters must not be summed into a repository-wide file percentage.

Provider capability and coverage objects are open, producer-specific metadata in v1. Admission does not validate a closed capability enum or a universal coverage schema. The worker's fixed dispatch is the producer-selection boundary; structural admission is not an authentication protocol for arbitrary provider JSON.

## 4. Source references and record identity

All static graph records carry:

```text
source: {
  snapshotId, path, sourceSha256,
  line, endLine, column?, endColumn?,
  language, provider, providerVersion,
  locationScope?: "file-anchor" | "exact-span"
}
```

Lines are one-based. Columns, when present, are zero-based and retain the producer's coordinate system: Python AST columns are UTF-8 byte offsets; TypeScript parser columns are UTF-16 code-unit offsets. End coordinates are exclusive where supplied by those parsers. They are not interchangeable units. AST producers currently omit `locationScope`; Python module references use the opening position, while JavaScript module references span the file. A missing scope marker alone is not evidence of an exact token location.

Data nodes always use `line:1`, `endLine:1`, `column:null`, `endColumn:null`, `locationScope:"file-anchor"`. This means “open this verified file”, not “the key occurs on line 1”. A consumer must display this distinction and must not invent a key location.

Admission requires a captured path, matching snapshot/hash, valid language for the actual suffix, and a registered producer/version. Start/end lines must be ordered and within the supplied content's line count. Non-null columns must be integers between zero and 1,000,000 and no greater than the respective line's UTF-8 byte length; same-line end columns cannot precede start columns. This byte-length ceiling is a bound, not conversion or exact verification of TypeScript's UTF-16 offsets. Unknown `locationScope` values are rejected.

Node and edge IDs match `^[A-Za-z][A-Za-z0-9_:.\-]{1,150}$`. They are opaque producer-defined deterministic identifiers, not names. Node IDs are unique across the admitted graph; edge IDs are unique in their own collection. Consumers join endpoints by IDs and source identity, never by a shared spelling, label or qualified name. IDs are not promised stable across parser/profile/source changes.

## 5. Static graph records and authority

An admitted node has `id`, `kind`, `label`, `path`, `authority:"OBSERVED"` and `source`. Current producers also emit `qualifiedName` and may emit `scope`, `ownerId`, `callSiteId`, `meaning` or `controlStatus`. These producer extensions are not separate proofs. `path` must equal `source.path`. Admission bounds `kind` to a nonempty 100-character string and `label` to a nonempty 4,096-character string; the kind field is not presently a closed enum.

An edge has `id`, existing node IDs `from`/`to`, `kind`, `authority`, `source` and normally a `resolution` explanation. Additional fields include `callSiteId`, `branch`, `limitations` and provider-specific mapping details. An edge's source is the syntax supporting the relation, not necessarily the target definition's source.

| Authority | Permitted interpretation |
| --- | --- |
| `OBSERVED` | The provider observed this syntax, parsed key, declaration or lexical occurrence in the identified bytes. It does not mean execution. |
| `INFERRED` | A static relation derived under the producing adapter's stated assumptions. It does not prove reachability, complete initialization, runtime dispatch, value flow or causality. |
| `POSSIBLE` | A candidate relation or explicit control-flow gap. It must remain visually and semantically distinct from a determined static target. |

Static nodes admit only `OBSERVED`. Edges admit only the three authorities above. No static record acquires runtime-observed, user-declared or verified-Proof authority. The aggregate graph has `proof:"UNKNOWN"` and `runtimeGraph:false` unconditionally.

The current emitted vocabulary is:

| Record family | Kinds and meaning |
| --- | --- |
| Declarations/scopes | `module`, `function`, `async-function`, `method`, `class`, `constructor`, `closure`, `lambda`, `interface`, `namespace`, `enum`, `parameter`, `variable`. A syntax node does not guarantee a usable runtime binding. |
| Syntax/data nodes | `callsite`, `condition`, `statement`, `return`, `exception`, `async-operation`, `argument`, `config-key`, `config-section`. Config qualified names are escaped structural pointers, not executable access paths. |
| Structure | `DEFINES` is observed syntactic ownership. `INHERITS` is a Python base-binding inference, not an MRO or method-dispatch model. |
| Dependencies | JavaScript `IMPORTS` / `TYPE_IMPORTS` identify a unique selected source path. Type-only relations do not establish emitted module side effects without compiler options. Python import resolution can supply call targets without emitting a separate import edge. |
| Calls | `CALLS` is always `INFERRED`; `MAY_CALL` is always `POSSIBLE`. |
| Control | Python `CONTROL_FLOW` describes partial syntax-level normal completion, with `POSSIBLE` unknown continuations for unsupported constructs. JavaScript `BRANCH` observes a condition. `THROWS` and `AWAITS` observe syntax, not an exception destination or scheduling. |
| Data | Python `READS`, `WRITES`, `CAPTURES` and `PASSES_ARGUMENT` are lexical/syntactic inferences. JavaScript `PASSES_ARGUMENT` and `RETURNS_TO` are syntax observations. No relation proves a runtime value, transformation or taint path. |

Edge direction is provider-specific where stated. Python `PASSES_ARGUMENT` links an explicit argument node to an identified formal parameter; JavaScript links an identifier's lexical node to its callsite. JavaScript `RETURNS_TO` links a return-syntax node to its containing function. These must not be combined into an assumed universal interprocedural data-flow model. No current producer infers an SQL table relation, config-to-code dependency, event-bus link or cross-language relation from matching names.

## 6. Callsites and admission

Each callsite has `id`, `callerId`, `expression`, `source`, `status`, `targetIds` and `reason`. Its ID is also an existing graph-node ID. Caller and target IDs must exist; callsite IDs must be unique. The reason is a nonempty string of at most 4,000 characters.

| Status | Producer contract |
| --- | --- |
| `RESOLVED` | Exactly one qualified static target. It permits `CALLS`, subject to exact callsite linkage. |
| `AMBIGUOUS` | The provider has possible targets but cannot select one. Python emits `MAY_CALL` for candidates. |
| `UNKNOWN` | Available source and supported semantics do not establish a target. |
| `EXTERNAL` | A builtin, global or dependency target is outside the captured qualified binding set; it was not analyzed merely because its name is known. |

Unknown and external sites remain in the call denominator. Neither status establishes impossibility. Current producers use empty target lists for unknown/external sites; admission explicitly enforces only the singleton count for `RESOLVED` and that every listed target exists. It does not turn absence of a certain edge into a complete ambiguity analysis.

For every admitted `CALLS`/`MAY_CALL` edge, `callSiteId` must identify an admitted callsite, `from` must equal `callerId`, and `to` must occur in `targetIds`. A `CALLS` edge additionally requires `RESOLVED`. The edge and callsite must exactly agree on `path`, `sourceSha256`, `snapshotId`, `line`, `endLine`, `column`, `endColumn`, `provider` and `providerVersion`. Their source records also pass the independent source checks above.

The admission layer rejects malformed provenance, duplicate/dangling IDs, invalid call linkage, authority inflation, unavailable/error results and aggregate graph overflow. It admits the whole result or fails; it does not silently discard a bad provider and present a reduced success. `limitations` are nonempty strings up to 4,000 characters and are deduplicated with aggregate limitations.

This is strict structural and source-identity validation, not a closed JSON Schema or semantic theorem checker. Additional producer fields, node/edge kinds and metadata are not comprehensively restricted. Source hashes establish byte identity, not the correctness or authenticity of a parser's interpretation. Consumers must not upgrade an admitted inference to fact or Proof.

## 7. Aggregate graph, digest and coverage

The aggregate contains `schema`, `identity`, `providers`, `nodes`, `edges`, `callSites`, `coverage`, `capabilities`, `limitations`, `proof`, `runtimeGraph`, `limits` and `graphDigest`. Nodes, edges and callsites are sorted by ID. `graphDigest` is the SHA-256 of the aggregate facts serialized recursively with sorted object keys and preserved array order. Timing/RSS `metrics` are attached after digest computation and do not affect it. A digest is integrity metadata, not a signature or causal attestation.

Coverage has independent dimensions:

| Dimension | Fields / interpretation |
| --- | --- |
| Core capture | `coverage.inventory` retains the scan header's coverage. Deep's scope remains only the existing Core selection. |
| Loader admission | `admittedFiles`, `analyzedFiles`, `unsupportedFiles`, `omittedByLimit`, `bytes`, `scope`. Loader `complete` means no suffix omission or resource omission; it does not mean every provider understood every file. |
| Provider syntax | `coverage.providers[providerName]` includes parse counts/errors or per-file outcomes. Python syntax errors produce `PARTIAL`; the JavaScript adapter records diagnostic file/code counts; data records `PARSED`, `UNSUPPORTED`, `INVALID` or `TRUNCATED` with fixed reasons. |
| Call qualification | `coverage.calls = {total,resolved,ambiguous,unknown,external}` is recomputed from admitted callsites. Its total is observed sites in the retained provider result, not every executable call in the repository. |
| Data projection | Data separates `syntaxValidationComplete` from `keyProjectionComplete`, with omitted-node/container counts. Successful document parsing does not imply a complete key inventory. |
| Semantics | Aggregate `semanticCompleteness` is always `UNKNOWN`. Python/data `complete:false` is deliberate. No aggregate percentage substitutes for this value. |
| View projection | Pagination, omitted edges/calls and boundary relations describe a displayed subset, independently of analysis coverage. |
| Runtime | Session event/scenario counts, interrupted/truncated status and unsupported observation classes remain separate from static coverage. |

Provider counters have different scopes and may overlap. A consumer must show their labels, denominator and omissions; it must not sum parse success, call-resolution percentage and runtime observations into a single “understanding” score.

## 8. Resource limits and lifecycle

| Layer | Current bounds |
| --- | --- |
| Captured static source | 256 files, 262,144 bytes/file, 4,194,304 total source bytes. |
| Aggregate graph | 30,000 nodes, 60,000 edges, 20,000 callsites; at most four provider results. |
| Process transport | Worker stdin 8 MiB; worker stdout 16 MiB; Node old-space 384 MiB. Python provider subprocess timeout 45 seconds. |
| Static deadline | 60 seconds over capture, worker and admission; individual Git operations 10 seconds. |
| Python adapter | 24,000 nodes, 48,000 edges, 180,000 AST nodes; 8 MiB serialized stdin. |
| JavaScript adapter | 28,000 nodes, 56,000 edges, 19,000 pending callsites; walk depth 500; alias/re-export chain bound. |
| Data adapter | 4 MiB serialized stdin/output, 4,096 retained nodes, 2 MiB encoded node budget, traversal depth 64, 512-byte keys, 2,048-byte structural pointers. |
| View | 150 nodes, 600 edges, 200 callsites per response. |

Serialized transport bounds include JSON overhead and escaping; they are not equivalent to the source-byte budget. A source set within the loader's byte budget can still exceed a downstream transport/provider budget and fail explicitly.

The process environment is reduced to `PATH`, optional Windows `SystemRoot`, locale and fixed Python settings. Stdout is bounded; arbitrary stderr text is drained without retention. Cancellation and timeout terminate the worker, with process-group cleanup and hard-kill escalation on non-Windows hosts. These limits do not establish a general OS sandbox or an aggregate hostile-descendant resource quota.

Only one static or fixed-runtime job runs per resolved repository root. Cache keys bind the full Deep identity, capture header, profile and every selected path/hash/extraction-applicability tuple. The process-local cache retains at most three graphs. Restart requires explicit reanalysis. Aborted, replaced or identity-stale jobs cannot publish a new graph. Static statuses are `NO_SCAN`, `IDLE`, `RUNNING`, `READY`, `FAILED`, `CANCELLED`; a visible old running job can be marked `stale:true`.

## 9. API and projections

`/api/atlas-deep` uses the existing Local request boundary and bounded JSON body reader. POST requests must include the current `snapshotId`; source defaults to `HEAD`. Supported source selectors are `HEAD` and `WORKTREE`, but only HEAD can be analyzed.

| Request | Behavior |
| --- | --- |
| GET `action=status` | Reports scan/job/cache/runtime availability; performs no analysis. |
| POST `{action:"analyze", snapshotId, source?}` | Starts an explicit asynchronous static job or returns an existing cached result state. |
| POST `{action:"cancel", snapshotId, jobId?, source?}` | Aborts the project's active job; a supplied mismatched job ID is stale. |
| GET `action=graph` | Bounded projection with `view`, `focus`, `query`, `offset`. |
| GET `action=export` | Full admitted static graph and metrics within graph/output bounds. |
| GET `action=source&snapshot=...&node=...` | Revalidates graph/snapshot/node/path/hash, rereads the immutable blob and returns up to 40 redacted lines from the node start. Each displayed line is bounded at 2,000 characters. |
| POST `{action:"runtime-demo", snapshotId, source?}` | Explicitly attempts the separate built-in runtime fixture. The current project snapshot gates the API request; it is not the runtime target identity. |

Stale/busy errors map to HTTP 409; missing analysis/scan prerequisites map to 412; other Deep errors map to 400. Disabled Deep endpoints return 404. Errors use fixed codes rather than arbitrary process diagnostics.

Views are `calls`, `control`, `data`, `focused`, `runtime`, `sequence`. Query length is at most 200, focus ID length at most 150, and offset is an integer from 0 through 100,000. A nonempty focus must exist. Projections contain the original graph identity/digest and retained coverage/capabilities/limitations; their node subset is not the full hashed graph. Edges are retained only when both endpoints are displayed. `matchedNodes`, `returnedNodes`, `hasMore`, `edgesOmitted`, `callSitesOmitted` and `boundaryRelations` disclose the subset.

Runtime/sequence projections of a project graph return no nodes and report an unattached runtime as `UNAVAILABLE`. They never launch execution. The API's source response has schema `structure-source-1`, `authority:"OBSERVED"`, matching snapshot/path/hash, `redacted:true` and numbered display lines. Redaction means displayed text is not a byte-for-byte rendering; the hash identifies the underlying blob.

## 10. Runtime trace contract

Runtime is a separate explicit facility. Its only executable target is the immutable built-in three-file synthetic fixture (`rules.py`, `service.py`, `runtime_demo.py`). Neither the API nor the CLI accepts arbitrary project paths, commands, entrypoints or supplied source bytes. Its identity has `source:"SYNTHETIC"`, `tree:null`, repository ID `atlas-built-in-runtime-fixture-v1` and a deterministic fixture snapshot/hash manifest.

The Linux adapter probes `bubblewrap` plus `prlimit` before target execution. It checks distinct network/mount/PID/user namespace identities, read-only fixture, empty environment, dropped capabilities and resource limits. Failure returns `UNAVAILABLE`, `executed:false`, `kind:"NO_OBSERVATION"`. A subprocess alone is not accepted as isolation. The trusted probe itself runs code but does not execute the target fixture.

Bounds are 5 seconds wall time, 3 seconds CPU, 256 MiB address space, `RLIMIT_NPROC=16`, 1 MiB file/output size, 64 file descriptors, no core dumps and 1,000 retained events. Read-only `/usr` is exposed. Process limits are per-user and may be bypassed under root; memory/CPU limits are per-process, not cgroup aggregates. These qualifications do not authorize arbitrary hostile-code execution.

An admissible trace has:

```text
{
  schema: "idleproof.atlas-runtime.v1",
  kind: "OBSERVED_RUNTIME",
  status: "COMPLETED" | "FAILED" | "INTERRUPTED",
  sessionId: UUID, identity: {...},
  provider: {name:"atlas-python-sys-settrace", version:"1"},
  proof: "UNKNOWN",
  sources: [{path, sourceSha256}],
  events: [{sequence, event, atNs, function, caller, callSite,
            invocation, durationNs?}],
  ...sessionMetadata
}
```

The local producer includes `syntheticFixture:true`, scenario, isolation, duration/RSS, coverage/limitations and `authenticity:"LOCAL_PRODUCER_CLAIM_NOT_ATTESTED"`. A structurally valid imported record is not authenticated by that claim.

Event types are `CALL`, `RETURN`, `EXCEPTION`. Sequence equals the zero-based event-array position; `atNs` is a nondecreasing integer relative monotonic time. Function/caller references contain only `path`, `sourceSha256`, positive `line`, `qualifiedName` and kind `module` or `function`. Callsites contain only `path`, `sourceSha256` and positive `line`. Caller and callsite are both absent (`null`) or both present, with matching caller/site path and hash. All hashes must occur in the trace manifest.

On `CALL`, `invocation` equals the sequence number. `RETURN`/`EXCEPTION` refer to an open invocation with the identical function reference and a nonnegative duration no greater than `atNs`; RETURN closes it. A `COMPLETED` trace cannot have open invocations. Validation bounds encoded trace size, manifest count (100), event count, identities and event/reference fields. Unexpected event/reference fields are rejected. The top-level trace envelope remains extensible.

Arguments, locals, return values, exception messages and target output are not retained. Python RETURN can denote exception unwind; it does not establish successful completion or a returned value. Native calls, other threads and async scheduling are unsupported. An interrupted execution without an admissible trace yields `INCOMPLETE_OBSERVATION` and no established runtime edges.

## 11. Static/runtime reconciliation

Reconciliation validates the trace and requires exact equality of snapshot, tree, source and repository identities. Every traced file hash must match graph source identity; graph node snapshots must agree. Its current input bounds are 20,000 nodes and 40,000 edges, narrower than the static aggregate maximum.

A runtime frame matches a static node only by a unique exact `(path, sourceSha256, definition line, frame kind)` tuple. Node kinds `function`, `method`, `constructor`, `lambda` use frame kind `function`; module remains distinct. Unsupported kinds or multiple matches stay unresolved. Names do not select matches.

An observed call matches an existing `CALLS`/`MAY_CALL` relation only with exact caller/target plus callsite snapshot/path/hash/line. Multiple matching same-line callsites remain `CALLSITE_AMBIGUOUS`. Outcomes are:

| Reconciliation status | Meaning |
| --- | --- |
| `STATIC_DETERMINED_OBSERVED` | One existing static `CALLS` relation was observed in this session. |
| `STATIC_POSSIBLE_OBSERVED` | One existing `MAY_CALL` relation was observed in this session. |
| `DYNAMIC_OBSERVED_STATIC_UNRESOLVED` | Exact frame identities matched, but no unique existing static relation did. |
| `EXACT_FUNCTION_IDENTITY_UNRESOLVED` / `CALLSITE_AMBIGUOUS` | No qualified join was made. |
| `OBSERVED_IN_SESSION` / `NOT_OBSERVED_IN_SESSION` | Per-static-edge session coverage; absence is not impossibility or unreachability. |

The result has schema `idleproof.atlas-runtime-reconciliation.v1`, session/identity, `observed`, `unresolved`, `staticRelations`, coverage with `complete:false`, limitations and `proof:"UNKNOWN"`. Reconciliation does not rewrite static edges, promote their authority or merge the fixture into the user's project graph.

## 12. Qualification evidence and exclusions

The independent semantic review command `node --test test/atlas-deep-semantic-review.test.mjs` completed on 2026-10-22 with **29/29 PASS, zero skipped**, approximately 4.176 seconds. The CLI-driven, team-authored synthetic corpus covers initialization order, defaults/decorators, lexical scopes, exact imports and collisions, reflection aliases, rebinding and JavaScript runtime-expression traversal. Target fixture programs were supplied as data and never executed. An earlier 20-case run exposed failures; corrections were followed by the full passing 29-case run. This is bounded regression evidence, not a proof that no false target exists outside the corpus.

Runtime contract tests and fabricated trace records are not actual observations. The recorded isolation attempt in this environment returned `UNAVAILABLE`; no target fixture execution or successful runtime production path was measured. Those paths remain **NOT_RUN**, as detailed in [the runtime qualification report](../docs/architecture/ATLAS_DEEP_RUNTIME.md).

These contracts do not assert complete repository capture, sound whole-program semantics, exhaustive call/branch coverage, arbitrary-language support, external dependency correctness, authenticated producer identity or causal Core Proof. Unknown, unsupported, omitted and not-run outcomes must remain explicit in exports and user-facing interpretations.

## Fixed worker diagnostics

The worker may return `idleproof.atlas-deep-error.v1` instead of a result array. Only a fixed allowlist of resource/process codes is relayed; arbitrary diagnostic or source text is discarded. In particular `ATLAS_DEEP_JS_CALL_LIMIT` means the 19,000-callsite provider cap was exceeded, and no graph was admitted. This envelope is not an analysis graph or a partial success.
