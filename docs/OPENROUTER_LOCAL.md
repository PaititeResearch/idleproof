# Optional Local OpenRouter interpretation

Current request-policy candidate: v11 (2026-10-21). It retains the v10
plain-language instructions, v8 answer-first sections and v9 deadline recovery.
It adds bounded HTTP rejection diagnostics, an explicitly unreviewed draft after
a positively identified no-endpoints review rejection, and an exact decimal
conversion of reviewed-mode routing price ceilings. See
[the HTTP qualification record](qualification/OPENROUTER_HTTP_20261021.md).
Earlier version notes below remain historical. The latest 404 trial delivered
no reviewed answer; neither a retained draft nor passing offline tests qualifies
live delivery or semantic quality.

Status: implementation candidate. The 2026-10-13 HUMAN recipe reached paid responses but failed utility: Mistral upstream 429, DeepSeek truncation and an empty interpretation. The recovery changes below require a new HUMAN run; simulated tests do not qualify live provider behavior. No key belongs in ChatGPT, GitHub, Portal, a CLI argument, a screenshot or a test artifact.

Deterministic Core snapshots remain the input authority. The optional interpreter is invoked explicitly outside hooks. Configuration alone never starts a request. The user chooses the model and lifetime project budget; no default model or remembered tariff is used. Before a paid call, the client checks the current model listing and the dedicated key's provider-side cap. Unknown prices/caps fail closed. The ordinary transport has a 30-second deadline (120 seconds shared by the optional two-pass mode since v12), input/output limits, no redirects, a maximum output token count and no automatic retries. A reservation survives uncertain/cancelled responses. Local estimated cost is not a billing guarantee; the dedicated OpenRouter key limit remains the independent hard limit.

The preview lists the exact captured snapshot, paths, source hashes and redacted evidence packet. Metadata-only is the default; adding source descriptions/selected-document excerpts requires an explicit preview option and acceptance of that preview's digest. Changed context invalidates consent. Project text is untrusted data. Returned claims require citations and remain INFERRED; no output is admitted into Proof, Debt Ledger, canonical declarations or human mastery. A citation establishes where supplied context came from, not that an interpretation is correct. The deterministic result remains available on every failure.

Credentials stay on the device: POSIX owner-only mode 0600, Windows DPAPI CurrentUser with encrypted bytes at rest. The CLI reads the credential from stdin only. Config/status/UI never return it. Rotation replaces it; local removal cannot revoke the provider-side key, which must also be revoked in OpenRouter by its owner.

Provider contract references checked 2026-10-10:

- https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion
- https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
- https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key
- https://openrouter.ai/docs/guides/routing/provider-selection (max_price in dollars per million tokens)
- https://openrouter.ai/docs/guides/features/structured-outputs

Human qualification must use an operator-entered dedicated capped key in an isolated project. Check one successful request, a refused request, latency/tokens/provider-reported cost, redaction, cancellation, offline fallback and zero secret leakage. Compare factual correctness/usefulness to deterministic output on the generic corpus. An absent key does not block offline development, and a mocked response is never reported as a live provider PASS.

## CLI and consent workflow

Read a dedicated, provider-capped key from a password manager or secret-safe stdin
pipe. Do not use a command containing the literal key (including shell `echo`).
Run `idleproof ai configure --key-stdin --model <exact-model-id> --budget-usd 2
--max-request-usd 0.05 --max-tokens 800` in the project. All budget/model values are
explicit choices; this example does not promise a tariff. Rotation uses the same
command and preserves consumed/reserved budget. `idleproof ai remove` deletes the
local credential; revoke it separately at the provider.

- `idleproof ai status`: local configuration and reservation state; no key/network.
- `idleproof ai test --allow-network`: explicitly contact key/model endpoints,
  without project context or paid generation.
- `idleproof ai preview --file rules.py --question "Which boundaries need tests?"`:
  display the exact redacted packet and its digest locally.
- Add `--include-source` only to include bounded source descriptions and selected
  document excerpts; add `--include-memory` only to include bounded recorded Core
  context with event citations. Both are off by default.
- `idleproof ai explain` with exactly the same options and `--consent <digest>`:
  request interpretation after reviewing that preview. Changed scope/model/context
  invalidates consent. The cockpit exposes equivalent preview/send/cancel actions.

