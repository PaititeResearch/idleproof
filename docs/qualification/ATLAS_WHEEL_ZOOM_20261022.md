# Repository Atlas — wheel zoom human feedback and machine qualification

**Date:** 2026-10-22. **Scope:** candidate branch stacked on PR #45. The operator confirms that the source-backed Atlas loads, but a long-chain dependency graph is initially zoomed so far out that labels are tiny; reaching a readable scale with the wheel is painfully slow. This is a HUMAN UX failure, not evidence that the captured project relations are incorrect.

## Focused intervention
- Preserve initial full-graph overview and the existing Fit / Arrange / view / search controls.
- The current Cytoscape renderer starts a tall graph at minZoom 0.12. Its previous `wheelSensitivity: .2` makes ordinary mouse wheel motion especially slow. Native wheel normalization also varies by input hardware.
- Register a bounded wheel listener once, before the Cytoscape renderer attaches its own wheel listener, and stop duplicate processing. Pixel-mode events use smooth exponential zoom; line/page wheel events count as one notch. The factor is at most **2.6× per event**, anchored to the pointer. At an initial 0.12 scale, three ordinary notches target about 2.1× absolute scale, subject to the existing maxZoom 2.5. Zoom out is reversible.
- Browser pinch/ctrl/meta modified gestures are left to the existing renderer and browser. Remove the old vendor-specific low wheel sensitivity and use its default for these gestures.
- Zooming changes the viewport only; no user overlay change, source write, Proof change, policy approval or provider request. No new runtime dependency. The user can still explicitly Fit the whole graph.

## Qualification contract
- Synthetic **32-file** chain ensures the graph begins at overview scale.
- Actual Chromium mouse wheels at **390 and 1440px** must reach zoom >=1 after **three 100-pixel negative wheel events**; maintain the graph coordinates under the mouse within 1 unit, and stay at or below maxZoom.
- Three matching reverse wheel events + Fit restore overview; four small -8px trackpad deltas yield a smooth 1.15–1.7× increase rather than per-event jumps.
- No POST, off-machine request, script error or unsaved model state. Existing 20 Atlas + 15 Local-section UI tests still pass.
- Existing full suite, real-Core contracts and hook/performance budgets must pass on the exact candidate commit. The UI can still be imperfect across untested hardware; obtain HUMAN feedback before merge or accepting usability.
- WSL current human Local state, scans, BYOK budget and prior annotations remain untouched by this candidate until separately authorized installation. Core and Portal unchanged.

No extra document/prompt/REA extraction is implemented in this correction.
