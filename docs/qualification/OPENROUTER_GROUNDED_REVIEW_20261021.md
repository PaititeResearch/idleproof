# OpenRouter grounded review — 2026-10-21

Status: qualification candidate in PR #42, **do not merge**. The previous v6
HUMAN semantic FAIL is retained. This change is a testable intervention, not a
claim that a second model pass proves correctness. No live provider call, user
key access, WSL update, Core/Portal change or HUMAN PASS was performed here.

## Why this intervention

The human v6 response was structurally accepted but conflated alternate access
policies, attributed unused helpers to the main service and failed requested
numeric predictions. Arithmetic evidence was already present; its absence was
not the cause. The old packet preserved flat line-tagged clauses, not indentation
or exact import statements. That is a real fidelity limitation, not a proven
causal explanation of every model error. Increasing output length alone does not
address a response that finished normally after 518 output tokens.

## Explicit, bounded mode

The unchecked **Add captured code and one corrective review** option is additive.
CLI equivalent: `--quality` on both `ai preview` and `ai explain`. The ordinary
one-call flow remains available. Nothing is enabled by configuration alone.

When `--quality` and `--include-source` are both selected, preparation asks the
existing trusted Core CLI for lines 1–40 of each already-selected captured file.
It checks snapshot, path, source hash, authority, line order and available total
line count. This reads immutable captured bytes, not current worktree contents;
it never executes project code or expands the file selection. Indentation,
signatures, import statements and branch order are retained within admitted
windows. Files with sensitive text are withheld as a whole; individual lines are
never silently edited into different code. Truncated lines are not admitted.

Windows are bounded by 4 KiB per file and the unchanged 24 KiB total packet.
Oversized windows are omitted explicitly. Missing, redacted or truncated windows
remain unknown; a prefix is not a whole-project or runtime claim. With source
inclusion off, **no window is read or sent**. Core memory keeps its independent,
existing opt-in. Preparation uses at most 8 seconds across source reads; a changed
packet or configuration invalidates consent before generation.

The preview exposes the complete packet and this two-call plan:

1. Draft from the approved packet and original question, requesting direct
   examples, audience-appropriate wording and caller/callee attribution.
2. One corrective pass over the **same packet**, original question and validated
   draft. The draft is explicitly untrusted, not evidence. The model must return
   a replacement explanation, not a confidence score or a self-approval.

Both calls use the configured model. There is no third call, retry-until-green,
JSON repair, hidden model escalation or automatic context expansion. Invalid,
truncated, uncited or empty drafts stop before review. Invalid reviews are not
silently replaced with the draft. The final result remains INFERRED, Proof
UNKNOWN, requiresReview=true; optional review metadata explicitly records
semanticVerified=false. The final UI says the correction is not independently
verified. Review failure remains a FALLBACK with no accepted explanation.

The configured output ceiling is used per call. Explicit configurations up to
4096 tokens are now accepted; existing configurations, including 2000 tokens,
are **not raised**. Quality generation has one 60-second deadline across both
passes; the ordinary flow retains its 30-second deadline.

## Cost and cancellation contract

The existing maxRequestUsd is a ceiling for the **complete planned explanation**,
not a new allowance per pass. Before any paid POST, the plan reserves both calls
using the current model listing, the complete messages, the configured output
ceilings and a worst-case 16 KiB serialized draft allowance. Both reservations
must fit the local per-explanation ceiling, remaining lifetime budget and the
provider key's remaining capped allowance. No remembered live tariff is used.
For an existing maxRequestUsd=0.02, the two-call plan must fit that same $0.02.

Provider costs are reconciled per pass. An unattempted second reservation is
released on failure or cancellation. A first cost that is absent stops the
second call; uncertainty retains the first reservation. An absent second cost
retains that reservation. An above-reservation cost blocks further calls and is
not hidden. A 429, cancellation or crash never silently retries or drops spend.
Cached success, failure and interrupted records do not trigger payment again.
The draft text is not persisted in result/diagnostic storage; only the final
accepted answer and bounded pass metadata are retained.

