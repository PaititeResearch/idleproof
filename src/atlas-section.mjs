// Optional composition only. The default cockpit bytes and its scripts stay unchanged.
const NAV = '<a href="#repositoryAtlasSection" id="repositoryAtlasTab"><svg class="icon" aria-hidden="true"><use href="#i-map"/></svg>Repository Atlas</a>\n      ';
const SECTION = `<section id="repositoryAtlasSection" class="panel atlas-section" aria-labelledby="repositoryAtlasTitle">
  <div class="section-head panel-head"><div><span class="eyebrow">EXPERIMENTAL · LOCAL ONLY</span><h3 id="repositoryAtlasTitle">Repository Atlas</h3></div><span class="chip">Source-bound · editable user model</span></div>
  <div class="atlas-section-body">
    <p>Explore the current project's captured modules and UML definitions. Your diagram edits stay separate from code, Proof, debt and agent permissions.</p>
    <div class="atlas-section-actions"><button id="atlasSectionOpen" type="button" aria-expanded="false" aria-controls="atlasSectionWorkspace">Open repository map</button><button id="atlasSectionClose" type="button" hidden>Hide map</button><a href="/atlas.html" target="_blank" rel="noopener noreferrer">Open standalone ↗</a></div>
    <p id="atlasSectionStatus" role="status" aria-live="polite">Map not loaded. Opening it reads the existing capture; it does not scan your project or call a model.</p>
    <div id="atlasSectionWorkspace" hidden><iframe id="atlasSectionFrame" title="Repository Atlas — source-bound editable UML" referrerpolicy="no-referrer"></iframe></div>
    <noscript><p>Use Open standalone to access the map. The existing Local cockpit remains available.</p></noscript>
  </div>
</section>

    `;
export function injectAtlasSection(html) {
  if (html.includes('id="repositoryAtlasSection"')) throw new Error('Atlas section shell is incompatible');
  const replacements = [
    ['<a href="#hoodSection">', NAV + '<a href="#hoodSection">'],
    ['<section id="hoodSection"', SECTION + '<section id="hoodSection"'],
    ['</head>', '<link rel="stylesheet" href="/atlas-section.css" />\n</head>'],
    ['</body>', '<script type="module" src="/atlas-section.js"></script>\n</body>']
  ];
  // No best-effort injection into an unknown layout. Only the opt-in request is affected.
  for (const [anchor, value] of replacements) {
    if (html.split(anchor).length !== 2) throw new Error('Atlas section shell is incompatible');
    html = html.replace(anchor, value);
  }
  return html;
}
