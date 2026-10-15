# IdleProof Local: panels marked hidden but displayed

Status: **RECORD FOR A PRODUCT DECISION.** Nothing is changed by this document. The
current display is kept on purpose until the owner decides which elements to show, and
in which states.

## Summary

`applyLocalEditionUi()` sets the HTML `hidden` attribute on six Local elements
(`public/feature-review.js:149-154` at `5949b76`). The stylesheet gives `display:flex`
to `.metric` and `display:grid` to `.project-intel-grid`, and that overrides the
browser's default `[hidden]{display:none}`. As a result:

| Element | Marked `hidden` | Actually displayed |
| --- | --- | --- |
| Human feature mastery metric (`#featureFluency` card) | yes | **yes** |
| Knowledge debt metric (`#debt` card) | yes | **yes** |
| Human concept mastery metric (`#coverage` card) | yes | **yes** |
| Change impact and Project mental model (`.project-intel-grid`) | yes | **yes** |
| Spaced feature recall (`#memoryReviewChallenge`, inside that grid) | via class `hidden` | no (its renderer is never called, see below) |
| Project memory panel (`.feature-memory-panel`) | yes | no |
| Concept knowledge map (`.ledger-panel`) | yes | no |

The redesign keeps this outcome exactly. In the new stylesheet `.metric` and
`.project-intel-grid` still set `display`. Its `[hidden]` rule covers only buttons, text
blocks, details and labels, so those elements stay displayed and the two panels stay
hidden.

## When and why the hiding was added

- **Hiding:** `669bb86`, 2026-08-21 12:20 (+0200), "ux(idleproof): materialize Local
  versus Portal dashboard boundary". The commit message has no body.
- **Same morning:**
  - `70c25d9` (12:18) created `src/edition.mjs`, whose `LOCAL_EDITION.capabilities`
    sets `knowledgeDebtHistory`, `projectMemoryDashboard`, `spacedRecallHistory` and
    `longitudinalHistory` to `false` and `currentFeatureMap` to `true`.
  - `6b2598d` (12:25) added the README section "Explain now. Remember later."
- **Stated reason:** only the code comment at `feature-review.js:147-148`:
  > "Local is the immediate product: explain the current task and current feature map.
  > Longitudinal memory, Knowledge Debt history, project history and spaced recall
  > belong to Portal."
- **Also:** `README.md:258` assigns "historical feature memory, feature drift, Project
  Mental Model history and long-term Knowledge Debt" to Portal.
- **No recorded reason** for hiding the three *current-value* metric cards (they show
  present values, not history), or Change impact (about the current task).
- **Conflicting docs:** `docs/PRODUCT.md:35` still lists "local dashboard and ledger"
  in the free Community product, and `docs/THESIS.md:92` lists a "human-assurance
  ledger" in the local open core.

## The hiding never took effect for the visible elements

- `.metric{display:flex}` dates from `c0ae121` (2026-08-16).
- `.project-intel-grid{display:grid}` dates from `6736196` (2026-08-17).
- Both predate the hiding commit, and no `[hidden]` rule existed in any stylesheet at
  that commit. These elements have therefore been visible to every user since the
  hiding was introduced.
- The spaced-recall challenge is off for another reason: its polling (`poll()` in
  `feature-review.js:77-85`) has not been called since `669bb86`, although
  `/api/state` still returns `projectModel.reviewChallenge`.

## What each element shows, and what it shows without data

`/api/state` comes from `presentState()` (`src/server.mjs:122-146`); metrics from
`computeMetrics` (`src/state.mjs:273`).

