# Atlas Deep Python provider, 22 October 2026

## Scope and authority

`src/atlas-deep-python.py` is a separate, bounded, standard-library `ast` provider. It reads a JSON envelope from stdin containing already admitted source bytes and source identities. It never imports the target modules, evaluates their expressions, installs their dependencies or executes target code. The Local integration reads selected immutable Git blobs and checks their hashes before invoking this provider; the provider checks each supplied content hash again. It does not replace the structural Core capture, Atlas V1, user-authored UML or Core Proof.

The provider's output distinguishes syntax observations from static binding inferences:

| Record | Meaning |
| --- | --- |
| Node with `authority: OBSERVED` | A syntax construct or lexical binding found in the supplied source. |
| `CALLS` with `authority: INFERRED` | A unique callable binding in the explicitly supported static model. This does not assert execution, successful invocation or universal reachability. |
| `MAY_CALL` with `authority: POSSIBLE` | Captured candidate definitions that cannot be reduced to one admissible binding. |
| Callsite `UNKNOWN` | No qualified effective target; for example a parameter callback or dynamic attribute access. |
| Callsite `EXTERNAL` | No captured callable binding, including builtins, standard library and unavailable dependencies. This is not a resolved external implementation. |

Every `ast.Call` from a successfully parsed file is retained as a callsite, including nested calls. The status, target IDs, reason, caller scope and exact source reference are stored. Unsupported resolution does not remove a site from the denominator. `semanticCompleteness` remains `UNKNOWN` and provider `coverage.complete` remains false.

## Input, identities and spans

The input is `{identity, files}` where each file has `path`, `content` and `sourceSha256`. The integration's identity carries repository, snapshot, tree and source scope; the provider copies the snapshot into every source reference. Only `.py` entries are parsed by this provider. Source paths must be unique and relative, without empty, dot or parent traversal components, backslashes, colon or NUL.

Node IDs hash the snapshot, path, file digest, node kind, qualified name, source span and enclosing scope. Edge IDs hash their relation, endpoints, source and relation metadata. Two identically named functions in separate files or lexical scopes cannot share a node ID merely because their names match. Identifiers are stable for the same snapshot, bytes and analysis contract; they are deliberately not a promise of symbol continuity across edited snapshots. Existing Atlas V1 overlay identities are unchanged and are not silently migrated to this graph.

Line numbers are one-based. Python AST columns are zero-based **UTF-8 byte offsets**, not JavaScript string offsets or display columns; end offsets are exclusive. The admission layer checks bounds against encoded captured lines. Module container nodes use the provider's line-1 anchor rather than claiming an AST span covering the entire file. The provider version (`python-ast`, `1`) and actual Python runtime version are retained. Reproducibility is scoped to the same captured input and compatible parser/runtime profile; timing and RSS measurements are not semantic facts.

## Call resolution actually implemented

The resolver first constructs lexical scopes, bindings and definitions from all parsed files. It then resolves call expressions without executing module initialization.

- Direct calls to a unique unmodified function in the same lexical scope; nested functions, recursion, literal lambdas and lexical closure references.
- Explicit static imports, aliases and relative imports when exact captured dotted module identities identify a unique module. `import pkg.rules`, `import pkg.rules as rules` and `from .rules import adjusted as tune` retain their actual binding paths.
- Unique unmodified aliases whose expressions can themselves be resolved. Scope collection accounts for parameters, local assignments, comprehension targets, exception bindings, loop variables and supported pattern binders so outer names are not substituted through shadowing.
- Direct access to methods on a captured plain class, including supported unshadowed `staticmethod` and `classmethod` decorators. This is a narrow class-attribute binding model, not instance-type inference.
- Calls to a plain class identify its class binding only. They do **not** resolve metaclass construction, `__new__`, `__init__` or actual object creation.
- `INHERITS` can identify an explicit captured base-class binding. MRO, inherited method dispatch and effective runtime types are not established.

The model assumes ordinary Python lexical and module binding within the captured selection. It does not prove that custom import hooks, dependency initialization, external code, reflection or mutation outside that selection cannot change a binding. No `sys.path` probing, installed-package loading, source-root guessing or name-similarity resolution is performed. For example, `src/rules.py` is not silently treated as importable `rules.py`. Module/package identity collisions remain ambiguous.

Bindings that are multiple, reassigned, conditional, declared global/nonlocal or affected by recognized dynamic namespace operations are conservatively withheld. Captured attribute mutation invalidates that attribute spelling rather than assigning a guessed object type. Unknown decorators retain only possible syntactic candidates. Calls before an applicable declaration/import finishes are withheld where this local execution-order check applies.

Instance dispatch, polymorphism, inherited method dispatch, custom descriptors/metaclasses, dynamic `getattr`, wildcard imports, reflective namespace changes, returned callables, injected dependencies and higher-order callback values are not qualified. An expression such as `factory()()` retains both callsites; resolving the inner factory binding does not resolve the callable it returns.

## Control flow is a partial normal-flow model

