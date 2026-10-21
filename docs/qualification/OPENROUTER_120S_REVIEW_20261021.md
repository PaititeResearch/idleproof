# Reviewed OpenRouter deadline — v12 qualification candidate, 2026-10-21

## Evidence and objective

The human v11 trial for a short French project explanation finished with `FALLBACK` at 60,062ms. The draft consumed 56,611ms, the review started at 57,171ms with only 2,829ms left, and was aborted 2,890ms later. This is an observation about scheduling, not a confirmed provider fault or semantic-quality measure. The draft was separately preserved as **UNREVIEWED**. Known cost `$0.00048232806`; the attempted review's `$0.00183706752` remained reserved and uncertain, not confirmed spend.

The user requested more time. v12 increases **only the opted-in two-call reviewed path** from 60 to 120 seconds. The existing 30-second ordinary one-call path stays unchanged. The reviewed mode starts a chargeable corrective call only if at least **20 seconds** of the shared deadline remain after the accepted draft. This minimum is a scheduling guard, not a guarantee that a review completes.

## Safety and admission

- Preview shows the 120-second shared bound, 20-second minimum, two-call limit, configured token cap, and the same whole-plan cost ceiling. `requestPolicy` and `REQUEST_VERSION=12` bind these changes to a fresh explicit consent/cache digest; old results and consent cannot be silently reused.
- The model, provider constraints, data collection denial, source selection/retention, Core memory opt-in, immutable source windows, prompts, strict citations/schema, and cost calculations do not change.
- At the beginning of the review stage, if fewer than 20 seconds remain, **do not make the second POST**. Release its *unattempted* reservation, preserve the accepted and redacted first draft in an explicitly **UNREVIEWED** disclosure, and keep `FALLBACK`, `answer:null`, `semanticVerified:false`, `review.completed:false`, `callsMade:1` and nonretryable status. Confirmed draft spend is retained. No third call or automatic retry.
- Existing 120-second abort still cancels ongoing requests, retains cost uncertainty for an attempted review, and never promotes a late model response. Explicit user cancellation still must not recover a draft.
- New reviewed results include `review.deadlineMs`; historical v11 results lacking this field continue to report their genuine 60-second deadline. All preexisting project history and budget reservations remain intact. No meter reset or retrospective price interpretation.

## Qualification protocol

Tests simulate a 56.611s draft plus a 10s review (must complete), a 110s draft (must skip and release review reservation), a boundary at exactly 20s (allowed), review timeout with unresolved cost, cancellation, old-result rendering, and explicit refusal of v11 consent. Existing OpenRouter tests must continue passing, including the real 404 no-endpoints recovery, privacy, citation and budget guarantees.

Do not claim a live semantic PASS from synthetic tests. CI must pass for the exact candidate SHA and matching tree before installing into WSL. The PR remains a draft and no Core or Portal code is changed. Human follow-up should reuse the short French question, same scan, 2,000-token setting, <= $0.02 whole-plan cap, source on, memory off, and one fresh explicit preview-and-send. Measure first and second durations as well as factual clarity and costs; do not invent a refund for older unknown reservations.
