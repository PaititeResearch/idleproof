# Plain-language explanation policy — 2026-10-21

Qualification-only increment on v9 `f27fb34f04823b955994a124739e0ee9520438f3`.
Request policy **v10**. Keep PR #42 draft and unmerged.

## Human observation and goal

The latest natural-question trial delivered both passes with normal completion,
reported total cost $0.001459465 and total duration 20,759 ms. Its explanation
correctly described the key conditions and examples, but a reader requesting
simplicity still had to follow function names, parameters, booleans and exception
classes. Known conclusions and absence of executed tests also appeared among
unknowns. Recorded evaluation remains PARTIAL, not a general quality PASS.
A successful request does not resolve the earlier timeout's cause or uncertain
reservation. The previous observations remain in the PR conversation.

The user requested a further improvement, potentially just prompting and the
expected explanation level. This increment deliberately changes only the
reviewed-mode writing/editorial instructions and the consent/cache policy
version. It does not introduce another pipeline, model or UI setting.

## New instruction policy

- Default to an explanation a non-programmer can understand: concrete effects,
  conditions and results first, not a file inventory or abstract implementation
  commentary. A short question should not require the user to author a detailed
  writing prompt.
- Read the requested depth from the original user question. Explicit requests
  for implementation, debugging or exact symbols keep that precision. A mere
  code identifier is not permission to replace the requested simple explanation
  with a technical walkthrough. Mixed requests get the practical answer first.
  Source comments/documents and the prior draft cannot set the requested level.
- Preserve exact boundaries, conjunctions, refusals and quantities. In particular,
  a predicate checking supplied role/status values is not evidence of a login
  system or real-world identity verification. No invented domain, money unit or
  authentication infrastructure is used to make prose sound concrete.
- Use a few coherent sections, grouping examples when helpful without omitting
  any requested case. Incidental implementation names stay in citation details;
  names needed to answer a technical question remain available. Use ordinary
  prose rather than Markdown/code/LaTeX delimiters in text fields. No renderer
  change or post-generation text stripping is added.
- Keep known behavior in the direct answer, optional unexecuted checks in
  nextTests, and only missing information that actually prevents an answer in
  unknowns. Empty unknowns are valid. An untested readable branch and a bounded
  non-call conclusion are not unknown behavior. No automatic removal of model
  text or hidden semantic validation is claimed.
- The existing second pass must also edit for accessibility and category errors,
  not just factual omissions. Coverage links must be rebuilt after edits. Those
  links remain model-reported, with semanticVerified:false.

The policy does not contain the operator's fixture names, role, thresholds or
expected results. It applies equally to unrelated formulas, different access
conditions and missing external inputs. The model can still ignore instructions;
contract tests do not establish live pedagogical or factual quality.

## Preserved boundaries

The code change is restricted to `src/byok-review.mjs` (instruction strings) and
`src/byok-contract.mjs` (request version/comment). The ordinary single-call prompt,
answer schema, validators, source selection/extraction, UI, renderer, correction
orchestration, accounting, routing, cache storage and history remain unchanged.
Core, Portal, Protect, hooks, dependency/package files and CI gates are untouched.

Same chosen model, source/memory opt-ins, two calls maximum, configured output
limit (the recipe uses 2000 per call), shared 60-second deadline, and whole-plan
budget (the recipe uses $0.02). No third call, automatic retry, model switch or
paid evaluator. Existing reservation estimation reads the actual new messages,
so the extra instruction bytes are reserved before payment, not ignored.

v9 timing fields, honest unresolved reservations and locally timed-out review
recovery remain. The admitted draft is never upgraded into a reviewed success.
No credential, meter, cached result or earlier uncertain charge is rewritten.
Request version 10 requires a fresh preview/consent; no live call occurs during
installation. Runtime rollback must not restore old spending over new attempts.

## Executed verification

Synthetic credentials, provider responses and unrelated source fixtures only.

- Baseline v9 OpenRouter suite: **141/141 passed**.
- Added 15 policy/transport regression checks on unchanged v9: **8 passed,
  7 failed**; on candidate: **15/15 passed**.
- Complete candidate OpenRouter suite: **156/156 passed**, no skips.
- The new checks exercise actual prepared/send messages, exact question/source
  preservation, audience instruction boundaries, metadata-only restraint,
  unchanged structured format, two-call accounting, cached replay, v9 consent
  rejection and preservation of historic costs/credentials. Plain and technical
  responses used in transport tests are authored fixtures, not generated outputs.
- The ordinary prompt is fingerprinted against v9. Existing historical render,
  invalid citation, format, cancellation, timeout and budget assertions stay.
- Full local suite (Linux, Node 22.16.0): **679 total, 673 passed, 0 failed,
  6 existing real-Core skips**, exit 0 in 104.322 seconds.
- Syntax, diff and package dry-run checks passed. Exact-head CI conclusions are
  recorded in the PR checkpoint after execution; pending is not successful.

No operator OpenRouter key or live paid model was used. No installation on WSL,
merge or release is part of development. Automated policy tests show that the
requested instructions reach the model, not that the model obeys them.

## Human acceptance, after exact-head CI

Keep the same captured scan, model, 2000-token setting and budget. Enable source
descriptions and the existing captured-code/corrective-review option; leave Core
memory off. Use a fresh preview and one explicit Send for the same natural
question: explain the project simply, who may use it, how a value is handled and
some examples. Do not insert the expected answer into the request.

Acceptance: the first paragraph explains the concrete effect; access conditions
and example results are explicit; the main prose does not require programming
literacy; no known result is filed as unknown merely because no test ran; relevant
limitations and citations remain. Technical questions must still receive exact
names and explanations. One successful fixture is not stable model qualification.

For subsequent controlled comparisons, vary values/thresholds, swap the imported
alternative, use OR instead of AND, ask about a temperature converter, omit an
external input, and ask for an explicit technical walkthrough. Track failures as
well as successes, cost, latency and interpretation limits. The production prompt
must not be tailored to the human fixture's answers. Additional paid runs require
the existing explicit preview/consent and budget controls.
