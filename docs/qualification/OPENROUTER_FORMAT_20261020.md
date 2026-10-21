# OpenRouter output-format follow-up — 2026-10-20

Status: qualification candidate, no merge or release. This small follow-up is
stacked on `f09e67c1fadaf27c02ba93d8d8e6b7b75974d2cc` in PR #42.
The operator's WSL recipe, Core and Portal are not modified by this development.

## HUMAN observation and limits of diagnosis

The operator supplied a screenshot and the safe result envelope from a live
OpenRouter attempt with source descriptions included, Core memory excluded and
12 of 16 eligible files selected. It reports:

- `FALLBACK`, `BYOK_ANSWER_REJECTED`, `validationReason: UNKNOWNS_FORMAT`;
- `finishReason: stop`, 3906 input tokens, 642 output tokens, zero reasoning tokens;
- 23308 ms latency and reported/reserved cost of 0.00018765792 USD;
- `answer: null`, deterministic fallback retained, no automatic retry.

The observed result is a failed explanation, not HUMAN PASS. There is no indication
of output-limit truncation in this envelope. The original rejected completion is
not retained. The legacy error combines a non-array, more than eight items,
non-string items, blank items and strings longer than 500 characters. Therefore
**the exact malformed shape and its cause cannot be recovered from this record**.
Do not state that the model returned objects, or that this follow-up reproduces
its original text. The installed runtime revision was not independently confirmed
by the screenshot/envelope; the prior update targeted f09e67c1.

Inspection of f09e67c1 finds preventable instruction ambiguity: the prompt calls
`nextTests` optional while the schema requires all three fields; it does not
explicitly distinguish plain-string `unknowns` from cited claim/test objects, and
no longer states a short target for the number of returned items. These are
corrected without asserting they are the proven cause of this live incident.

## Bounded correction

1. Require all three JSON arrays explicitly in the message policy. `unknowns`
   contains only non-empty plain strings, never objects or null. Empty sections
   use `[]`. State existing 8-item, 1000-character claim/test and 500-character
   limitation limits; prefer up to six claims, two checks and three limitations.
   Keep direct examples, requested language and source/intent boundaries.
2. Add a descriptive hint to the existing `unknowns` JSON Schema property. No
   type, bound, required field, citation rule or strict-mode setting is relaxed.
3. Preserve `UNKNOWNS_FORMAT` and add a fixed, allowlisted diagnostic detail:
   `UNKNOWNS_NOT_ARRAY`, `UNKNOWNS_ITEM_LIMIT`, `UNKNOWN_NOT_STRING`,
   `UNKNOWN_EMPTY` or `UNKNOWN_TEXT_LIMIT`. No rejected prose, keys, object
   property names or excerpts are persisted or displayed. The UI provides a
   corresponding fixed message; older cached results keep their original display.
4. Request version 6 requires fresh preview consent and does not replay v5
   results under changed instructions. Historical results and spending are kept.

The `validateAnswer` function and evidence selection are byte-identical to the
parent candidate. There is no normalization, truncation, JSON repair, second
model call, automatic retry, quota increase or secret/raw completion logging.
A format rejection remains `FALLBACK / answer:null`. Provider-reported cost is
retained even when the answer is rejected; missing cost retains the reservation.
Source/memory consent, source navigation, deadlines, model choice, storage, hooks,
Protect, Core, Portal, proof/debt, human mastery and dependencies are unchanged.

OpenRouter's official structured-output guidance notes that enforcement differs
between provider implementations, even with `strict: true`. This is why local
validation remains mandatory rather than treating a successful HTTP response as
proof of conformance. Reference inspected 2026-10-20:
https://github.com/OpenRouterTeam/docs/blob/main/guides/features/structured-outputs.mdx

## Executed local verification

Environment: isolated Linux, Node 22.16.0, synthetic credentials/provider only.
The baseline archive's 532 blobs were verified and the supplied PR #42 patch
reconstructed exactly tree `c04b0e6603a8c1736595c84f00d7bf7bbec137de` before editing.

- New format-regression file on unmodified f09e67c1 code: **15 tests, 5 pass,
  10 fail**. Failures expose missing format guidance, missing safe detail and v5
  consent still being current. They do not reproduce the unknown live payload.
- Candidate complete BYOK scope: **52/52 pass, zero skips** (37 existing plus
  15 new). All existing BYOK tests and assertions are retained.
- New tests cover non-array forms, excess entries, structured/null/blank/long
  items, exact accepted boundaries, unchanged prior-error precedence, cost,
  cache/replay, absent cost, no raw-output leak, HTML escaping, old rendering,
  stale v5 consent and foreign-error detail rejection.
- Full local suite: **574 tests, 569 passed, zero failed, five pre-existing
  real-Core skips**. Exit 0; 96888 ms. Real-Core coverage is a separate CI job.
- JavaScript syntax checks and `git diff --check`: pass.
- `npm pack --dry-run`: pass; the updated message policy is packaged.

CI outcomes are reported separately on the PR when read. No pending suite is
counted as passed. No live provider call, new HUMAN
acceptance, WSL update, Core/Portal update, publication or merge is claimed.

## Human resumption and rollback

Install only a CI-qualified commit with the private state/runtime backup procedure.
Check actual served files and REQUEST_VERSION=6 before another paid request.
Refresh Local, keep the existing scan, model, budget and frozen question. Prepare
a fresh preview, inspect the same selected context, and send once explicitly.
Do not use `retryOf` from v5 under v6; its consent identity intentionally differs.

If successful, assess direct examples, source fidelity, useful missing-information
wording, citations and usability. If rejected, share only the safe diagnostic;
the new fixed detail identifies the exact validation category without raw output.
Do not run repeated paid retries as a substitute for diagnosis. A successful single
response is still not a general semantic quality guarantee.

Rollback reinstalls the previous backed-up runtime, not state or spending files.
Never reset the meter or delete retained failed attempts to make the test appear
successful. This candidate does not retrospectively repair the rejected response.
