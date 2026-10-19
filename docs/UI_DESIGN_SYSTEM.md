# DiffWitness ecosystem UI design system (v3)

IdleProof Local (`public/styles.css`) and DiffWitness Portal (`src/styles.css`) share one
visual identity so that both read as steps of the same process, while each tool stays
recognizable. This file is the reference; keep both stylesheets' tokens identical.

v3 (2026-10-19) replaces the generic grey-card look of v2 with the brand already used by the
public DiffWitness site (black, warm ink, Instrument Serif, JetBrains Mono, witness violet).
It changes presentation only: every rule from "Evidence semantics" to "Absent data" below is
unchanged from v2 and still enforced by the same tests.

## Identity

- **Black chrome, in both themes.** The brand's black (`--chrome`) frames each tool: Local's
  app bar and Portal's sidebar (and the signed-out brand panel). Content sits on a neutral
  porcelain canvas in the light theme and on black in the dark theme. Chrome text uses
  `--chrome-ink` / `--chrome-muted`, and status lights in the chrome use `--chrome-ok` /
  `--chrome-bad` so they keep 4.5:1 on black.
- **Three voices of type, mapped to what the words are:**

| Face | Token | Used for |
| --- | --- | --- |
| Instrument Serif | `--font-display` | what is happening or what a page is about: the Local state headline, page titles, readout numerals, the Portal handover card |
| System sans | `--font-sans` | the interface: labels, prose, controls |
| JetBrains Mono | `--font-mono` | real identifiers and codes: paths, hashes, commands, decisions, lane and status codes; epistemic stamps in Portal's Technical view |

  Both brand faces are self-hosted (SIL Open Font License, licence files next to the font
  files), so Local still makes no network request and Portal keeps `font-src 'self'`.
- **One mark geometry.** A black tile, a warm-ink circle, an orbit ellipse and a focal dot.
  DiffWitness (Portal) draws the orbit horizontally with a violet dot, as on the public site;
  IdleProof (Local) draws it vertically, like a lens, with an azure dot. Favicons use the same
  marks.
- **The process rail** is the recurring signature: Local's "Under the hood" rail
  (Understand → Prove & owe → Remember), Portal's signal-source rail in the sidebar, the
  Protect → Understand → Prove → Owe rail on signed-out pages, and the receipt lanes.

## Two tools, one process

| Tool | Job in the process | Accent token | Mark |
| --- | --- | --- | --- |
| IdleProof | **Understand**: explain what the agent changes and where it lives | `--ip` lens azure | vertical orbit, azure focal dot |
| DiffWitness | **Protect · Prove · Owe**: runtime guard, proof of the exact change, Debt Ledger | `--dw` witness violet | horizontal orbit, violet focal dot |

Each surface sets `--accent` to its own tool (Local: `--ip`, Portal: `--dw`). Anywhere a
signal comes from the *other* tool, use that tool's token, for example the Portal receipt
lanes (`.lane-understand` azure, `.lane-prove` / `.lane-owe` violet, `.lane-protect` ink),
the Portal receipt explanation (IdleProof's reading, azure rule) or the Local "DiffWitness
Core" product tag and Portal handover card (`.product-dw`, `#portalBoundary`, violet).
Primary buttons are ink, not accent: an accent is identity, never "go".

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
- Operational states are status lights too: in Portal, project active, device
  connected, repository bound, plan active and onboarding steps use `HealthLight`.
- A favorable observation stays neutral wherever it appears: a debt budget that is not
  exceeded, no new obligation reported, a snapshot within the freshness window. The
  readiness matrix names it ("Within debt budget"); its aggregate reads "Bounded signals
  aligned", never "Looks good".

## Connection and freshness

Local polls `/api/state` (one read at a time, 8 s deadline). When a read fails:

- A banner under the section tabs says what happened: Local is not responding, returned
  an HTTP error, or returned a state the page could not read. If an earlier state was
  rendered, the banner gives the date and time of that state and says the live-task
  values may be out of date; the project scan keeps its own captured snapshot. If not,
  it says that no project state has been loaded yet.
- Panels are desaturated and their headers hatched, the live-agent pulse stops, and the
  status light turns neutral.
- Data older than 10 s (for example after a suspended tab) is re-read before any action.
  A pause message appears only if that read is slow.
- The next successful read removes the banner and the stale styling. A late answer to
  an abandoned read is ignored.

## Refreshes keep what the reader is doing

A refresh rewrites a container only when its content changed. Keyboard focus, open
details and a click in progress survive the 1.5 s poll.

## Actions that commit the human

- "Accept current change" and "Approve" stay disabled until the state they act on is
  loaded and current. Acceptance is enabled only for a completed change. Both are
  disabled again as soon as a refresh fails, and stay locked until a read that started
  after the request has settled.
- One click sends one request. A request is never resent automatically.
- The outcome says what is known: confirmed, refused by Local (with its reason), or
  not confirmed (no answer, or no answer within 20 s: it may or may not be recorded).
- A refresh never brings back an action that was already done: a confirmed approval
  stays "approved once" for that decision event, and an accepted change reads
  "accepted · accept again". A new block of the same action starts clean.
- An action that a local approval let through once reads "allowed once by your
  approval" in a neutral tone; it is neither a block nor a success.

## Absent data

- Before data arrives, or when it cannot be read, show "not loaded".
- When something was not checked, show "Not assessed".
- A project-wide check count does not show that a particular item was checked. When
  only that count exists and the item's value is zero, show "assessment unavailable".
  A per-item check count makes a zero a real "0%".
- When nothing was recorded at all (for example no agent activity), a score reads "Not
  assessed", not 0.
- When it was not measured, show "not measured".
- When a count or field is missing from a Portal record, show "not reported" or "Not
  available" for that field.
- Never show 0, 0% or a policy name as a placeholder, and never show a stale value as
  current.

## Structure and navigation

- **App chrome.** Local has a black app bar (mark, edition tag, project name in mono,
  privacy line and trace status light) and section tabs on the canvas that mark the section
  in view. Portal has a black sidebar grouped as Projects, Workspace and Help, with the
  Guided/Technical switch and the signal-source rail under the navigation, and a light top
  bar that names the current view.
- **Page headers.** A serif title, one lead paragraph of at most ~72 characters per line,
  and the page's actions on the right (status light first, then secondary, then the single
  primary action).
