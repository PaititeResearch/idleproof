# Reviewed HTTP rejection — 2026-10-21

Qualification-only candidate based on v10
`fa9565952cd05da58b03eb83f97c4aa3bc8ae741`, request policy **v11**.
Keep PR #42 draft and unmerged. No update of the operator's WSL is part of this
code development, and no paid provider request or operator credential is used.

## Observed incident, not an inferred provider diagnosis

The operator supplied `BYOK_HTTP_404`, `failureStage:review`, after 8,853 ms,
digest `7e1dba4d6cdaffa5b13f20c3fba076f5ca5b8f8ab80c9f9ac3db570c18b7db78`.
The initial draft completed normally: 5,799 input / 916 output tokens, 8,142 ms,
reported cost $0.00048232806. It identified OpenInference as its provider.
The attempted review took 123 ms, with 51,271 ms left from the shared deadline.
It reported neither completion, model, provider nor cost. Do not attribute that
review to the draft's provider. This is not the earlier 60-second timeout.

Known reported cost is $0.00048232806. The second reservation $0.00183706752 is
unresolved. Total retained $0.00231939558 is not a confirmed bill. No reservation
release, refund or successful recovery is inferred. There is no final answer,
and no draft text is available in that old failure envelope.

Inspection of the exact v10 code shows both passes use the same completion URL,
model, response schema and provider constraints, with different messages. HTTP
error bodies are cancelled before decoding, so the result cannot distinguish a
wrong resource, no eligible route, model-level rejection or another 404 reason.
The original cause cannot be reconstructed from status/timing alone. Current
endpoint availability would not retrospectively establish the incident's cause.

## Narrow changes

1. In reviewed mode only, read bounded HTTP error metadata before returning the
   original failure code. The bounds are 8 KiB, 256 chunks and 500 ms, with the
   existing cancellation signal. Decoding failure never masks the HTTP status.
   Fixed diagnostics report status/body disposition and a whitelisted canonical
   error type. Free-form messages, metadata, headers, provider names, request IDs
   and raw response bodies are not persisted or reflected in HTML.
2. Classify no-endpoints only from a complete bounded JSON error whose numeric
   code is 404 and whose message explicitly begins `No endpoints found`, without
   a conflicting error type. A bare 404, content-policy error, unknown message,
   truncation or network-thrown property cannot authorize recovery. Reader-owned
   metadata is held in a private WeakMap, not trusted from arbitrary exceptions.
3. After that specific review rejection only, retain the previously admitted,
   redacted draft in a separate unreviewed disclosure. Keep FALLBACK, answer:null,
   review.completed:false, semanticVerified:false and retryable:false. No third
   request or retry is made. This does not classify the draft as correct. Explicit
   cancellation, invalid citations/format, unknown draft cost, excess cost,
   first-pass/preflight failure and generic HTTP errors are not rescued. Owned
   local review-deadline recovery continues unchanged.
4. Disclose the additional retention in preview as
   `routingDraftRecovery:explicit-no-endpoints-only` and include it in the new
   consent/cache identity. Preserve old answers, credentials, configuration and
   all actual/uncertain spending. A runtime rollback must not rewind the meter.
5. Give HTTP rejections a specific human-facing message and show known spend
   separately from uncertainty. Existing HTTP404 records become more readable;
   they do not gain missing cause, draft or provider information retroactively.

## Reproduced price-encoding defect (not a proven incident cause)

The new transport regression expected an endpoint ceiling exactly equal to its
catalogue tariff. It exposed that `Number('0.0000001') * 1e6` serializes as
`0.09999999999999999`, not `0.1`. A strict routing price comparison could thereby
exclude an endpoint exactly on the intended boundary. The first call in the
operator's trial succeeded with the same constraints, and its exact error body
is unavailable: this finding is NOT proof that rounding caused this incident.