A successful interpretation records configured/reported model, latency, available
input/output tokens and provider-reported cost (null if absent), reservation and
S/M citations. Unchanged context reuses the cached response, including uncertain
paid failures: it does not silently retry or recharge. API refusals, invalid or
oversized responses, missing tariffs/provider cap, exhausted budgets, offline
service and cancellation retain the deterministic fallback. No response creates
canonical intent, Proof, technical debt or a quiz score.

## Human-recipe recovery (2026-10-13)

- The 12-file default now balances selected intention documents, production
  components ranked by declared references/static links, and test candidates.
  This is bounded triage, not proof of importance or a whole-project analysis.
  The preview reports the selected/eligible/omitted counts, exact paths and full
  outbound packet. Explicit paths still restrict the selection exactly.
- The question is a separate user message, distinct from untrusted project data.
  Output is requested in English, with short sourced claims and
  concrete unknowns. Static relations between selected files accompany the packet.
- For models advertising reasoning support, the request sends
  `reasoning: { enabled: false }` with `provider.require_parameters: true`.
  This small-budget explanation feature does not silently fall back to extended
  reasoning. A provider may reject the setting; a live response is still required
  to qualify compatibility. A reported mandatory-reasoning model fails before
  payment. Output remains capped at the configured value (maximum 2000).
- `finish_reason: length` becomes `BYOK_OUTPUT_TRUNCATED` before parsing content,
  including when truncated content happens to be valid JSON. Missing content,
  malformed JSON, schema violations and empty claims have distinct outcomes.
  Fixed validation reason codes and token/finish metadata are safe diagnostics;
  raw completions, reasoning and keys are not persisted in diagnostics.
- Provider-reported cost is reconciled and displayed even when the answer is
  rejected. If cost is absent, the reservation remains explicitly uncertain.
- Failed paid attempts remain cached. The UI's explicit retry prepares a new
  preview tied to the prior failure and unchanged context; a separate Send is
  required. Replaying the same retry digest returns its cache. A crash-pending
  UNKNOWN is not automatically retried. CLI equivalence: add the failed digest
  via `--retry-of` to both preview and explain, with the new `--consent` digest.
- Request version 3 invalidates earlier previews/caches without deleting evidence
  or resetting consumption. Existing configuration, credential and scan persist.
- The cockpit renders escaped prose, source buttons and collapsed technical
  details. Without an observed session it does not invent live agent activity.

Provider semantics checked against official documentation on 2026-10-13:
https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
(`exclude` hides reasoning; it does not stop token consumption).

Resume the HUMAN test with the same global question, empty paths, source
descriptions explicitly checked, memory unchecked, a newly reviewed preview,
then one Send. Check useful English prose, rules/service/access/view and declared
plans, clickable citations, no invented execution, visible omissions and cost.
Success on that step does not qualify task/memory/Portal or the entire recipe.

## Content policy v5 (2026-10-20)

Generated prose follows an explicit user language request; otherwise it remains
English. Maintained UI labels, CLI messages, JSON keys and source identifiers are
unchanged. The default UI question asks for supported explanations/examples, not
for a roadmap inferred from filenames.

The single generation request now asks for direct answers and predicted examples
in `claims`, with optional actionable checks in `nextTests` and specific missing
evidence in `unknowns`. Its policy distinguishes actual supplied expressions from
structure-only context, including when source descriptions were selected but no
clauses were captured. No additional file is read or included in the request.
Predictions remain inferences, not executed tests or Proof.

A schema-valid response with no claims still returns
`status: FALLBACK`, `code: BYOK_EMPTY_INTERPRETATION`, `answer: null`. When it
contains non-empty `unknowns`, an **optional** `limitations` array retains only
the validated, redacted strings. The UI labels these as model-reported limits,
asks the user to review the selection and prepare a new preview, and does not
offer a blind retry (`retryable: false`). It does not mark the abstention as a
successful explanation or independently verify the model's assessment. Empty,
malformed, truncated and invalidly cited responses retain their failure handling.
Old cached failures without `limitations` retain their old display. A deliberate
CLI retry is still subject to the existing new-preview/new-consent path; no
automatic retry or hidden context expansion is added.