The current `CONTROL_FLOW` projection links syntactic entry and next statements, `if` branches, loop bodies and normal loop exhaustion, plus supported `break` and `continue` connections. Return and explicit raise statements terminate that local normal-flow sequence. Conditions carry their exact syntax source; branch labels identify true, false, loop-body, loop-exhausted and normal continuation.

This is not a complete compiler CFG, a path-feasibility solver or a model of all exceptions. Implicit exceptions can interrupt any apparent normal continuation. `try`/`except`/`finally`, context managers, `match` and exception groups are explicit unsupported control gaps, counted in `unsupportedControlStatements`; their continuation is only `POSSIBLE`. The existence of a branch does not prove that any real input can reach it. Normal sequencing around definitions does not reconstruct all decorator/default/annotation side effects. Complex nested control evaluation is not expanded into basic blocks.

`THROWS` records explicit raise syntax; it does not resolve an effective exception class or handler. `AWAITS` records supported explicit await syntax; it does not establish scheduling, task identity, concurrent order or an observed asynchronous event. No static branch is marked runtime-observed by this provider.

## Data flow is lexical and conditional on invocation

`READS` and `WRITES` connect supported expression/statement syntax to lexical binding identities. `CAPTURES` records a free lexical reference into an enclosing function. They do not identify a reaching assignment, concrete value, heap location, object alias or taint provenance.

For a uniquely resolved supported function, `PASSES_ARGUMENT` maps explicit positional and keyword argument expressions to known formal parameters. It is conditional on invocation and does not establish that a call succeeds. Starred arguments, keyword expansion and implicit method/`cls` injection are outside this initial mapping. The argument expression can retain references such as `value + 10`, but the provider does not evaluate that transformation.

There is no general SSA, path-sensitive reaching-definitions analysis, interprocedural return-value propagation, field/heap analysis, taint proof or external-service data-flow model. A lexical read following a write must not be presented as proof that it receives that write's value. Unsupported expression details remain absent or explicitly unknown; their absence is not proof of no dependency.

## Bounds and failure behavior

The provider allows at most 256 input files, 256 KiB per file, 4 MiB total source, 8 MiB stdin JSON, 180,000 AST nodes, 24,000 graph nodes and 48,000 edges. The parent adds process time, output and cancellation limits. These are bounds on trusted static analysis, not a sandbox for arbitrary target execution.

Malformed input, hash mismatch, duplicate paths and exceeded whole-analysis limits reject the provider result. A file that cannot be parsed is listed in `syntaxErrors` with a bounded category and line; other files can still be analyzed and the result is `PARTIAL`. No parse-error excerpt is forwarded. Graph/node limit errors are not converted to a misleading empty successful graph. The Local admission boundary independently checks provenance, graph references and authority consistency.

## Qualification and remaining evidence

`test/atlas-deep-python.test.mjs` defines a team-authored reference corpus and targeted positive/negative tests. Its fixed oracle is in `test/fixtures/atlas-deep/python/qualified/expected.json`, classified explicitly as `TEAM_AUTHORED_MANUAL_REFERENCE_NOT_INDEPENDENT_HUMAN_ANNOTATION`.

That synthetic oracle contains **16 callsites: 9 uniquely resolved, 5 external and 2 unknown**. Each expected row specifies path, line, expression, status and target. All 16 sites stay in the comparison; the 9 determined target expectations are not used as the denominator for overall coverage. Passing this oracle would establish 9/9 expected determined relations with no false certain relation on this fixture, not universal precision or recall over arbitrary Python.

Additional cases exercise imported aliases, relative and nested imports, recursion, closures, lexical shadowing, conditional/reassigned definitions, unknown decorators, reflection, monkey patching, plain classes, instance/inherited unknowns, comprehensions, exception/pattern binders, source-root non-guessing, partial control/data flow, UTF-8 spans, deterministic IDs, syntax failures and input rejection. A source fixture containing file-writing statements checks that static analysis does not execute them. The independent admission/adversarial suite tests authority and source substitution boundaries separately. Executed counts and failures belong in the exact-candidate qualification report rather than being inferred merely from the presence of these tests.

This synthetic sixteen-site fixture is **not** Thomas's historical `projet-multicouche` snapshot `dwscan_bba5f95b708414dd8cc6cd3ed025c45d64e2d0b1b5625af5e0710c9ff6b56232`. That real project's 16 historical callsites and exact targets remain to be checked against its captured bytes and independently prepared reference. The current corpus is neither an independently human-annotated benchmark nor proof of general semantic completeness.

## Mission gaps that must remain visible

1. Real-pilot qualification and broad independently annotated project coverage are outstanding. The synthetic oracle cannot stand in for the historical acceptance project.
2. Control/data flow and object dispatch are intentionally partial as described above; advanced interprocedural values, complete exception control and effective polymorphic targets are not implemented.
3. Static Python output supplies no runtime evidence. The separate runtime module only permits a fixed trusted synthetic fixture after verified isolation; this environment has not produced a qualified observed session.
