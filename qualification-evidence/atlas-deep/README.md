# Atlas Deep qualification evidence

All material is MACHINE evidence. Human qualification and the historical WSL pilot are NOT_RUN.

- `local/baseline-tests.log`: `npm test` on exact PR46 `b8f03f9e7b98d6ae44ba1401ff0afa76f2f06cae`: 766 pass, 3 fail, 7 skip.
- `local/candidate-tests.log`: local `npm test` at implementation commit `2192496526b228187c391dc1262326130f67208a`, before the later resource-diagnostic-only fix: 880 pass, 3 fail, 8 skip. Same existing portal-memory-lock failures; the extra skip is the optional real Core Deep contract.
- `local/atlas-qualified-final.log`: `IDLEPROOF_TEST_CORE=1 DIFFWITNESS_BIN=<pinned Core executable> node --test --test-concurrency=1 test/atlas*.test.mjs`: 149 pass, no failure or skip. Core revision `7f043a3cbaf1b2c3e59d48bc6509a1ae627f8a23`.
- `benchmark-local.json`: `node scripts/atlas-deep-benchmark.mjs --output qualification-evidence/atlas-deep/benchmark-local.json`. Synthetic expected-target sets plus external CPython module, counted separately. Assertions gate false positives and missed targets.
- `local/runtime-local.json`: explicit `node scripts/atlas-deep-runtime-demo.mjs --run-fixed-synthetic-fixture`, exit 3, no target executed.
- `local/browser-not-run.json`: local launch attempt; Chromium absent, exit 2.
- `local/package-final.json`: npm package dry run; no package publication or install.
- `local/deep-provider-integration.log`, `local/provider-focused.log`, `local/provider-focused-v2.log`: retained intermediate failures and repairs, not final qualification claims.

Local host: Linux x86_64, Node 24.19.0, Python 3.12.14. Source inputs are test fixtures or public repository code, never the user's WSL capture. Console paths refer to disposable work directories. Metrics are one local measurement, not a universal performance guarantee.

GitHub Actions artifacts carry their own run/head identity. A green prior commit is not a green final commit. CI results and screenshot inspection are recorded separately after the run. No snapshot or graph in this directory establishes Core Proof.

The real-repository report preserves its initial INCOMPLETE result at commit 2192496. A later regression test verifies that the same JS callsite cap now returns a safe explicit diagnostic; the resource threshold is unchanged.
