# DiffWitness ecosystem UI design system

IdleProof Local (`public/styles.css`) and DiffWitness Portal (`src/styles.css`) share one
visual identity so that both read as steps of the same process, while each tool stays
recognizable. This file is the reference; keep both stylesheets' tokens identical.

## Two tools, one process

| Tool | Job in the process | Accent token | Mark |
| --- | --- | --- | --- |
| IdleProof | **Understand**: explain what the agent changes and where it lives | `--ip` lens blue | tile with a lens ring |
| DiffWitness | **Protect · Prove · Owe**: runtime guard, proof of the exact change, Debt Ledger | `--dw` violet | tile with two offset diff lines |

Each surface sets `--accent` to its own tool (Local: `--ip`, Portal: `--dw`). Anywhere a
signal comes from the *other* tool, use that tool's token, for example the Portal receipt
lanes (`.lane-understand` blue, `.lane-prove` / `.lane-owe` violet, `.lane-protect` neutral)
or the Local "DiffWitness Core" product tag (`.product-dw`).

## Evidence semantics come before brand

- Only `ok` / VERIFIED uses green. A product accent never signals success.
- Absence, read failure, abstention and "Not assessed" are never shown with the success
  tone. Local renders unassessed metrics quieter (`[data-assessed=false]`) instead of as a
  big number.
- Epistemic states differ by **shape**, not colour alone:

| State | Shape |
| --- | --- |
| DECLARED | outline |
| OBSERVED | filled neutral |
| INFERRED | dashed border |
| UNKNOWN | dotted border |
| VERIFIED | filled green |

  Local wraps bracketed annotations (`[DECLARED; line 3]`) in `.ep .ep-<state>` without
  changing their text; Portal passes `epistemic` to `<Status>`, which only adds
  `data-epistemic` before the badge classes.
- Warning (`--warn`) marks things to review; danger (`--bad`) marks failures, denials and
  destructive actions. Paid actions (optional OpenRouter send) use the warning tone.

## Health is not evidence

A runtime guard, a recorder chain or a connection can be healthy; that never means the
code is correct or that tests passed.

- Health is shown as a **status light**: a dot or shield icon plus an explicit label,
  for example "Runtime guard healthy", "guard health: ready" or "local trace verified".
  It never uses a badge.
- Evidence is shown as **badges**, such as VERIFIED, accepted proof, OBSERVED or
  INFERRED.
- Green may mark a healthy state, but the label always names what is healthy.
- Observation and receipt kinds (OBSERVED, "observed", "post-proof receipt") are
  neutral badges. Only VERIFIED or an accepted proof gets a green badge.

## Connection and freshness

Local polls `/api/state`. When a request fails:

- A banner under the section tabs says so. If an earlier state was loaded, it gives the
  time of the last update and says the values below may be out of date. If not, it says
  that no project state has been loaded yet.
- Panels are desaturated and their headers hatched, the live-agent pulse stops, and the
  status light turns neutral.
- The next successful response removes the banner and the stale styling.

## Actions that commit the human

"Accept current change" and "Approve" stay disabled until the state they act on is loaded
and current. Acceptance is enabled only for a completed change. Both are disabled again
as soon as a refresh fails.

## Absent data

- Before data arrives, or when it cannot be read, show "not loaded".
- When something was not checked, show "Not assessed".
- When checks exist but none was answered correctly, show "no correct check yet". A
  percentage appears only after at least one correct answer.
- When it was not measured, show "not measured".
- When a count or field is missing from a Portal record, show "not reported" or "Not
  available" for that field.
- Never show 0, 0% or a policy name as a placeholder, and never show a stale value as
  current.

## Structure and navigation

- **App chrome.** Local has an app bar (mark, edition tag, project breadcrumb, privacy
  and trace status) and section tabs that mark the section in view. Portal has a
  sidebar grouped as Projects, Workspace and Help, with the Guided/Technical switch
  under the navigation.
- **Panels.** A panel has a header bar and a body. Never nest cards inside cards. Use
  hairline grids for related cells: summary strips, the Under the hood strip, receipt
  lanes.
- **Receipt ledger** (Portal). Each receipt shows its signals in process order:
  Protect first (while the agent worked), then Understand (IdleProof), then Prove and
  Owe (DiffWitness). Each lane is marked with its tool colour.
- **Readouts.** Metrics are label/value rows with tabular numbers. Activity reads as a
  log. Identifiers use monospace.
- **View switches.** Local's "Scan view" (Guided or Technical) changes only the project
  scan panel. Portal's "Experience" switch changes the whole workspace. The labels say
  which one the reader is using.
- **Icons.** One 16 px stroke set. Icons are decorative only: `aria-hidden`, always next
  to a text label, and never inside a button whose text the script rewrites.

## Foundations

- Themes: light and dark follow `prefers-color-scheme`; every colour is a token.
- Contrast: every text token reaches 4.5:1 on every surface, in both themes. `--faint`
  is for decorative strokes, dots and icons only, never for text. Tests read the
  shipped stylesheets and enforce both rules.
- Type: system sans (`--font-sans`, Inter when installed) for reading; `--font-mono` only
  for real identifiers (paths, hashes, commands, status codes).
- Labels are sentence case. Upper case is reserved for status codes and lane codes.
- Radii by hierarchy: `--r-lg` panels, `--r-md` nested cards and drawers, `--r-sm`
  controls; pills for chips and badges.
- No external fonts or assets: Local runs under `style-src 'self'` and refuses inline
  style attributes, so bars use native `<progress>` elements.
- Motion is limited to the live-agent pulse (stopped when no agent is active) and respects
  `prefers-reduced-motion`.
- Responsive: no horizontal page scroll at any width from 360 px up.
  - Local: below 1100 px the section tabs drop their icons so all seven fit. Below
    760 px they wrap as chips under the app bar.
  - Portal: on small screens the navigation wraps as pills.
  - Stacked tables (Portal) repeat each column name before its cell (`data-label`).