| Element | Fields | Text when data is absent or not assessed | Value shown although not assessed |
| --- | --- | --- | --- |
| Human feature mastery | `metrics.featuresChecked`, `featureCoverage`, `featuresSeen`; `projectModel.stats.pendingFeatureReviews` | "Not assessed" | Hint "N feature reviews waiting" counts features that were never checked |
| Knowledge debt | `metrics.conceptsChecked`, `metrics.debt` | "Not assessed" | Initial placeholder "0" until the first state response (fixed in the redesign, see below) |
| Human concept mastery | `metrics.conceptsChecked`, `coverage`, `conceptsSeen` | "Not assessed"; caption "0 checked / N observed concepts" | none |
| Change impact | `projectModel.impact` | "No other learned feature currently shares the files touched by this task." | Unchecked features are called "learned" and marked "review recommended" |
| Shared hotspots | `projectModel.topology.hotspots` | "Hotspots emerge when multiple learned features share code." | `averageFluency` shown as "0%" for never-checked features |
| Feature review queue | `projectModel.reviewQueue` | "Feature reviews appear as your project memory grows." | `confidence` shown as "0%" with "low demonstrated feature fluency" |
| Project memory (hidden) | `featureMemory[]` | "Completed feature tasks will accumulate here…" | "0% fluent" |
| Concept knowledge map (hidden) | `ledger` | "Concepts appear as the coding agent touches your codebase." | meter titled "0% confidence" |

DiffWitness Portal shows the latest human concept mastery and human learning needs, a
per-receipt mastery and "Human feature recall". It does **not** show knowledge debt over
time, a feature-memory list, spaced recall, hotspots, a review queue, change impact or a
concept map. Local sends Portal aggregates only (`src/portal-snapshot.mjs:418-425`), so
most of what the comment assigns to Portal does not exist there today.

## Display fix already made in the redesign (separate commit)

Before the first `/api/state` response, and indefinitely when it fails or hangs, static
placeholders read as measurements: risk 0, debt 0, 0% fluency and ownership,
"balanced" policy, "0 capabilities", a zero trace head and a green "local trace
verified" chip. They now say "not loaded", and the chip is neutral until the recorder
answers. The page after a successful load is unchanged.

## Display fixes made after the UI audit (separate commit)

These changes are in the renderer only. `/api/state`, its numbers and the acceptance
endpoint are unchanged.

- **Out-of-date values.** When a state refresh fails after a successful one, a banner
  gives the time of the last update and says the values may be out of date, and the
  panels are desaturated. If no state was ever loaded, the banner says so.
- **Premature acceptance.** "Accept current change" is disabled in the HTML and enabled
  only when the loaded session is complete. It is disabled again, together with
  "Approve", when a refresh fails.
- **0% for never-checked items.** The current feature map, hotspots, review queue,
  journey, project memory and concept map now show "Not assessed" when no check exists
  for that scope (`fluency.checks`, `featureMemory[].checks`,
  `metrics.featuresChecked`, `metrics.conceptsChecked`). Since `744df6e`, when only a
  project-wide count exists and the item's value is zero, they show "assessment
  unavailable": a check elsewhere does not prove this item was checked. The API still
  returns `0`. A percentage appears only when it is above zero, or when the feature
  itself has checks.
- **Portal promise.** The Local card about Portal now lists what Portal actually keeps:
  received changes with their proof and debt results, human learning checks, and
  recorded project memory.
- **Privacy line.** "source stays local" became "source leaves only with your approval",
  because the optional OpenRouter explanation can send bounded excerpts after
  confirmation.

`test/local-ui-state.test.mjs` covers each of these.

## Later display fixes

- `744df6e`: impact summaries use "tracked" instead of "learned" for the server's
  known templates (paths and task text are never rewritten).
- Candidate of 2026-10-15: runtime risk with no recorded agent activity reads "Not
  assessed" instead of 0. See `UI_CANDIDATE_20261015.md`.

## Panel visibility in the candidate of 2026-10-15

Checked in Chromium on a completed task: the three metric cards, Change impact and
Project mental model are still displayed; Project memory, the concept map and spaced
recall are still hidden. Nothing was enabled or hidden by this candidate.

## Open items for the decision (not changed)

1. Per element and per state (no session, active task, completed task, after checks),
   decide whether to show it in Local.
2. Spaced recall is returned by the API but never rendered. It is not enabled.