- **The Local "Now" header** is not a card: the state headline, the task prompt (azure
  gutter), the agent's current tool with the live pulse, the decision banner, and a readout
  column on a hairline scale.
- **Panels.** A panel has a header and a body. Never nest cards inside cards: inside a
  panel, use hairline-separated sub-sections (Portal understanding categories, next actions)
  or hairline grids for related cells (summary strips, the Under the hood strip, receipt
  lanes, explanation columns).
- **Summary strips** are one instrument row: a 2 px ink rule on top, labelled cells with
  serif readouts, hairlines between cells.
- **Receipt ledger** (Portal). Each receipt is a node on a hairline timeline and shows its
  signals in process order: Protect first (while the agent worked), then Understand
  (IdleProof), then Prove and Owe (DiffWitness). Each lane is marked with its tool colour.
  Guided lane labels are sentence-case questions; Technical lane labels are lane codes.
- **Readouts.** Metrics are label/value rows with tabular numbers. Activity reads as a
  log with a sequence gutter. Identifiers use monospace.
- **View switches.** Local's "Scan view" (Guided or Technical) changes only the project
  scan panel. Portal's "Experience" switch changes the whole workspace. The labels say
  which one the reader is using.
- **Irreversible actions** (Portal settings) are grouped under their own heading with a
  danger rule; each still asks for its typed confirmation.
- **Icons.** One 16 px stroke set. Icons are decorative only: `aria-hidden`, always next
  to a text label, and never inside a button whose text the script rewrites.

## Foundations

- Themes: light and dark follow `prefers-color-scheme`; every colour is a token. Neutrals
  are warm-grey ("porcelain" in light, the site's black and warm ink in dark).
- Contrast: every text token reaches 4.5:1 on every surface, in both themes, including
  chrome tokens on black. `--faint` is for decorative strokes, dots and icons only, never
  for text. Tests read the shipped stylesheets and enforce both rules.
- Labels are sentence case. Upper case is reserved for status codes and lane codes.
- Radii by hierarchy: `--r-lg` (10 px) panels, `--r-md` (7 px) drawers and nested blocks,
  `--r-sm` (5 px) controls and chips, `--r-xs` (3 px) stamps and source tags. Stamps are
  rectangles, not pills, so evidence never reads like a decorative chip.
- No external fonts or assets: Local runs under `style-src 'self'` and refuses inline
  style attributes, so bars use native `<progress>` elements.
- Motion is limited to the live-agent pulse (stopped when no agent is active) and the
  drawer chevron, and respects `prefers-reduced-motion`.
- Responsive: no horizontal page scroll at any width from 320 px up.
  - Local: below 1100 px the section tabs drop their icons so all seven fit and the
    readouts become a row. Below 760 px the tabs wrap as chips under the app bar.
  - Portal: below 1100 px summary strips use two columns and the signed-out brand panel
    folds away; below 900 px the sidebar becomes a black header whose navigation wraps.
  - Stacked tables (Portal) repeat each column name before its cell (`data-label`).

## DiffWitness Core

Core has no graphical surface: its human surfaces are the terminal and Markdown reports,
whose wording is consumed by tests, scripts and IdleProof matchers (class B in
`diffwitness/docs/HUMAN_OUTPUT_READABILITY_PROPOSAL.md`). v3 changes none of that output. Any
readability change there follows that proposal as its own reviewed lot.
