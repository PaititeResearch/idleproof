# Atlas Deep + accepted IdleProof contextual UX — isolated integration qualification

Date: 2026-10-22. **DRAFT; no merge, no public alpha, no WSL replacement.**

## Pinned parentage and exact changes
- Deep feature source: PR #48, `1847c0f45ef8c0542f3a076f5eb1a22e044b8645`, based on #46 `b8f03f9e7b98d6ae44ba1401ff0afa76f2f06cae`.
- Human-reviewed lean inline UX: PR #47, `f508d8443bc9bab3cf0174950e17c13e922068c8`, also based on #46. UX interaction repositions the original **Selected passage** composer under the selected paragraph and folds the original persisted **Conversation history**. It is not the discarded floating-button proposal.
- Exactly three frontend files are copied **byte-for-byte** from PR #47: `public/byok-thread-ui.js`, `public/index.html`, `public/styles.css`. Those three files in PR #48 were blob-identical to #46 before composition.
- One automated browser-qualification file `scripts/local-ui-browser-recipe.mjs` is also copied byte-for-byte from #47, solely to exercise F6/F7/F8 new UI; it has no runtime footprint in the installed npm package.
- This documentation is an additional qualification note. No Core, Portal, hooks, analyzer, Atlas V1/Deep, backend, BYOK transport, provider, budget or persistent data code is modified by **this integration commit**.
- The separate, intentionally unmodified `docs/qualification/CONTEXTUAL_SELECTION_POPOVER_20261022.md` from PR #47 describes a **superseded floating popover**, not the accepted inline UX. It is not copied into this branch.

## Automated acceptance
Require all workflow jobs `test`, `project-understanding`, `repository-atlas-experimental`, `atlas-deep-experimental` to complete green on **the exact integration head**. Confirm real Chromium F6/F7/F8, Atlas V1/zoom, Deep analysis, actual Core contracts, and platform matrices. Preserve first-attempt failures and do not weaken latencies or limits. A green workflow is MACHINE evidence only.

## Human acceptance (separate disposable trial, port 4780)
Do **not** replace or stop the operator's current Local UX installation at `127.0.0.1:4778`. The candidate is a trial checkout with a clone of the tracked **pilot Git repository** at the same HEAD/tree, with no copied `.idleproof` / `.git/diffwitness` private state, no BYOK credentials and no paid generations. The historical 16-call pilot acceptance is **NOT RUN** until visually tested; do not assign results from team-built fixtures.

1. Pin both checkout and Core executable identity and capture `HEAD^{tree}`; compare against previously observed pilot tree `47200580530c450457bddb7acca7abdce57a1962`.
2. Explicitly run `project scan --source HEAD` in the **copied project**; confirm the scan's returned tree and exclusions, without treating them as business facts. This is a **fresh** Core snapshot, not automatically the historical one.
3. With both experimental flags, open `http://127.0.0.1:4780/atlas.html` then `/atlas-deep.html`; verify the Deep page is inactive until explicit **Analyze captured source**, with no provider spend or target code execution.
4. Inspect the small pilot's Python call sites, notably `service.process` / `rules.adjusted` if present in the copied HEAD: check each expected source line, its incoming/outgoing relations and its static classification `CALLS`, `MAY_CALL`, `UNKNOWN` or `EXTERNAL`. Record all false and missed resolutions; static edges are not runtime Proof.
5. Verify exact-source navigation and source SHA, Function Call Graph, Focused Function, Control Flow, Data Flow, pagination and omissions; compare 1440px and 390px and keyboard interaction.
6. Return to Atlas V1; test pan/zoom, save/reopen annotations and history **inside the trial only**. Confirm Deep cannot mutate V1 records and disabled flags hide Deep.
7. The old installed `4778` discussion already passed the operator's refresh/restore check. The integrated candidate preserves PR #47's exact UI bytes; its additional **synthetic F6/F7/F8** tests must pass. **Do not** copy private discussions into the 4780 trial to simulate live-user persistence, and do not claim human pass for a nonexistent trial history.
8. Runtime trace remains `NOT_QUALIFIED`; the optional fixed synthetic example is only run with explicit consent and a verified sandbox. It never executes user-project source.
9. Stop the foreground isolated server with Ctrl+C. Preserve trial evidence and the original 4778 server, original Core, user notes and BYOK ledger. No merge before operator approval.

## Known limitations
Deep supports bounded immutable HEAD only; WORKTREE unsupported. Large repository may exceed 19,000 JS callsites and return `INCOMPLETE` with no aggregate graph. Lexical/static calls are inferred, not guaranteed execution; runtime observation failed to pass isolation in qualification CI. Semantic precision/recall on the actual pilot requires human annotation.
