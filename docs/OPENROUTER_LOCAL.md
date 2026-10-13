# Optional Local OpenRouter interpretation

Status: implementation candidate. The 2026-10-13 HUMAN recipe reached paid responses but failed utility: Mistral upstream 429, DeepSeek truncation and an empty interpretation. The recovery changes below require a new HUMAN run; simulated tests do not qualify live provider behavior. No key belongs in ChatGPT, GitHub, Portal, a CLI argument, a screenshot or a test artifact.

Deterministic Core snapshots remain the input authority. The optional interpreter is invoked explicitly outside hooks. Configuration alone never starts a request. The user chooses the model and lifetime project budget; no default model or remembered tariff is used. Before a paid call, the client checks the current model listing and the dedicated key's provider-side cap. Unknown prices/caps fail closed. The transport has a 30-second deadline, input/output limits, no redirects, a maximum output token count and no automatic retries. A reservation survives uncertain/cancelled responses. Local estimated cost is not a billing guarantee; the dedicated OpenRouter key limit remains the independent hard limit.

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
  Output is requested in the question's language, with short sourced claims and
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
- Request version 2 invalidates earlier previews/caches without deleting evidence
  or resetting consumption. Existing configuration, credential and scan persist.
- The cockpit renders escaped prose, source buttons and collapsed technical
  details. Without an observed session it does not invent live agent activity.

Provider semantics checked against official documentation on 2026-10-13:
https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
(`exclude` hides reasoning; it does not stop token consumption).

Resume the HUMAN test with the same global question, empty paths, source
descriptions explicitly checked, memory unchecked, a newly reviewed preview,
then one Send. Check useful French prose, rules/service/access/view and declared
plans, clickable citations, no invented execution, visible omissions and cost.
Success on that step does not qualify task/memory/Portal or the entire recipe.
