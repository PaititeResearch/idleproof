# OpenRouter answer-first explanations — 2026-10-21

Status: qualification candidate stacked on PR #42 head
`b9a52738749232cc5d5c62975fd41d42d65c58fb`, not merged/deployed. Request policy v8.
The earlier HUMAN v6 FAIL and v7 PARTIAL remain recorded. The actual v7 trial
completed two calls at an aggregate provider-reported $0.000950719, but did not
answer all requested cases clearly. The user prioritizes a usable explanation of
code, not a compliance report. No operator packet, source dump or credential is
included in this change. All added fixtures are synthetic.

## Intervention

Only the opt-in reviewed explanation path changes its generation/presentation
contract. The ordinary one-call prompt and response schema remain unchanged.

1. Prepare up to 16 exact question spans as a local checklist. Preserve decimal
   literals, filenames, quoted/nested expressions and all tail text. This is a
   deterministic segmentation, not a semantic task parser. The original question
   remains a separate message. The preview exposes this checklist; it and the new
   answer format are consent/cache-bound.
2. When an immutable captured window is explicitly complete, keep its exact code
   and provenance and remove duplicate flattened behavior descriptions. Keep
   declarations, owner statements and dependencies. Partial/missing/redacted
   windows retain useful descriptions. No extra source reading, broadened file
   selection, project execution or new source/memory opt-in is introduced.
3. Give the quality path a coherent code-reader policy: direct overview, short
   titled sections, explicit complete conditions, every requested concrete case
   (including refusal), named used-versus-present helpers, and justified limits.
   Complete captured bodies permit scoped static conclusions; missing runtime
   observations are not a reason to refuse readable code-derived predictions.
   Same-name alternatives remain separated by imports. Caller and rule citations
   support composed results. No business purpose or roadmap is invented.
4. Require headings and a separate model-reported question-to-answer/gap mapping
   on the wire. Keep the original strict answer validator for the underlying
   claims/tests/unknowns. Validate question identity, index ranges, mapping kinds,
   uniqueness and heading bounds separately. A proposed test cannot be used as an
   answer link. Missing first-pass mappings are supplied to the existing second
   pass, whose task is to repair omissions before editing prose.
5. Render the final answer in titled sections. Keep source buttons and technical
   provenance. Put additional checks after the answer in a collapsed disclosure.
   Flag an unlinked final point as needing completion, without throwing away the
   useful sourced sections or pretending that every point has been answered.
   Historical v5-v7 results keep byte-identical rendering in the fixture cases.

The coverage mapping is NOT a semantic verifier. A model can still incorrectly
mark a point answered, link a false statement or classify a mixed request as a
style instruction. The prompt explicitly prohibits the latter, but a prompt does
not enforce semantic correctness. No 100% coverage score or green validation
badge is shown. `semanticVerified:false`, `requiresReview:true`, INFERRED and
Proof UNKNOWN remain. Live semantic and human readability qualification is still
required, including variations of conditions, thresholds and missing evidence.

## Preserved boundaries and budget

Two calls maximum, same configured model, no automatic retries or paid evaluator.
Existing 2000-token settings and $0.02 whole-explanation ceiling are not changed.
The schema (at most 4096 wire bytes) is now explicitly included in the pre-funded
reservation estimate; a 16 KiB draft allowance and existing envelope allowance
remain. Both calls must fit before the first paid POST. Per-pass accounting,
unknown-cost handling, interrupted/cached records, cancellation, provider limits
and deadlines are unchanged. New consent is required; old answers and spend are
not rewritten or reset.

Result schema v1 and the stored three-array answer remain. Optional `presentation`
contains escaped/redacted titles and model-reported links with the already
redacted question spans; this is additional local result retention, not canonical
project memory. The draft/coverage feedback is not persisted as a separate raw
completion. Invalid new metadata fails closed with fixed diagnostic codes.

Core, Portal, hooks, Protect, scan implementation, immutable-window reader,
source navigation controller, server, CLI, dependencies and styles are unchanged.
No CI workflow, time budget, prior assertion or threshold is weakened. The only
existing reviewed-test adaptation supplies the newly requested synthetic wire
fields according to the actually requested schema; all its existing assertions
remain. The browser recipe adds two checks of the new presentation at 390 and
1440 pixels; its previous checks remain.

## Executed local checks

Environment: isolated Linux, Node 22.16.0. Baseline reconstructed byte-for-byte
as tree `7d190d72dc4d6f360a9fd218048833cb22d9a704` before editing.

- Parent complete BYOK scope: 88/88 passed, no skips.
- Candidate complete BYOK scope: **126/126 passed**, no skips, 15.447 seconds.
- 38 added tests cover exact-spanned checklists, Unicode/decimal/quoted/nested
  inputs, overflow retention, source compaction, partial scope, strict legacy
  admission, 15 invalid shapes, coverage repair feedback, cost retention, source
  navigation markup, secondary checks, redaction/escaping, v7-consent rejection,
  schema bounds and five byte-for-byte historical renderer fingerprints.
- A test deliberately admits a structurally linked false sentence while keeping
  semanticVerified=false: this documents the limitation instead of calling the
  metadata a truth detector.
- Syntax checks, `git diff --check` and package dry-run passed. The new runtime
  module is included by the existing npm `src` inclusion rule.
- Two full `npm test` attempts exceeded the 200-second tool deadline without a
  final summary. They are NOT full-suite passes. The last reported cases were in
  the existing auto-debt area (first attempt) or before it (second attempt).
  A targeted interrupted-worker control passed on both unmodified v7 and the
  candidate (1/1 each); this does not identify the full-run stall's cause.
- Local Chromium navigation was refused by environment policy with
  `ERR_BLOCKED_BY_ADMINISTRATOR` on loopback URLs. The attempted browser recipe
  is NOT a local browser pass. The existing CI browser lane must qualify it.

No live model call or paid evaluation was made. Fixture provider replies test
transport, coverage links, presentation and accounting, not model intelligence.
Exact-head CI outcomes will be recorded on the PR after reading them. Pending
or earlier-head results are not treated as new-head qualification.

## Human acceptance / rollback

Install only an exact CI-qualified candidate using the existing guarded runtime
backup procedure. Keep the same scan, model, source+quality selection, memory
excluded, 2000-token limit and total request budget. Inspect the question
checklist and code excerpts in a fresh preview, then send once explicitly.

Evaluate clarity of the first paragraph, complete access conditions, direct
answers to every requested case, precise named used-versus-present rules, local
source navigation and useful specific limitations. Coverage links supplement
this review; they cannot replace it. Retain failures and compare additional
synthetic domains/thresholds/alternative imports under a separate explicit budget.
Do not optimize only for the operator's small corpus or select a lucky retry.

Rollback restores only the previous runtime package, not state/history/spend.
The unchanged 2000-token config is compatible with v7. New optional presentation
metadata is additive; previous runtime readers can still use the legacy answer.
No merge, publication, user installation or new HUMAN PASS is authorized by this
record. A clear and substantively correct real response remains the goal.