This is an admission/accounting safeguard, **not an absolute guarantee of an
external provider's billing**. The dedicated provider-side key cap remains the
independent limit. Token ceilings, measured latency and actual cost are different
quantities. No improved real-world latency or cost is claimed without a live run.

## Compatibility and scope

Request version 7 binds fresh consent/cache identity to the plan, code windows,
model, configured output ceiling and per-explanation budget. Old responses,
failures, keys and meter files are not rewritten or cleared. The JSON result
schema remains v1 with optional review/pass fields; historical rendering remains.
A config change during asynchronous preparation or before locked generation is
refused rather than silently sending a different model/budget.

Changes are confined to BYOK preparation/orchestration, its HTTP/CLI entrypoints,
checkbox/preview/result UI and qualification tests/docs. Hooks, Protect, source
navigation, scanner implementation, Core, Portal, synchronization, proofs, debt,
human mastery, dependencies and CSS remain unchanged. No workflow threshold,
extraction timeout or existing assertion is weakened.

Rollback: restore the backed-up runtime, not state/spend. A separately chosen
output limit above 2000 must first be lowered explicitly before using the old
v6 runtime, whose configuration validator did not admit the new upper bound.
The existing human recipe's 2000 setting needs no adjustment.

## Executed checks and their limits

The working baseline was reconstructed and verified byte-for-byte as Git tree
`a66994133f56ffcea9e67b7cd670df2e820711a3` at v6 head
`b0b4b8393256531775ec0d672a2a0d7ba68ddfe6` before editing. Local environment:
Linux, Node 22.16.0; synthetic credentials and provider replies only.

- Existing BYOK tests are retained; the consent-input UI test is extended for
  the new checkbox. New tests use independently authored analyst/tariff fixtures
  (240 threshold, 25% reduction), not the operator's uploaded private packet.
- Evidence tests cover immutable source identity, indentation, same-named
  alternatives, missing sources, redaction, truncation, bounded packet size,
  metadata-only mode, changing configuration and consent invalidation.
- Orchestration tests cover exactly two calls, same model/packet, separate
  question/untrusted draft, reservation before the first call, budget refusal,
  unknown or excessive costs, failures at each pass, cancellation, concurrency,
  caching, interrupted requests, non-persistence of the draft and UI escaping.
- The existing real-Core CI lane also runs the added corpus test: mutate the
  working file after scanning and confirm that all four approved excerpts remain
  the original captured bytes. That test is skipped locally when Core is absent;
  it must pass in CI and is not counted as a local integration PASS.

Executed final local results: **611 tests, 605 passed, 0 failed, 6 skipped**,
exit 0 in 101.370 seconds. The six skips are the five existing real-Core skips
plus the new real-Core captured-window test. Complete BYOK scope: **88/88**
passed without skips. Syntax checks, `git diff --check` and package dry-run passed;
the two new runtime modules and this record are included in the npm artifact.
Commit-specific CI conclusions are reported separately on the PR.
An offline synthetic draft/revision pair demonstrates transport and accounting,
**not that a live model detected or fixed its own mistakes**. Prompt assertions
and schema admission are not semantic evaluation. The isolated clone has no
Claude/Codex adapter configuration; `doctor` is not a HUMAN qualification here.

## Frozen human comparison before acceptance

First retain the original failed question, scan, model and 2000-token setting;
select quality plus source descriptions, review the new packet/total budget and
send exactly once. Record all attempted cost, elapsed time, result identity,
source-window availability and review metadata. Do not reset earlier failures.

Require direct correct predicted examples; a clear distinction between the used
policy and an alternative; unused helpers not attributed to a caller; no invented
roadmap/execution; usable French; working source links; and preserved consent.

Then vary the problem, not just the wording: (a) a different numeric threshold
and factor, (b) an explicitly imported permissive alternative, (c) nested early
returns or an inverted condition, and (d) omitted/structure-only evidence. Score
each requested case against the supplied source and mark a refusal as useful only
when information is genuinely missing. Repeat comparisons under an explicit
aggregate budget; do not select the best retry and hide the failures.

Until these live comparisons succeed, the semantic quality result remains
**NOT QUALIFIED**. A satisfactory result is the acceptance condition, not a
consequence assumed from the new checkbox or a green CI run.
