# Contextual explanation selection — compact UX qualification candidate

Date: 2026-10-22  
Scope: UI-only candidate branch `candidate/contextual-selection-popover-20261022`, based **exactly** on IdleProof Local PR #46 (`b8f03f9e7b98d6ae44ba1401ff0afa76f2f06cae`).  
Status: experiment, draft PR, not merged or installed. User's accepted UX decision is recorded in [PR #43 decision](https://github.com/PaititeResearch/idleproof/pull/43#issuecomment-6324557830).

## Problem and expected experience

The old implementation placed "Selected passage" below the complete OpenRouter explanation inside a large, permanently open "Connected learning / Explore this explanation" card. This forced navigation away from the quoted sentence and displayed the entire accumulated discussion even when the user only wanted to ask one question.

**New presentation contract:**

1. Highlighting a valid substring of one cited explanation claim captures the same bounded server-compatible quote. Selection alone displays a small **Ask about selection** action near the text. It never opens a large card, scrolls the document, executes a scan or invokes a provider.
2. Clicking that action opens a compact, accessible question surface next to the selection on desktop. On small screens it uses a bounded bottom sheet. The quoted **Selected passage** and the existing question, preview, explicit send and cancel controls remain unchanged in meaning.
3. Existing keyboard-friendly **Ask about this section** opens the same composer without needing a pointer selection. Escape, Close and outside click dismiss the UI; closing never deletes drafts, responses or user history. Return focus is provided when the user explicitly closes by Escape/Close.
4. The most recent reply is rendered next to the question after the explicit send. The complete **Conversation history** is an independent native `<details>` disclosure, collapsed by default. An independent **Conversation history · N** action is available within the original explanation when saved turns exist, even with no active quote; it opens a read-only history surface. Closing/reopening never incurs a paid request.
5. The cited original answer stays unchanged in the DOM and selection can be copied normally. Displayed quoted text, question, answer and source labels use the existing text-only rendering/escaping.
6. Existing Local language selection, source citations, budget, consent, immutable snapshot anchoring, deduplication, cancel, preview, error handling, persisted thread records and history maximum remain implemented by the exact same code and endpoints. No new implicit network call, model, data collector, thread record or retry.

## Changed boundary

Production changes **only** in:
- `public/byok-thread-ui.js`: presentation events, selection action placement, popup positioning, read-only history rendering, focus/keyboard dismissal.
- `public/index.html`: DOM arrangement of the same existing IDs and controls into compact composer, latest answer and collapsed history.
- `public/styles.css`: fixed but bounded desktop popover and mobile bottom sheet, native `details` and anchored action styling.

Qualification-only:
- `scripts/local-ui-browser-recipe.mjs`: existing F6/F7 functional tests preserved and adapted to the new correct visibility contract, added independent F8 desktop/mobile history tests. F6 still verifies exact quote, explicit preview/Send count, original source text, source citations and persistence. F7 still verifies exact mouse/keyboard selected substring and zero POST; additionally asserts no automatic panel or scroll, and Escape/focus. F8 checks existing history without selection, collapsibility, no paid calls, and source text still present.
- This document.

**Do not modify** `src/byok-*.mjs`, `src/atlas-*.mjs`, `src/project-scan.mjs`, policies, hooks, Core, Portal, npm manifest, dependencies, server endpoints, request schemas, spending meter or persisted messages.

## Qualification and nonregression gates

1. Verify diff contains only the five allowed paths; no snapshots/source files, model keys or configured budgets have been touched.
2. Inspect emitted packet/request handling remains **byte-identical** in the backend (no backend file changed).
3. Syntax check JS and full `npm test`, including all old BYOK thread tests, persistence, malformed response, consent/cache, cancellation and review budgets.
4. Run real Chromium against the normal Local test server, desktop 1440px and mobile 390px, including existing F6/F7 and F8 with synthetic provider responses only. Real provider calls are prohibited. Preserve failures, do not loosen existing functional assertions.
5. Run existing `project-understanding`, `repository-atlas-experimental` and `test` workflows on **the exact current head** and matching PR tree. Keep hook latency gates and the entire Windows/macOS/Linux matrix unchanged. A passing test does not automatically establish human usability.
6. Human walkthrough with the real previously reviewed explanation: copy text; select an exact phrase, verify anchored action and no page jump; open the question sheet, check existing source preview, close/reopen without loss; read history independently, expand/collapse; refresh/reopen and confirm historical reply unchanged without a paid request; test a narrow screen and keyboard. Do not click **Send approved follow-up** without fresh explicit approval and capped budget.
7. Test failures and accessibility gaps honestly. No merge or replacement of the current WSL recipe until the user accepts.

## Explicitly deferred

- Selecting code source lines instead of explanation text.
- Extending intake of Markdown, prompts, journals and blueprints.
- The separate Work mission **Atlas Deep Understanding** / semantics/runtime/REA.
- Changing Portal UI, the model's output format or any server logic.
