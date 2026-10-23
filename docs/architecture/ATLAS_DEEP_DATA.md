# Data-format provider: independent JSON/TOML validation

`src/atlas-deep-data.py` is a standalone, execution-free producer. It accepts one JSON request on stdin with `identity` and captured `files` (`path`, `sourceSha256`, `content`), and emits one JSON result. It never opens target paths, imports project code, runs SQL, resolves configuration references or installs a parser. Python's isolated mode is appropriate for invocation: `python3 -I -S src/atlas-deep-data.py`.

The producer is named `data-stdlib`, version `1`. JSON parsing uses the Python standard library with duplicate-key and nonstandard-number rejection. TOML uses `tomllib` when available (Python 3.11+). Older interpreters report TOML as unsupported. Malformed documents contribute no partial key observations, and parser diagnostic text is not retained because it may contain sensitive source material.

## Retained observations

Only parsed key names, escaped JSON Pointer names, containing paths, snapshot/file identities and provenance are emitted. Scalar values, timestamps, argument-like configuration content and parser excerpts are not emitted. Names themselves are metadata and can be sensitive: this provider must only receive files already admitted by the capture's selection and sensitive-path protections. It does not expand that selection or authorize transmission to a model.

`config-key` describes a parsed key. `config-section` describes a parsed object/table at that key. It does **not** establish that an explicit TOML section header exists: dotted keys and inline tables can produce the same parsed structure. Arrays retain their key and use numeric JSON Pointer segments for contained object keys; array values are not copied.

Every node has authority `OBSERVED`. Its source has language, provider/version, snapshot ID, path and SHA-256. Coordinates deliberately remain a `file-anchor`: line/endLine `1`, column/endColumn `null`. These anchors open the captured document; they are not invented key locations. No edges or call sites are produced. A key named after a function does not prove a link to it.

## Unsupported scope

SQL, YAML and other formats are `UNSUPPORTED`, with an explicit per-file coverage record. In particular, this is not independent SQL/YAML qualification of Core's existing syntax extraction. There is no regex fallback presented as a parser, live database inspection, cross-language association, dependency installation or runtime validation.

The producer always leaves global semantic completeness `UNKNOWN` and `complete:false`. Separate fields state whether all supplied documents were parsed and whether all parsed keys fit the projection limits. A successfully parsed empty/scalar JSON document can legitimately have no key nodes.

## Bounds and identity

- Request transport and aggregate source budget: 4 MiB; 256 files maximum.
- Per-file source: 256 KiB, checked before parsing.
- Retained nodes: 4,096 and a 2 MiB serialized-node budget; whole output: 4 MiB.
- Projection nesting: 64; key bytes: 512; pointer bytes: 2,048.
- Relative paths only, up to 1,024 characters; duplicate paths reject the request.

Digest mismatches invalidate the corresponding file. Nodes are deterministically identified by producer, full request identity, path, file hash, language, pointer and node kind. Changing values changes source identity even though those values are not retained.

Truncated records preserve syntax-validation status separately from key omissions. `omittedNodes` counts encountered omitted keys; `omittedContainers` counts skipped subtrees whose descendant count is unknown. Neither is a universal count of all missing semantic facts. A parent subprocess must additionally enforce process time/memory and cancellation limits; these input/output limits are not an operating-system sandbox.

## Qualification corpus

`test/atlas-deep-data.test.mjs` invokes the real provider in isolated Python processes. The corpus is team-authored and tests JSON/TOML positive cases, duplicate keys, malformed input, secret-value non-retention, hash mismatch, source identity changes, unsafe paths, unsupported SQL/YAML, and bounded incomplete projections. It does not represent independently annotated third-party repositories or the user's actual project. Missing Python is reported as an explicit test skip/NOT_RUN, not a successful provider qualification. Python without `tomllib` exercises the explicit unsupported branch.

Run the focused qualification with `node --test test/atlas-deep-data.test.mjs`. Record its actual result in the candidate qualification report; this document does not substitute for that execution or claim independent SQL/YAML validation.

Development execution on 2026-10-22 used Python 3.12.14: **15/15 passed, zero skips**, 1.275 seconds reported by the Node test runner. The first run was **14/15**: the newly authored Unicode fixture contained a raw lone surrogate instead of the intended JSON escape, and the provider rejected the invalid UTF-8 source. The fixture was corrected to supply the escaped source; no provider behavior or acceptance threshold was relaxed. This is local machine qualification, not human acceptance or an external-corpus result.
