# Review deadline recovery — 2026-10-21

Qualification candidate on installed v8 `ad342c0905ffab3e6ba1f77828b1c3f81981bc17`.
Request policy v9. Keep PR #42 draft and unmerged. No live model, operator key,
WSL update, source dump, or new HUMAN content PASS is part of this development.

## Observed incident and limits

The operator's natural-language-summary trial ended after 60,171 ms with
`FALLBACK / BYOK_CANCELLED_OR_TIMEOUT / answer:null`. The draft reports a normal
finish, 5,334 input tokens, 1,258 output tokens and $0.000733116. The attempted
review has no response diagnostics/model/provider/cost. Its $0.002804717 retained
reservation is **not a confirmed charge**. The total retained $0.003537833 is the
known first cost plus the uncertain review reservation. Total actual cost is
unknown. Both calls were attempted; they did not both complete.

The installed code has one 60-second timer shared by preflight, draft and review.
The reported duration is consistent with that timer, but the legacy error does
not distinguish user cancellation from a timer abort, nor report each pass's
duration. Do not attribute the failure to a particular review provider or claim
that the draft consumed most of the deadline. Top-level legacy diagnostics are
those of the last received response (here the draft), not the unfinished review.
No output-cap truncation is reported. The previously successful v8 long-question
trial remains separate; this failed trial cannot assess its missing final text.

## Narrow intervention

- Keep the shared 60-second limit, model, token ceiling, two-call maximum,
  reservations, provider caps, no automatic retries, and all content policies.
- Distinguish locally triggered deadline, explicit cancellation, and an abort of
  unknown origin with fixed diagnostic values. Record the active failure stage.
  Reset top-level completion diagnostics when entering a new pass so an unfinished
  review cannot look like it finished normally using the draft's counters.
- Record start offset, remaining deadline and elapsed request time per attempted
  pass. These include time until a complete bounded response or an error, not
  server inference time. Stage durations are local measurements.
- Split known provider-reported spend from unresolved retained reservations.
  Uncertainty remains in the meter; no refund is inferred from cancellation.
- Only when **our local deadline interrupts the review**, retain the already
  admitted, redacted first draft in an optional `unreviewedDraft` field. Keep
  `status:FALLBACK`, `answer:null`, `review.completed:false`, `retryable:false`
  and `semanticVerified:false`. The completed review remains the only normal
  accepted answer. An expired plan cannot be rescued by a late response.
- Expose the draft only inside a collapsed disclosure explicitly labelled
  unreviewed. Citation navigation stays local. Format/citation membership checks
  are not semantic verification. Unknowns remain visible within the draft.
- No recovery draft on explicit cancellation, malformed/filtered review, HTTP
  failure, unknown first cost, excessive cost, first-pass failure or preflight
  failure. No new recovery draft is written to pending/crash records or successful
  results. Do not leak raw provider completions or rejected review content.

This deliberately changes the earlier draft-retention policy for ONE terminal
failure condition. The preview names the local retention, `draftRecovery` is
consent-bound, and v9 invalidates old consent/cache identity. Nothing is enabled
or retroactively restored in the operator's v8 history. A missing old draft
cannot be recovered from its diagnostics. Ordinary one-call behavior and prior
result rendering are unchanged.

## Non-goals

This does not establish why the live request was slow, reduce the provider's
latency, increase the deadline, automatically route to another model, or repair
semantic issues recorded in earlier trials. It is a transparency and recovery
improvement, not a way to turn the failed trial into a HUMAN PASS. A future
provider comparison or timeout change needs separate evidence/consent.

No changes to Core, Portal, Protect, hooks, scanner, source extraction, source
selection, prompt/schema, source controller, HTTP/CLI entrypoints, credentials,
package/dependencies or CSS. No CI threshold or existing assertion is weakened.
The browser recipe adds two synthetic timeout-disclosure/citation checks.

## Verification

Virtual clocks and synthetic provider responses only. The 15 new regression
cases on unchanged v8 yielded 6 passes / 9 failures. The candidate passes all 15.
The complete OpenRouter suite passes **141/141**, including existing consent,
cache, budget, malformed-response, review and historical-rendering tests.

Tests cover review deadline, manual cancellation, first-pass/preflight deadlines,
late response, missing/over-budget cost, invalid/filtered review, unowned abort,
cache replay, exact reservation retention, redaction/escaping, source links,
closed disclosure and v8 consent rejection. No paid provider request was made.
Full local suite: **664 total, 658 passed, 0 failed, 6 existing real-Core
skips**, exit 0 in 104.464 seconds (Linux, Node 22.16.0). Syntax, diff and
package dry-run checks also pass. Browser and exact-head CI results are recorded
on the PR after execution; a pending run is not counted as a pass.

## Human resumption

Install only after exact-head CI passes and a private runtime/state backup.
Keep the same natural question, scan, model, source+quality options and budgets.
Prepare a fresh preview and Send once. The desired outcome remains a clear,
correct, complete reviewed answer. On a review deadline, distinguish the failed
review from the optionally opened unreviewed draft, preserve cost uncertainty,
and inspect the new per-pass durations. Do not mark delivery/quality as passed
merely because a draft is now accessible. No automatic paid continuation exists.

Rollback is runtime-only; never restore old spending over new attempts.
