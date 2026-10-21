# Experimental repository atlas

The experiment is separate from the ongoing human recipe. It is disabled by default. Do not merge or replace the installed recipe to try it.

## Try the UI without touching a user repository

In a checkout of `experiment/repository-atlas-20261021`, with Node >=20:

```sh
node scripts/atlas-demo.mjs --port 4779
```

Open `http://127.0.0.1:4779/atlas.html`. The example is labelled **SYNTHETIC DEMO**. It uses an isolated temporary directory and never reads your API key or repository. Stop with Ctrl+C. This verifies UI behavior only, not source extraction or model quality.

## Use a real repository in an isolated experiment

Use a **separate clone**, not the WSL human-recipe project. Supply an existing compatible Core CLI explicitly. No dependencies or project commands are installed/executed by atlas itself.

```sh
# Set these to the experimental tool checkout and existing Core executable.
export ATLAS_TOOL=/absolute/path/to/experimental-idleproof
export DIFFWITNESS_BIN=/absolute/path/to/venv-core/bin/dw
cd /absolute/path/to/separate-test-repository
node "$ATLAS_TOOL/bin/idleproof.mjs" project scan --source HEAD --json
IDLEPROOF_EXPERIMENTAL_ATLAS=1 node "$ATLAS_TOOL/bin/idleproof.mjs" serve --port 4779
```

Inspect the actual CLI help first if a newer integration changes these commands. Open `/atlas.html` on the printed Local URL. Use the same existing Core capture, not a different parser. No BYOK key is needed. Do not run a second Local server on the same recipe state directory.

## What is editable

Drag nodes; arrange them; add aliases and notes; hide elements; add declared UML classes/components and relations; edit or remove your additions. **Save view** persists privately. Source-defined labels and source bytes stay unchanged. Every custom object/relation is DECLARED; an annotation cannot set Proof, debt or policy.

The complete static graph is separate from the visible slice. A view limits captured nodes to 200 and edges to 800; a filtered/focused page is not a complete project. Class members are lexical declarations, not validated dispatch/ownership. The current adapter does not infer inheritance or execute a runtime sequence.

Revision history is closed until requested. Opening it is free/local. Restore prepares an edit, then saving appends a revision. Concurrent edits return a conflict instead of silently overwriting. A new snapshot requires a new overlay; no silent migration is performed. Export is private and may disclose paths, symbols and notes; share it deliberately.

## Reliability and boundaries

- No graph click triggers a scan, module import, native REA tool, provider call or policy approval.
- The optional activity panel reads the existing tool-action trace. Existing Local controls are the sole approval surface.
- Recorded obligations are read only on explicit request from existing Core context. Missing context is not zero debt.
- Core, Portal, prior BYOK budgets/uncertain reservations, normative proofs and hooks are not modified.
- A successful experiment is not universal semantic verification. See architecture, research and qualification documents for implementation limits and outstanding work.

## Development verification

```sh
node --test test/atlas.test.mjs
IDLEPROOF_TEST_CORE=1 node --test test/atlas-core-contract.test.mjs
# Set PLAYWRIGHT_MODULE to a previously installed qualified Playwright index.mjs:
node scripts/atlas-browser-recipe.mjs
npm test
```

Browser and real-Core tests use synthetic repositories, not customer data. No model generation is required. Existing regression gates and performance thresholds must remain intact.