The reviewed path now shifts the catalogue decimal exponent for prompt and
completion limits and validates the JSON decimal round trip. Request fees remain
unscaled. No price epsilon, markup, cheaper-to-expensive model fallback or privacy
relaxation is added. Unrepresentable/invalid rates fail before any generation.
Reservation estimation still uses the existing full-plan computation; the actual
reported charges remain authoritative for reconciliation. The ordinary single-
call implementation is deliberately outside this increment.

## Preserved boundaries

The v10 writing policy, question, selected evidence, source/body opt-ins, memory
opt-in, structured schema and answer validators are unchanged. Same chosen
model, token settings, two calls maximum, 60-second shared deadline and complete-
explanation budget. No model/provider pinning, no automatic retry and no new
network endpoint. `require_parameters:true`, `data_collection:deny` and faithful
catalogue max_price remain. Core, Portal, Protect, hooks, scan/source reader,
server/controller, credential storage, dependencies, CSS and production workflows
are unchanged. Two browser cases are additive, not replacement gates.

One existing version assertion now expects 11 rather than 10; its v9 rejection
and byte-preservation assertions remain. New tests separately reject v10 consent.
No existing behavioral assertion, timing or performance threshold is weakened.

## Executed offline checks

Linux / Node 22.16.0; synthetic credentials, sources, responses and virtual clocks.
No source executes in the model tests and no live provider is contacted.

- Exact v10 source tree reconstructed and verified against GitHub:
  `55c9712e61713e14a96b48ea52e16baa7d8f91fb`.
- Baseline OpenRouter scope: **156/156 passed**.
- New HTTP suite before decimal correction: **26/27 passed**. The remaining
  assertion exposed the exact price-unit defect; its expected value was not
  relaxed. After correction the HTTP suite passes **27/27**.
- New decimal-price suite: **23/23 passed**, including exact scientific/decimal
  spellings, unchanged fees, zero tariffs and fail-closed lossy conversion.
- Complete candidate OpenRouter scope: **206/206 passed**, no skips.
- Full suite: **729 total / 723 passed / 0 failed / 6 existing real-Core skips**,
  exit 0, 109.157 seconds. The six Core-dependent tests require the CI environment.
- Syntax/diff checks pass; package and remote CI outcomes are recorded in a PR
  checkpoint only after actually completing. Browser cases at 390/1440 px verify
  collapsed disclosure, no success badge, honest cost text, zero automatic AI
  calls and opening the cited immutable source. Local browser execution is not
  claimed when Playwright is unavailable.

Synthetic tests check HTTP decoding, status preservation, cancellation/deadlines,
size/chunk bounds, refusal types, forged-error properties, first-pass/preflight
failure, strict citation/format admission, redaction/escaping, cache replay and
unchanged budget/configuration. They are not live semantic evaluations.

## Provider references and limits of the diagnosis

Official references checked on 2026-10-21:
- https://openrouter.ai/docs/api_reference/errors-and-debugging
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/guides/features/structured-outputs

Provider selection applies price/privacy/parameter filters. The model appearing
in a catalogue or a prior successful request does not establish that a matching
endpoint exists for every later request. However, this fact is only a hypothesis
for the supplied 404 until safe positive diagnostics are observed. The fixed
classification deliberately does not choose which filter or provider was at fault.

## Human acceptance still required

Preserve the same captured scan, natural-language question, model, 2000-token
setting and budgets; descriptions and review enabled, Core memory off. Install
only after exact-head CI via a guarded runtime-only updater, with backups and
protected-state comparisons. Prepare a fresh v11 preview and explicitly send
once. A successful response must still be checked for clarity, factual content,
source support, cost and latency. If an endpoint rejection recurs, inspect the
fixed diagnostics and any separately labeled unreviewed draft; do not confuse
availability recovery with a completed or semantically verified explanation.

Previous human semantic FAIL/PARTIAL records and unresolved charges remain.
This candidate makes no claim to repair a live endpoint, recover the lost old
draft, establish stable availability or deliver a new HUMAN quality PASS.
