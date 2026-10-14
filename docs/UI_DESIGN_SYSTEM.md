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

## Absent data

- Before data arrives, or when it cannot be read, show "not loaded".
- When something was not checked, show "Not assessed".
- When it was not measured, show "not measured".
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
- **Icons.** One 16 px stroke set. Icons are decorative only: `aria-hidden`, always next
  to a text label, and never inside a button whose text the script rewrites.

## Foundations

- Themes: light and dark follow `prefers-color-scheme`; every colour is a token.
- Type: system sans (`--font-sans`, Inter when installed) for reading; `--font-mono` only
  for real identifiers (paths, hashes, commands, status codes).
- Labels are sentence case. Upper case is reserved for status codes and lane codes.
- Radii by hierarchy: `--r-lg` panels, `--r-md` nested cards and drawers, `--r-sm`
  controls; pills for chips and badges.
- No external fonts or assets: Local runs under `style-src 'self'` and refuses inline
  style attributes, so bars use native `<progress>` elements.
- Motion is limited to the live-agent pulse (stopped when no agent is active) and respects
  `prefers-reduced-motion`.
- Responsive: no horizontal page scroll at 360 px; navigation becomes a horizontally
  scrollable strip; Portal tables stack per row on small screens.