Request version **5** changes the consent/cache digest, so a v4 consent cannot
authorize a new-policy request and a v4 result cannot be mistaken for a v5 model
response. Historical files and consumed/reserved spend are not rewritten or
reset. All source/memory opt-ins, response schemas, source navigation, model
choice, provider cap/price checks, request limits and 30-second deadline remain.

The new policy is a quality intervention, **not** a semantic verifier. The
validator still enforces structure and citation membership, not entailment.
Neither a passing offline mock nor the policy text proves model accuracy,
resistance to prompt injection, improved latency, or HUMAN acceptance. Retest the
frozen human questions and the qualification corpus with real responses before
calling the new quality level accepted.


## Optional captured-code and corrective-review mode (v7)

The unchecked **Add captured code and one corrective review** option adds up to
two paid calls using the same configured model, sharing the existing per-request
budget for the entire explanation. CLI: add `--quality` to both `ai preview` and
`ai explain`, keeping all other options and the new consent digest identical.
Source bodies still require `--include-source`; memory still requires its own
opt-in. The preview shows the new windows and call/cost plan before Send.

Code windows come only from the immutable scan and already-selected paths: at
most the first 40 lines and 4 KiB per file, within the existing 24 KiB packet.
They preserve indentation and imports; missing/redacted/omitted portions remain
explicitly unknown. A window is not a runtime trace. No project code executes.

The second call corrects the first draft against the same evidence. It is a model
review, not independent truth verification. Both passes must fit the configured
maxRequestUsd and remaining project/key budgets before the first paid request.
An existing $0.02 ceiling is **shared**, not doubled. Actual costs are reconciled
per pass; the provider-side capped key remains the independent billing limit.
Cancellation, uncertain costs and malformed results do not cause a retry loop.

Existing token settings are unchanged. An explicitly configured maximum may now
be up to 4096 output tokens per call; increasing it also increases the reserved
cost. The quality plan has a 60-second generation deadline, versus the ordinary
30-second single-call path. Final results display total cost/duration and the
number of attempted passes. Historical answers and spend remain intact.

Use a fresh preview after selecting the option. Do not reuse v6 consent or reset
the cost meter. The first human comparison should retain the same model, question
and 2000-token limit so that the new evidence/review intervention can be assessed
before changing additional parameters. The qualification record lists acceptance
criteria and known limitations. No workflow or mock result proves live quality.

## Answer-first reviewed explanations (v8)

The existing quality checkbox now prepares an ordered checklist from exact spans
of the user's question. It is visible in the preview and part of its consent
identity. Complete captured source files replace duplicate flattened behavior
clauses; partial windows retain their additional descriptions. No selected path,
source byte, source opt-in, memory opt-in or capture limit changes.

The two model passes return short titled answer sections, real information gaps,
optional follow-up checks, and explicit links from question points to answer/gap
sections. The editor receives missing links and is asked to repair substantive
omissions before polishing prose. Proposed tests cannot serve as answer links.
The final page leads with the answer and puts optional follow-up checks behind
an expandable section. Existing citation buttons remain local source navigation.

These links are model-reported, NOT evidence of semantic completeness or truth.
Unknown/duplicate question IDs, invalid indexes, malformed headings and invalid
legacy answer fields are rejected. An unlinked final point is visibly flagged as
needing completion while the useful sourced portions remain available. A model
can still link an inadequate sentence or misclassify a content request as a
style instruction; human evaluation remains necessary. No green coverage score,
independent verification or automatic additional call is introduced.

The stored answer retains the existing three-array structure and authority;
optional `presentation` holds headings and model-reported coverage, including
redacted question spans. The intermediate draft is still not stored. Historical
results without this field render as before. Request policy v8 requires a fresh
preview; keys, meter reservations, costs and old results remain intact.

The same two-call plan, configured token ceiling, 60-second deadline and existing
whole-explanation cost ceiling apply. The estimated reservation now includes an
explicit bounded allowance for the larger response schema. Existing 2000-token
and $0.02 settings are unchanged. Ordinary single-call mode keeps its previous
message/three-array output policy. No execution or hidden evidence retrieval is
added, and no live semantic improvement is claimed from fixture responses.


## Plain-language instructions (v10, retained)

