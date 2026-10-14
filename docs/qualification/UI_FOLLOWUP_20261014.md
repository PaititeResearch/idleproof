# Local UI follow-up — 2026-10-14

Baseline: `014cc74bfb43e22a4ef1bce16db8cba5fa844f60`.

## Reproduced remaining defects

A state request could hang without marking the screen stale; concurrent polls could overwrite a newer state with an older reply. Polling could re-enable acceptance/approval during a pending POST. Quiz feedback timers could replay a completed old state after disconnection or a task change. A malformed first state was timestamped before rendering succeeded. A project-wide check count could incorrectly describe an individually unassessed item as having no correct answer. Impact wording still called observed feature models learned.

## Corrections

The UI now coalesces state reads and bounds headers/body completion to 8 seconds. Failed, malformed or timed-out reads do not establish a successful update. Action handlers check freshness (10-second age ceiling, also rechecked after background-tab suspension), and in-flight acceptance/approval stays locked through a new post-action read. No committing request is automatically retried. Feedback refreshes the current state instead of replaying the result payload later; only its own lesson card pauses while feedback is visible. The banner identifies the live-task data and includes the full local date/time, without claiming the independently captured project scan has the same freshness.

Ambiguous zero-valued items say `assessment unavailable` when other project items have checks; a project aggregate does not prove an individual failed answer. Explicit per-feature checked zeros and positive recorded values remain. Known impact summary templates use `tracked` instead of `learned`, without rewriting literal paths or user task text.

## Independent checks

- `node --test test/local-ui-concurrency.test.mjs`: 14 pass, 0 fail. The same tests against the baseline controller yield 12 fail, 2 pass, 0 cancelled.
- `node --check public/app.js`: pass.
- Chromium: 4 controller scenarios passed using native DOM and in-page simulated transport: initial load, hung read, recovery and pending acceptance across a render. No uncaught browser exceptions. This is NOT the full Local interface, real network, ASK/DENY backend or provider qualification.
- Existing `local-ui-state.test.mjs` was updated with browser timer/abort globals and a corrected scoped-assessment assertion. Its real-server suite was NOT rerun here.

The working runtime could not clone/install over the network, and its browser blocks loopback navigation. The complete npm suite, real Core/Local/Portal integration, OpenRouter, Windows/WSL, Safari/Firefox and screen-reader acceptance remain to be rerun. Previous full-suite results apply to the earlier baseline, not automatically to this candidate.

## Unchanged boundaries

No server endpoint, response schema, calculation, approval/acceptance policy, Core output, CLI, proof, debt, data or deployment was changed. This is client-side state management, not a replacement for server authorization or transactional binding. Existing panel visibility is retained pending the owner's separate decision. Spaced recall is not silently enabled. The shared design-system files and CSS are unchanged.
