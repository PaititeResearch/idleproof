# Historical repository identities

The DiffWitness repositories moved from a personal GitHub account to the
**PaititeResearch** organization in 2026. They were transferred, not recreated:
commit SHAs, issues and pull requests are unchanged, and GitHub redirects the old
URLs.

Dated records keep the names that were true when they were written: qualification
evidence under `docs/qualification/`, dated audits, human qualification records,
changelog entries and applied migrations. They are never rewritten (cutover runbook,
step C6), and some are indexed by SHA-256. Read them with this mapping:

| Historical identity | Canonical identity |
| --- | --- |
| `TFourniax/tooltest` | `PaititeResearch/diffwitness` |
| `TFourniax/tooltest-2` | `PaititeResearch/idleproof` |
| `TFourniax/idleproof-portal` | `PaititeResearch/idleproof-portal` |
| `TFourniax/diffwitness-private` | `PaititeResearch/diffwitness-private` |

## Contract identifiers changed in the same cutover

| Identifier | Before | After |
| --- | --- | --- |
| DiffWitness certificate schema `$id` | `https://github.com/TFourniax/tooltest/blob/main/schema/diffwitness-certificate.schema.json` | `https://github.com/PaititeResearch/diffwitness/blob/main/schema/diffwitness-certificate.schema.json` |
| DiffWitness report v2 schema `$id` | `https://github.com/TFourniax/tooltest/schema/diffwitness-report-v2.schema.json` | `https://github.com/PaititeResearch/diffwitness/blob/main/schema/diffwitness-report-v2.schema.json` |
| IdleProof provenance predicate type and schema `$id` | `https://github.com/TFourniax/tooltest-2/spec/agentic-development-provenance/v1` | `https://github.com/PaititeResearch/idleproof/spec/agentic-development-provenance/v1` |
| IdleProof policy schema `$id` | `https://github.com/TFourniax/tooltest-2/spec/idleproof-policy/v1` | `https://github.com/PaititeResearch/idleproof/spec/idleproof-policy/v1` |
| Action reference emitted by `dw init` | `TFourniax/tooltest@v<version>` | `PaititeResearch/diffwitness@v<version>` |

IdleProof attestations issued with the old predicate type no longer verify and must
be regenerated. This was accepted during the alpha, before any external consumer.
