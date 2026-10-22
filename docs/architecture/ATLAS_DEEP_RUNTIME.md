# Atlas Deep runtime experiment, 22 October 2026

## Delivered boundary

The optional runtime module has a versioned trace contract, an explicit isolation probe, a fixed synthetic Python fixture runner, and exact-identity static/runtime reconciliation. It does not execute arbitrary repositories, source paths, commands, entrypoints or user-provided fixture bytes. It does not alter Core Proof, debt, policy or Atlas V1.

`runtimeAvailability()` executes trusted boundary-checking code only. `runRuntimeFixture()` repeats that check before executing the immutable fixture. A failed, incomplete or unavailable check returns `UNAVAILABLE`, `executed: false`, and no observation. `buildRuntimeDemo()` runs that same fixed fixture and, only after an admissible observation exists, builds its static Python graph and reconciles the two layers. It returns `{status: 'READY', kind: 'SYNTHETIC_RUNTIME_DEMO', graph, trace, reconciliation}`. This demo is explicitly separate from any user snapshot.

No public API may accept source, command, entrypoint or filesystem arguments to these functions. The only runtime fixture is the hard-coded `rules.py`, `service.py` and `runtime_demo.py` set. Its scenario calls `service.process(100)` and then calls `service.process(-20)` inside a handler. Files and the manifest are created in a new private disposable directory and removed in `finally`.

## Isolation implementation and limits

The Linux adapter invokes trusted `/usr/bin/prlimit`, `/usr/bin/bwrap`, and `/usr/bin/python3` directly without a shell. Bubblewrap requests separate user, network, mount and PID namespaces, drops capabilities, clears the environment, provides a new `/proc`, private `/dev` and `/tmp`, binds `/usr` read-only, and mounts the exact fixture and instrumentation read-only. No home, repository, credential directory, sockets or host temporary directory are mounted. Network is unshared, so host interfaces and host abstract Unix sockets are not exposed.

The probe confirms namespace identities differ from the parent, no effective capabilities remain, fixture writes fail, the environment is empty except Python's locale coercion variable, and resource limits match. A probe success is not a general hostile-code sandbox certification. Read-only system binaries and libraries remain available under `/usr`.

Bounds are 5 seconds wall time, 3 seconds CPU, 256 MiB address space, 1 MiB file size, 64 open files, no core dumps, 1 MiB retained instrumentation output and 1,000 events. The process group is terminated on timeout, cancellation or output overflow. `--die-with-parent` protects the bubblewrap child lifecycle. The process count limit is `RLIMIT_NPROC=16`, a per-user limit rather than a cgroup PID quota and subject to root exemptions. Memory and CPU resource limits are per process, not an aggregate descendant cgroup. These are among the reasons this implementation permits only the fixed trusted fixture and does not offer arbitrary target execution.

## Trace contract

`idleproof.atlas-runtime.v1` contains:

- `kind: OBSERVED_RUNTIME`, session UUID, scenario, synthetic-fixture flag and fixed producer/version;
- snapshot, source, tree and repository identity, plus each path and SHA-256;
- sequential `CALL`, `RETURN` and `EXCEPTION` events, relative monotonic nanoseconds, invocation links and durations;
- exact caller and callee file/hash/definition line, frame kind, and caller callsite line;
- completion/interruption status, coverage gaps and isolation information;
- `proof: UNKNOWN` and `authenticity: LOCAL_PRODUCER_CLAIM_NOT_ATTESTED`.

The instrumentation retains no arguments, local variables, return values, exception messages or target output. Python return events can describe exception unwind, so a return event does not establish a successful return value. Native calls, threads, async scheduling and exhaustive branch coverage are unsupported. Event limits produce an explicit interrupted trace, never a complete-coverage claim.

The validator rejects wrong versions, oversized records, malformed source references, sequence/time errors, unresolved invocation references, extra event or nested reference fields, and completed traces with unfinished invocations. This establishes structural admissibility and internal integrity, not producer authenticity. Fabricated contract fixtures used in tests are not actual runtime observations. An object labeled `SYNTHETIC_EXAMPLE` cannot be reconciled as `OBSERVED_RUNTIME`.

## Reconciliation

The graph and trace must have the same snapshot, tree, source and repository identities. Every traced file hash must agree with the graph; node snapshot identities are checked. Function matching requires an exact path/hash/definition-line/frame-kind tuple with exactly one candidate. A module beginning on line 1 is distinct from a function beginning on line 1. Function names do not supply a match.

Call matching additionally requires exact caller, target and callsite path/hash/line. Multiple same-line callsites remain ambiguous. Relations become `STATIC_DETERMINED_OBSERVED`, `STATIC_POSSIBLE_OBSERVED` or `DYNAMIC_OBSERVED_STATIC_UNRESOLVED` for this session only. Static edges retain their existing authority and are not rewritten. Unseen edges are `NOT_OBSERVED_IN_SESSION`; absence is not evidence of impossibility or unreachability.

## Qualification performed here

The initial direct namespace probe failed with `bwrap: loopback: Failed to create NETLINK_ROUTE socket: Operation not permitted`. The adapter's complete resource-bounded probe subsequently returned `UNAVAILABLE` / `ISOLATION_TIMEOUT`. No target code was run, and there is no measured runtime session in this environment. Do not turn this limitation into an observed-runtime PASS.

The Node contract suite verifies fixed-fixture determinism, event order, exact identity matching, static/possible/dynamic distinctions, same-line ambiguity, stale sources, nested sensitive-field rejection, malformed/oversized records, interrupted versus completed sessions, cancellation, temporary-directory cleanup, and the real fail-closed probe. Python instrumentation is syntax-checked without executing target code.

The observed-runtime production path and successful isolation path remain **NOT_RUN** here. They need execution and artifact inspection on a host that passes the probe before runtime qualification can be claimed. Existing test fixtures are team-authored, not independently human-annotated real-project behavior.

## Explicit operator commands

```sh
node scripts/atlas-deep-runtime-demo.mjs --check-isolation
node scripts/atlas-deep-runtime-demo.mjs --run-fixed-synthetic-fixture > runtime-demo-result.json
```

The first command never executes the target. The second executes only the fixed fixture after successful isolation. It exits with code 3 for `UNAVAILABLE`, 1 for failed/interrupted instrumentation, and 0 for a ready result. The output contains the trace, admitted static graph and reconciliation when available. No installation, paid API call, source upload or user-project execution is involved.
