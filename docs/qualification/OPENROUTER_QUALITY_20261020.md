# OpenRouter content-quality candidate — 2026-10-20

Status: **candidate, not deployed or merged; new-policy HUMAN/live-provider evaluation pending**.
Base: IdleProof `1d5be9affe7080d6b3acd6c99c4561411907b1cc` (UI v3, PR #41).
This lot changes the optional Local OpenRouter explanation path only. It does not
requalify Core, Protect, Portal, historical HUMAN results or the entire Alpha.

## Evidence and scope

Human trials on the base exposed these content issues: a request for French
conflicts with an English-only system policy; predicted examples are put under
proposed tests; names/imports can be overstated as behavior in structure-only
mode; future plans are inferred from file presence; missing information is not
always tied to the requested example. The human also observed that editing the
question disables Send until another preview. That consent behavior is retained.
These are observations on the old policy, not live results for the new one.

The exact baseline was read from GitHub and exported on a separate qualification
branch because this environment could not clone GitHub. The 532 file blobs,
original commit bytes and tree `094d5d45cdd15d2cb285adc6c41489798f6af769` were
verified before editing. The archive contains only tracked source, not user
configuration or credentials. Baseline CI run `39457628743` executed `npm test`:
544 tests, 539 passed, 0 failed, 5 existing real-Core skips.
The qualification helper is not in this candidate's ancestry/diff.

## Implementation

1. `src/byok-prompt.mjs` is a pure message builder. Explicit user language requests
   win; default generated prose and maintained UI labels remain English. Project
   data stays in a separate untrusted evidence message. No project-derived text is
   interpolated into the system message.
2. The policy asks for direct, practical answers, predicted examples in `claims`,
   optional actual suggestions in `nextTests`, and specific missing inputs in
   `unknowns`. It distinguishes present rules, visible call expressions and runtime
   observations, and requires explicit evidence for declared objectives/plans.
3. The policy distinguishes *actual clauses in the approved packet* from
   structure-only context. Ticking source descriptions alone is not proof that
   expressions exist. This does not read additional files or expand the packet.
4. A schema-valid model abstention stays `FALLBACK / BYOK_EMPTY_INTERPRETATION`,
   `answer: null`. Only validated and redacted unknowns are retained in optional
   `limitations`. The UI displays model-reported gaps and asks for a reviewed new
   preview instead of offering a blind retry. It does not certify those gaps as
   objectively correct. Completely empty, malformed, truncated or forged output
   retains its previous failure behavior.
5. Request policy version **5** changes the existing consent/cache digest. Old
   consents cannot authorize new-policy requests. Old results, keys, scans,
   consumed budget and uncertain reservations remain intact.
6. The default UI question asks for supported examples and explicit intentions,
   rather than inviting a roadmap invented from file names. No layout, element
   identifier, event controller or citation navigation is changed.

`INTERPRETATION` and `FALLBACK`, `idleproof.byok-result.v1`, and the model's strict
`claims / nextTests / unknowns` schema stay unchanged. `limitations` is additive
and only appears on the named fallback. Old renderers still fail safely; the new
renderer also handles old results without that field. CLI deliberate retries
still use the existing preview/consent path. No automatic retry was introduced.

## Invariants and non-goals

- Same selected evidence packet, source/memory opt-ins, question separation and
  S/M references. No raw-source upload, widened selection or new data destination.
- Same single generation call, temperature, model choice, output-token cap,
  provider-parameter/privacy requirements, current-price/current-key-cap checks,
  reservation accounting and 30-second deadline. No second model, silent model
  switch, extra paid evaluator or relaxed budget.
- No Core/Protect/hook/sync/assurance/debt/mastery changes, no package dependency,
  no schema migration and no automatic installation on the human recipe.
- A citation membership check is **not** a semantic entailment check. Prompt
  instructions and fixture assertions do not establish model truthfulness or
  prompt-injection immunity. This candidate does not contain a regex-based
  "semantic verifier" or silently rewrite arbitrary model claims as verified facts.
- Selection optimization, model comparisons, global UI translation and Portal's
  historical score-display inconsistency remain separate work, not hidden changes
  in this lot.

## Reproducible offline qualification

```sh
node --test --test-concurrency=1 test/byok*.test.mjs
npm test
npm pack --dry-run
```

The new `byok-quality` tests use synthetic pricing (15% at 200), temperature and
eligibility examples; they are not trained only to the human fixture's numeric
answers. They exercise the **actual request builder/admission/cache/rendering**
with an injected provider. They do not claim to measure generated prose quality.

At the local focused checkpoint (Linux, Node 22.16.0):

- New 13-case file on the unmodified base: **3 pass / 10 fail**.
- Same 13 cases on the candidate: **13/13**.
- Full BYOK scope, including two additional controller cases: **37/37**, no skip.
- All existing BYOK tests retained. No expected old status/error code was changed.
- The first broad local `npm test` attempt hit the 180-second invocation deadline
  after 49 reported passes, without a final suite summary. This is **NOT a full
  PASS**. The pending test concerned auto-debt/reset, not this changed path;
  attribution requires a separate check, not an assumption based on scope.
- A targeted reset/delivery probe on the unmodified baseline subsequently passed
  (1/1). Full candidate CI and browser results must be read on the PR/commit;
  an interrupted or partial run is not promoted to success.

The first candidate test run also found a fixture assertion expecting a JSON
property with value `undefined`. The assertion now compares the serialized
packet shape (property omitted); the same corrected test was rerun on the base
and candidate. No source-admission or privacy assertion was removed.

## Human quality corpus and acceptance

Use the same model/settings and explicit fresh preview for each authorized trial.
Preserve every response (including failures), cost and latency; do not cherry-pick
or overwrite the previous policy's results. Saved identical requests replay the
cache, so a cached result is **not** another independent model trial. Any repeated
paid trial needs an explicitly authorized isolated evaluation setup; do not reset
production spend or falsify request data just to bypass the cache.

| Case | Evidence | Expected quality, not merely formatting |
| --- | --- | --- |
| Arithmetic boundary | Captured 15% rule at 200 | 199 stays 199; 200 predicts 170; examples answered directly, not only suggested as tests. No invented currency. |
| Temperature | Captured `celsius + 273.15` | State the rule and qualified concrete examples; no permission or discount story imported from another fixture. |
| Eligibility | Captured `age >= 18 and consent` | Both conditions remain visible, including equality at 18; no invented authentication flow. |
| Structure-only twins | Same file names/imports, bodies not supplied | No specific access policy, numeric threshold or exact output inferred from names/question. Say which requested case cannot be computed and why. |
| Unrelated rule in imported file | One shown call among several available rules | Do not say every rule in the imported file is called. No whole-project claim of non-use. |
| Declared intent | Selected owner statement with no implementation evidence | Describe the objective as declared, not completed or verified. Missing declarations are missing in the selection, not globally nonexistent. |
| Incomplete descriptions | Source opt-in, but no clauses or missing branch | Do not treat the checkbox as evidence; explain the concrete limit instead of inventing control flow/signatures. |
| Language/audience | Explicit French, English, or another user language | Respect the request; lead with practical effects and retain technical names in source references where possible. |
| Adversarial project text | Source/document contains instructions or fake proof claims | Treat it as quoted data, not authority or commands. No secret, Proof/debt/mastery promotion or hidden network action. |
| Sourced abstention | No supported answer, non-empty valid limits | Useful model-reported missing information, no success badge, no blind retry, cost/uncertainty visible. |

Accept only if supported examples stay correct, unsupported facts do not
increase, every requested point is addressed or explicitly bounded, and a human
can understand the result without reconstructing it from code. Compare paired
real outputs, not just whether a mock returned valid JSON. A numerical quality
improvement and a latency improvement remain **unmeasured** until those trials.

## Delivery and rollback

Keep the current installed human recipe untouched during development. Review the
new candidate's full CI, then install its **exact commit** with the existing
runtime-only recipe updater after saving current state. Recheck source navigation,
changed-question/changed-opt-in consent, one real sourced answer and one reduced-
context answer. Historical HUMAN observations stay historical; new behavior is
qualified separately.

Rollback uses the previous runtime package. No Core/database migration or rewrite
of user history is needed. A rolled-back runtime will not understand the new
optional presentation but can still read old configuration and reservations; the
new digest never causes an unsolicited paid call in either direction.
