# Repository atlas — experimental qualification

Base: `PaititeResearch/idleproof` `1edb27b06d1a5a96bfb113b8ec854dc9831dde63` (tree `5c1e45bb194cc03ab4e8e961bcde200a1ac1979e`). Branch: `experiment/repository-atlas-20261021`, isolated from PRs #42/#43 and the operator's installed WSL recipe. Do not merge or deploy automatically.

## Executed locally

- Atlas unit / HTTP / storage / export suite: **22 passed, 0 failed**. The separate real-Core contract is skipped unless `IDLEPROOF_TEST_CORE=1`; not counted as passed.
- Earlier whole-suite checkpoint before the final body-reader and UI guards: **763 total / 757 passed / 0 failed / 6 existing Core-dependent skips**, 137.387 seconds. This is a baseline checkpoint, not an exact-final-tree qualification.
- Syntax checks of new runtime, browser and test entrypoints passed. Package dry-run succeeded without a new runtime npm dependency or lifecycle script.
- A synthetic 1,000-file / 3,000-node / 2,999-edge projection passed the 5-second development ceiling. This is not a measured guarantee for all real repositories or for browser layout performance.
- Browser driver is installed locally, but local Chromium navigation was denied by the environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). No local browser PASS is claimed and that policy was not bypassed.

## Exact-head CI required

The additional `repository-atlas-experimental` workflow runs:

1. Actual pinned Core `7f043a3cbaf1b2c3e59d48bc6509a1ae627f8a23`: capture Python classes and dependencies, verify exact source hashes, retrieve immutable code despite a modified working file, refuse edits targeting a stale capture, and demonstrate that a fixture side-effect module is not executed.
2. Actual Chromium with vendored Cytoscape, real Local HTTP/storage, at 390 and 1440 pixels: source metadata, aliases, manual classes/inheritance, save/reload, history, stale revision conflicts, local exports, keyboard, themes, overflow, inert labels, and absence of provider/scan/approval calls. Only the source-response UI check is injected; the actual source contract is covered by the separate Core job.
3. Existing full platform suite and existing project-understanding/browser contracts remain unchanged and must still pass. No gate is weakened for this experiment.

Read the exact commit's workflow results; a workflow starting or a test fixture passing does not establish product reliability. Record any failed attempts and corrections rather than silently treating reruns as the first attempt. Screenshots are synthetic machine evidence, never human acceptance.

## Acceptance still necessary

Human review on an isolated copy: layout readability, real-module navigation, sources, user edits and history, new snapshots, storage conflicts, keyboard and mobile ergonomics. Long or unsupported projects need broader extraction coverage tests; unresolved symbols are not silently completed by AI. No model call or live reverse-engineering provider has been made for this implementation.

Do not claim full UML 2.x, verified runtime call graphs, native reverse engineering, universal coverage, semantic infallibility, cross-device editing or automatic architecture-to-code writes. REA is a pinned design reference, not an installed or qualified adapter. The user-approved contextual-question selection UX and deferred Markdown sources remain separate workstreams.