Reviewed mode defaults to an explanation for a non-programmer: concrete effect,
complete access conditions and predicted examples first. Exact implementation
detail remains appropriate when the original user question explicitly requests
it. The existing second pass also edits unnecessary jargon, repeated facts and
misclassified unknowns. This does not alter source selection, response admission,
model choice, token settings, or the two-call ceiling. Prompt instructions and
synthetic fixtures do not prove model compliance. See
[the v10 record](qualification/OPENROUTER_PLAIN_LANGUAGE_20261021.md).

## Bounded HTTP diagnostics and routing rejection (v11)

A reviewed-mode HTTP failure keeps its actual status. The error body is read only
transiently, up to 8 KiB / 256 chunks / 500 ms and within the existing request
cancellation signal. Only fixed local diagnostic codes and recognized canonical
error types may be retained. Error messages, headers, provider metadata, request
IDs and raw bodies are not copied into results, logs or model context.

A bare HTTP 404 does not identify a routing cause. Only a complete bounded JSON
error with code 404, a message beginning `No endpoints found`, and no conflicting
canonical error type is classified `NO_ENDPOINTS_FOUND`. During review only,
this can preserve the previously admitted, redacted draft in `unreviewedDraft`.
The result remains `FALLBACK`, `answer:null`, `review.completed:false`,
`semanticVerified:false` and `retryable:false`. The draft stays behind an
explicitly unreviewed disclosure with local citations. Generic 404/503 responses,
malformed/error-policy responses, explicit cancellation, budget failures and
unfinished/invalid initial drafts do not gain this recovery. Existing owned
review-deadline recovery is retained. Nothing is rescued retrospectively.

`routingDraftRecovery: explicit-no-endpoints-only` is disclosed in the preview
and bound to fresh v11 consent. Known reported costs remain distinct from
unresolved reservations; HTTP status alone does not establish a refund or a
zero-cost failed call. Historical uncertain reservations are not released.

Reviewed routing limits now convert advertised dollars/token to dollars/million
through decimal exponent shifting instead of binary multiplication. For example,
a catalogue decimal of 0.0000001 now serializes as 0.1 per million, not
0.09999999999999999. No epsilon or availability markup is added. Prices that
cannot be represented faithfully on the JSON wire fail closed before payment.
The actual catalogue tariff, request fees, provider privacy/parameter requirements,
model and configured budgets are unchanged. This numerical bug was reproduced;
it is not established as the cause of the reported 404.

No additional paid call, retry, automatic model switch, dropped privacy setting
or increased commercial ceiling is introduced. A new live human comparison is
still required to assess delivery and the retained plain-language instructions.


## Longer reviewed deadline (v12)

The optional two-call quality path now has a **120-second shared deadline**,
previously 60 seconds. Before consent, the preview shows this bound and the
rule that a second paid review is only started if at least **20 seconds** remain.
If less time remains after an accepted draft, no second call is made:
its unused reservation is released, while the sourced first draft is available
only in a collapsed **UNREVIEWED** disclosure. The result remains FALLBACK,
never a reviewed explanation or Proof. If the second call is started, the
existing deadline/cancellation and unknown-cost protections remain.

A longer wait does not permit additional calls or output tokens. The current
model, 2,000-token setting (if configured), $0.02 whole-plan ceiling, key cap,
source selection and privacy policy are unchanged. Ordinary single-call mode
retains its 30-second limit. v12 changes preview consent/cache identity, but
does not alter earlier results or previously held uncertain reservations.
Historic v7/v8 references above reflect the limits applicable at those versions.

## Optional contextual technical-learning thread (qualification candidate)

A reviewed explanation can be explored further without lowering its technical depth.
Select a phrase inside an explanation section or use **Ask about this section**.
The *Explore this explanation* card keeps follow-up questions/replies visible
locally and points back to the original sourced explanation. Prepare a separate
**Preview focused sources** to see exactly which cited captured source excerpts,
selected phrase and bounded prior conversational pointers would be sent. Only an
explicit **Send approved follow-up** makes a paid request.

The root result, claim and source snapshot are checked locally; a changed capture
requires a new root explanation. Only the selected claim's cited source files are
eligible, while the previous conversation is reference context rather than
coding evidence. The same model, two-pass review and cost/timeout limits apply;
no automatic retry, Core-memory upload, Proof or mastery write is implied.
Local discussions are protected under `.idleproof/byok` and are not Portal sync.
Direct selection of code lines is planned separately and not yet implemented.
