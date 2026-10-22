# Experimental Atlas Deep Understanding

This candidate adds read-only semantic views beside the existing editable Module atlas. It is a draft branch stacked on PR #46, based on `b8f03f9e7b98d6ae44ba1401ff0afa76f2f06cae`. Do not merge or replace the human recipe on port 4778 as part of this trial.

## Qualification before a human trial

Use the exact candidate commit from the draft PR's current qualification report. Check that its required CI jobs succeeded on that commit, including real Core contracts and the browser recipe. A prior commit's green run is not qualification of a later commit. The historical `projet-multicouche` capture and its sixteen calls are not replaced by the synthetic browser fixture.

The browser recipe is `node scripts/atlas-deep-browser-recipe.mjs`. It uses a disposable, authored Git repository and the real Local API, parser worker and Cytoscape canvas. The scan manifest is explicitly synthetic; this recipe does not claim a real Core capture or human validation. It runs at 1440 px and 390 px. `PLAYWRIGHT_MODULE`, `ATLAS_CHROMIUM` and `ATLAS_DEEP_RECIPE_OUT` select the already-installed browser driver, executable and evidence destination. If a browser cannot launch, the recipe records `NOT_RUN` and exits with code 2. It never calls a missing browser run a pass.

## Isolated installation

Use a separate tool checkout and a separate project copy. The commands below do not install a package globally, change the active Core, copy `.idleproof` history, or touch the running 4778 recipe. Replace `CANDIDATE_SHA` with the exact qualified 40-character commit before running. Use an existing compatible Core executable; do not install or update Core as an incidental part of this trial.

```bash
trial_root="$(mktemp -d "$HOME/atlas-deep-trial.XXXXXX")"
git clone --branch experiment/atlas-deep-understanding-20261022 --single-branch \
  https://github.com/PaititeResearch/idleproof.git "$trial_root/tool"
git -C "$trial_root/tool" checkout --detach CANDIDATE_SHA
git clone --no-hardlinks \
  /home/thomas/recette-idleproof-alpha/projects/projet-multicouche \
  "$trial_root/project"
cd "$trial_root/project"
node "$trial_root/tool/bin/idleproof.mjs" project scan --source HEAD
IDLEPROOF_EXPERIMENTAL_ATLAS=1 IDLEPROOF_EXPERIMENTAL_ATLAS_DEEP=1 \
  node "$trial_root/tool/bin/idleproof.mjs" serve --port 4780
```

The project clone copies committed files only. It intentionally does not carry over existing notes, private keys, source selection choices or working changes. Check the printed tree and snapshot against the project you intended to inspect. If port 4780 is occupied, choose another unused port; do not stop an unrelated server. Deep analysis currently reads only admitted immutable HEAD blobs. Working-tree analysis is explicitly unsupported.

The explicit `project scan` creates a new Core capture in the trial copy. It is not the historical snapshot unless its identity and selection actually match. If `dw` is not on the current PATH, set `DIFFWITNESS_BIN` to the already-installed executable before both the scan and server command. No BYOK key or paid AI request is needed.

## Human acceptance

1. Open `http://127.0.0.1:4780/atlas.html`. Check module navigation, cursor-anchored wheel zoom, Fit, annotations, explicit save and revision history in the isolated copy.
2. Follow **Open experimental Deep Understanding**, or open `/atlas-deep.html`. The initial page reads status only. No analysis or target program starts automatically.
3. Confirm the capture's snapshot and tree. Choose **Analyze captured source**. Inspect the visible status and use **Stop analysis** to exercise cancellation if the job is still running.
4. In **Function call graph**, select `service.process` through the accessible element list or Find. Inspect its path, content hash, source span, provider, incoming and outgoing calls. Follow a `CALLS` edge and read its resolution method. `MAY_CALL`, `UNKNOWN` and `EXTERNAL` must remain distinct.
5. Choose **Open captured source**. The display comes from the immutable captured file identity and applies local redaction. Source navigation does not execute code or send it to a provider.
6. Choose **Focus this function**, then **Data flow** and **Control flow**. Inspect the supported dependency/branch relations and the provider capability panel. Empty or incomplete views must remain explicit; static structure does not establish reachable or executed paths.
7. Open **Runtime trace** and **Observed sequence**. Opening either view makes no execution request. The candidate does not attach runtime observations to the user's repository.
8. If desired, explicitly choose **Run isolated synthetic example**. This uses only the fixed built-in fixture. It either reports unavailable isolation without execution, or shows a separate labelled synthetic session, its actual event order and reconciliation. Its identity is separate from the selected project. A sequence is never generated from static arrows.
9. Return to **Module atlas**. Confirm the isolated copy's saved annotations and revisions are intact. Deep views cannot save, rename or migrate the V1 user model.
10. Repeat on a narrow viewport and with the keyboard, using the accessible element/relation list, source buttons, theme toggle and zoom buttons.
11. Stop the foreground trial with Ctrl+C. Restart the same trial without `IDLEPROOF_EXPERIMENTAL_ATLAS_DEEP=1` to disable Deep Understanding. No saved Atlas overlay is deleted. Omitting both flags restores the ordinary Local interface.

## View boundaries

| View | What it shows | What it does not establish |
|---|---|---|
| Module atlas | Existing Core structure and separately saved user declarations | Runtime execution or semantic completeness |
| Function call graph | Resolved static targets, possible targets and retained unresolved sites | A call occurring or all possible runtime dispatch |
| Focused function | A bounded neighborhood of a selected element | Every relation outside the returned page |
| Control flow | Supported source branches and control relations | Reachability or branch coverage |
| Data flow | Supported source-derived dependencies | Raw runtime values or arbitrary interprocedural value propagation |
| Runtime trace / Observed sequence | A retained identified runtime session, when actually available | All scenarios, causality certification or user-project execution |

Pagination and boundary counts remain visible. Incoming/outgoing lists describe the current projection and do not falsely claim that absent callers cannot exist. All six Deep views are read-only; the existing V1 editor remains the place for user annotations. Layout changes in Deep are transient.

## Stop and rollback

Cancel a running static analysis with **Stop analysis**. Closing the trial server also stops its owned running analysis. Closing or hiding the page stops UI status polling; it is not a claim that a server-side job was cancelled. Cached analysis is process-local and bounded; restarting requires explicit reanalysis. No automatic retry, analysis loop or paid provider request is performed.

The runtime example has no arbitrary path, command or entry-point input. Isolation failure means unavailable, never an unsafe subprocess fallback. No source repository code runs through the static analysis or UI source navigation.

Rollback is to stop this separate foreground server and return to the existing installation. Keep the trial directory if its diagnostics or annotations are useful. Do not delete or replace the original recipe directory, its budgets, provider keys, histories or Core storage.
