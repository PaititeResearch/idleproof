# Contextual learning thread — isolated alpha qualification (2026-10-21)

Status: **experimental, not deployed, not merged, not a human semantic PASS**. Based on the v12 reviewed OpenRouter candidate `deece3e24d7d0422571d8fe2f04c4b3c4e11aa7b` in PR #42. This work must stay in a separate branch/draft until real interactive human acceptance.

## Product decision

IdleProof's goal is **progressive technical understanding**, not reducing every answer to a nontechnical summary. Preserve the existing first explanation, including named functions, precise conditions, examples and real source citations. Let the user select a sentence or choose *Ask about this section* and ask a focused follow-up. Show all follow-up questions and sourced replies in a dedicated persistent **Explore this explanation** card, without obscuring the original explanation. The UI chrome remains English for international use; the follow-up model is asked to answer in the user's language. Mobile uses a stacked, scrollable card rather than a modal.

Stage 1 supports selecting text in a **reviewed explanation**, not arbitrary code. Stage 2 (still pending) will support selecting lines directly inside captured source views and connecting a code-range citation. Do not claim stage 2 already exists.

## Harness responsibilities even with user-supplied models

BYOK delegates model choice and model-generated quality to the operator, but the product **retains responsibility** for safe and useful context assembly, source identity and citation admission, bounded prompt construction, explicit consent, budget/accounting, privacy and understandable failure states. Lower-quality models may still hallucinate or fail; harness guarantees must never imply semantic proof.

A follow-up is bound to the exact **root result digest**, a validated claim index, an **exact substring of that claim**, the cited captured-source identities and the unchanged project snapshot. The server reconstructs these from its private saved root; no client-supplied path, source text or fabricated claim is trusted. A missing/stale scan or claim without source citations is rejected before payment.

For each follow-up, the existing reviewed OpenRouter transport receives **only paths cited by the selected claim** (not the entire previous project selection), plus at most two short previous successful question/reply pairs **as untrusted referential context**. The quote and history are data, never proof, and the updated prompt instructs re-reading immutable captured sources rather than repeating past model claims. The outgoing packet remains at most 24 KiB and is fully visible in the normal *Preview focused sources* UI before a separate **Send approved follow-up** click. Core recorded memory is not automatically transmitted. No new model, retry, endpoint fallback, third call or larger price ceiling.

The rooted thread is stored locally under `.idleproof/byok/thread-<rootDigest>.json`, with a `thread-latest.json` pointer. Existing private 0600 atomic storage functions are reused. Each turn stores its question, source-exact quote, claim index, timestamp and the new existing result digest. The result itself remains in the **existing `answer-<digest>.json`** cache and meter, not duplicated in arbitrary history records. Up to 24 turns per root; at most two preceding successful turns supplied as referential context. Current source changes block *new* follow-ups while preserving the ability to inspect old discussions.

A repeated identical anchor/question reuses its original history scope and **same consent/cache digest**; it cannot silently pay again merely because a new history turn was appended. Editing the question, selection or source after preview invalidates consent. A fallback, failed review, canceled call or cost uncertainty is recorded honestly, not promoted to a reviewed answer. The existing local 120-second reviewed deadline, 20-second minimum before attempting the second call, two-call cap, configured 2000 output tokens/call in the human recipe and $0.02 **whole-plan** limit are inherited unchanged. The ordinary one-call explanation remains unchanged.

The new HTTP endpoints stay behind the existing loopback/Host/Origin gate. GET is private Local read-only; preview performs source capture without model generation; explain uses the existing optional interpretation mutex, cancellation signal and BYOK accounting. No Core, Protect, Portal, feature-memory, canonical ledger, hooks or credentials are changed. The local thread is **not** authoritative Core memory, synced Portal data, Proof or verified understanding.

## Qualification gates and honest limits

Run complete BYOK and project/local suites, including older renderer fingerprints, consent hashes, v12 timeout and budget tests. New synthetic tests check root/source/selection spoofing refusal, immutable snapshots, source minimization, identical-repeat idempotence, bounded cross-turn context, failed provider accounting, CSRF, and GET/preview without paid requests. The Chromium recipe adds two responsive snapshots (390/1440 px) exercising *Ask about section → Preview → Send* using intercepted **synthetic** replies, and verifying no paid POST happens on selection or preview.

Human validation requires a live v12-or-later authorized test installation and a new explicit preview. Check anchored selection with pointer, mobile touch and keyboard, longitudinal thread clarity, citations and stale scan behavior. Compare several user-selectable models, including lower-capability ones, but never assert model semantic correctness from contract tests. **No real provider call or automatic installation is authorized by this document.**

### Deliberately not yet implemented

- Selecting exact lines within the captured code pane (stage 2).
- Automatically recording comprehension mastery or publishing to Portal.
- Multiple simultaneous users/devices or cloud chat synchronization.
- A model-agnostic truth verifier. Format, citations and source matching are guaranteed more narrowly than semantic correctness.
