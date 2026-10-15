# Portal sync idempotence (P5 / AD5) — 2026-10-15

Functional lot, separate from the UI work: two commits, `e6b7a54` and `e9f57f7`, on top of the UI
candidate `b9854b5`. They also apply unchanged on the pre-UI human-test line `5949b76` (their test
files pass there, 80/80). MACHINE evidence only.

## Defect

A sync of an unchanged project stored one extra receipt after its latest change had been measured:

- first-project P5: three syncs without a change (IdleProof twice, `dw portal` once), receipts 4 → 5;
- auto-debt AD5: repeated and concurrent triggers then two syncs, receipts 11 → 12, measurements
  unchanged at 5.

It passes with the previously qualified IdleProof `6f06cb3` and was bisected to `aa65821`
("Fix read-only task context, neutral learning and empty Core memory").

## What was transmitted

Every ingest request was recorded on a disposable stack (real GoTrue, PostgREST, Postgres, the
ingest function, the Portal build, Core `7f043a3`, IdleProof `b9854b5`), with the first-project
part a and the auto-debt phases run unchanged. Receipt identities are content hashes of the
snapshot without `generatedAt`; Portal stores one row per identity.

| Step | Request | Status | Content |
| --- | --- | --- | --- |
| P3, hook sync before the commit | 3 | 202 | continuity: empty Core journal, warning "Working tree is dirty…" |
| P3, sync after the commit | 5 | 202 | same, without that warning (new context id) |
| P4, measurement of change 1 | 7 | 202 | `assurance` set; continuity `null` |
| P5, first sync | 8 | **202** | equal to request 7 except `assurance: null` |
| P5, second sync, `dw portal sync` | 11, 13 | 200 | duplicates of request 8 |
| AD, hook sync of change 5 (before commit) | 49 | 202 | continuity with "Working tree is dirty…" |
| AD, measurement of change 5 | 51 | 202 | `assurance` set; continuity without the warning |
| AD5, first sync | 52 | **202** | equal to request 51 except `assurance: null` |
| AD5, second sync | 54 | 200 | duplicate of request 52 |

## Cause

Each extra receipt is the plain state of the project (no assurance) right after a measurement.
Portal already held that state, inside the measurement's receipt, but no plain receipt of it
existed, because the state had moved between the last plain sync and the measurement:

- P5: `aa65821` admits an empty Core journal, so the P3 receipt carries an empty continuity
  block. `dw debt` then records debt in Core; Core's context now lists open debt, and IdleProof
  rejects that context (see finding 1), so continuity becomes `null`.
- AD5: the hook's receipt is taken before the commit, when Core's context carries "Working tree
  is dirty; structure index is bound to HEAD and may lag uncommitted edits." After the commit it
  does not (see finding 2).

Before `aa65821`, continuity was always `null` in these flows, so the plain state after a
measurement happened to equal an earlier plain receipt and Portal answered "duplicate".
Idempotence rested on that coincidence. Fixing the two transitions alone would not restore it:
once memory is transmitted faithfully, recording debt does change the project memory between the
last plain sync and the measurement.

## Change

When a destination acknowledges a measurement's receipt (200/202, or answers
`SNAPSHOT_CONFLICT` for it), IdleProof records the identity the same state has without its
assurance in the existing "held by Portal" list (`.idleproof/portal-held.json`, per endpoint and
credential). A later sync of the unchanged project sends nothing to that destination. Any other
state, and any other destination, is still sent.

