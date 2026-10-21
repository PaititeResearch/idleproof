# Atlas as an opt-in Local section — qualification candidate

Base: PR #44 `45bfd4b3f467ab46436b0aa8187b35bf289c8ca1`, tree `44a70050e7ab73d9751436c7be175b16c46711a4`. Isolated candidate branch, no merge or deployment. REA integration remains a separate proposal; Markdown/prompt/log question extensions remain deferred.

## Scope

With `IDLEPROOF_EXPERIMENTAL_ATLAS=1`, the existing cockpit gains **Repository Atlas** before **Under the hood**. Opening the tab/button loads the existing same-project Atlas page in a same-origin frame. The separate document isolates renderer styles and IDs; it is not a separate source of facts or a new app stack. Existing `/atlas.html` remains available standalone.

Disabled, the served cockpit HTML is byte-identical and the experimental API/page remain unavailable. Enabled but unopened, only the small host module/styles load: no graph runtime, graph query, scan, source reads, provider call or user-model write is triggered by this section. Selection, Proof, debt, hooks and BYOK contracts are not changed. All existing content IDs and scripts are preserved.

The frame is retained when hidden so unsaved edits survive hiding/reopening. It sends only ready/dirty/visibility/close messages; both sides verify same origin and exact source window. Hidden/offscreen/tab-hidden workspaces stop activity polling, and opening again does not silently resume it. Refreshing Local leaves the section closed; reopening reads saved annotations locally. A parent unload warning protects dirty edits.

The root cockpit and APIs retain `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. Only the explicitly opted-in `/atlas.html?embedded=1` uses SAMEORIGIN / `frame-ancestors 'self'`; no external framing, unsafe script policy or cross-origin writes are introduced. No arbitrary frame URL is accepted.

## Tests and observations

- New focused 8-case tests cover unchanged disabled bytes, preserved shell, framing and CSRF boundaries, lazy load, exact-window message admission, hide/reopen, dirty warnings, paused monitoring and bounded failed-frame messaging.
- First run exposed duplicate shell injection not rejected. Added an explicit duplicate marker check; no test removed or weakened.
- Local Atlas scope: 33 total, 32 passed, 0 failed, 1 explicit real-Core skip.
- Local full suite: 776 total, 769 passed, 0 failed, 7 real-Core skips, about 105.65s; synthetic/provider-contract tests only, no paid generation.
- New real-browser recipe adds 15 checks at 1440/390px with actual local server and renderer. It runs additively after the existing 20 Atlas cases. Local navigation was blocked by ERR_BLOCKED_BY_ADMINISTRATOR; this is NOT a local browser pass and no policy bypass was attempted. Exact-head hosted CI remains required.

No general “zero regression” or HUMAN PASS is established by this record. Candidate installation must verify exact-head `test`, `project-understanding` and `repository-atlas-experimental` success first, retain existing recipe data and runtime backup, then require human navigation/editing/source-history checks. User WSL has not been modified by preparing this branch.