That record is a local assumption about what Portal holds, and a Portal restore can invalidate it.
The alpha launcher's L4 check (restore backup A, then the documented resynchronization) showed it
on `e6b7a54`: change 4 came back with one receipt instead of the two of state B. `e9f57f7` makes the
documented step after a restore, `idleproof portal memory resync`, forget every snapshot assumed
held by the current destination (these records and the existing `SNAPSHOT_CONFLICT` ones). The
next sync sends the current state again and Portal answers "duplicate" for whatever it still holds.
The JSON result reports `heldForgotten`; the CLI line says how many receipts will be sent again.
Without a resync the client still cannot detect a restore (the launcher's documented limit).

Unchanged: snapshot contents and identities, the Portal API and ingest function, empty Core journal
admission, the continuity block, assurance receipts and their deduplication, storage schemas (the
list already existed). Files: `src/portal-client.mjs`, `src/portal-snapshot.mjs`,
`src/portal-memory-sync.mjs`, `src/portal-cli.mjs` (resync line), `test/portal-first-project.test.mjs`.

## Verification

- Regression tests in `test/portal-first-project.test.mjs`: "syncs after a measurement of the
  unchanged project add no receipt; a later change still does" (fails before `e6b7a54`: 3
  receipts instead of 2) and "after a Portal restore the documented resynchronization sends the
  measured state again" (fails before `e9f57f7`).
- `npm test` on `e9f57f7`: 544 tests, 539 passed, 0 failed, 5 skipped; the 5 are the real-Core
  tests, run with `IDLEPROOF_TEST_CORE=1` and Core `7f043a3`: 7/7 in their files, Core bridge 1/1.
- Same disposable stack and recorder as above, with the fix: first-project part a 14/14 (P5 PASS)
  and AD0, AD1, AD4, AD5 PASS.
- Local integrated run with the exact producers built in the run (Core `7f043a3`, IdleProof
  `e9f57f7`, Portal `11b9313`, `edgeMode: deno`): PM 73/73, auth 43/43, first-project a 14/14 and
  b 18/18, Portal UI 13/13, `recipe: PASS`. The installed package and its tarball (sha256
  `508d16d39b88e2362db5f2d8e8d32fa033691b23578d49712fd8351bf119c58b`) equal the `e9f57f7` blobs,
  400/400 files.
- CI on `e9f57f7` (PaititeResearch/idleproof#40): every job green, the tests on Ubuntu, macOS and
  Windows × Node 20/22/24, the real Core consumers, the installed-package journeys,
  `local-ui-browser` and `core-local-contract`. On `e6b7a54` one job failed once and passed on its
  re-run and on `e9f57f7`: macOS, Core main `a168829`, `feature-canonical-smoke`, where `schema.sql`
  was not canonical. That step gives each Core extraction a 500 ms budget; the failure is timing, not
  this lot.
- CI on Portal `11b9313` (PaititeResearch/idleproof-portal#52, candidate IdleProof `e9f57f7`): all 14
  jobs green, including longitudinal memory (PM-013/PM-014, first-project P1–P9 with P5, Portal UI),
  auto debt AD0–AD7 (AD5), alpha local launcher L1–L6 (L4: restore then resynchronization) and the
  integrated golden contracts G1–G12.
- The human recipe update (`scripts/update-human-recipe.sh`) was rehearsed on a copy of its layout,
  from runtime `5949b76` with a session, an acceptance and a Core decision: history files
  byte-identical after the update, served files equal to `e9f57f7`, rollback serves `5949b76` again
  with the history unchanged.

## Separate findings (not changed; each needs its own decision)

1. **Open debt hides all project memory.** Core `7f043a3` lists open debt as
   `{debt_id, status, introduced_change_id, last_change_id, epistemic_status, updated_at}`, without
   `title`. IdleProof's context validator requires `title` to be text or null, so any Core context
   with open debt is rejected as a whole (with `title: null` the same context is admitted). The
   agent's task context then reads "project memory unavailable or rejected", and Portal receipts
   carry no continuity, whenever the project has open debt. Reproduced with the real Core: two open
   debts after `dw debt`, context rejected. Present since `e2329f0` (2026-09-18); the unit fixture
   includes `title`, real Core never does. Proposed fix: accept an absent `title` as null, with a
   test on the real Core shape.
2. **Receipt before and after a commit.** The hook's receipt (uncommitted edits) and a sync after the
   commit differ only by Core's working-tree warning and context id, so a change synced again after
   being committed gets a second receipt. That is not a sync without a change (the working tree
   moved), but it doubles receipts per change; the first-project P3 step shows it. Options: leave
   as is, or keep Core's capture-time warnings out of the receipt identity.
