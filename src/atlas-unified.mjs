// Explicit opt-in Atlas UI shell: one user workspace, two isolated evidence engines.
// V1 user-model overlays retain ownership of notes, revisions and UML declarations.
// The Deep iframe is lazy, read-only and never promotes evidence to user declarations.
const once=(source,needle,replacement)=>{
  if(typeof source!=='string'||source.split(needle).length!==2)
    throw new Error('ATLAS_UNIFIED_SHELL_INCOMPATIBLE');
  return source.replace(needle,replacement);
};

export function injectUnifiedAtlas(html){
  let result=once(html,'</head>','<link rel="stylesheet" href="/atlas-unified.css"></head>');
  const nav=[
    '<nav id="atlasUnifiedNav" class="atlas-unified-nav" aria-label="Atlas workspaces">',
    '<div class="atlas-unified-heading"><strong>Atlas</strong><span>One project · structure, UML and deep understanding</span></div>',
    '<div class="atlas-unified-tabs" role="tablist" aria-label="Explore Atlas">',
    '<button type="button" id="atlasUnifiedStructureTab" role="tab" aria-controls="atlasUnifiedStructure" aria-selected="true" tabindex="0">Structure &amp; UML <span>Notes &amp; revisions</span></button>',
    '<button type="button" id="atlasUnifiedDeepTab" role="tab" aria-controls="atlasUnifiedDeep" aria-selected="false" tabindex="-1">Deep understanding <span>Calls, flow &amp; sources</span></button>',
    '</div>',
    '<p id="atlasUnifiedStatus" role="status" aria-live="polite">Structure and UML retain private notes and user model revisions. Deep presents source-bound evidence separately.</p>',
    '</nav>'
  ].join('\n');
  result=once(result,'<main>\n<div class="intro">',
    '<main>\n'+nav+'\n<div id="atlasUnifiedStructure" role="tabpanel" aria-labelledby="atlasUnifiedStructureTab">\n<div class="intro">');
  const deep=[
    '</div>',
    '<section id="atlasUnifiedDeep" class="atlas-unified-deep" role="tabpanel" aria-labelledby="atlasUnifiedDeepTab" hidden>',
    '<p class="atlas-unified-context">Deep analyzes captured HEAD code only, when explicitly requested. Its findings are source-grounded observations or inferences, not verified user-model declarations. For private notes, use Structure &amp; UML.</p>',
    '<iframe id="atlasUnifiedDeepFrame" title="Atlas — semantic calls, control and data flow" referrerpolicy="no-referrer" loading="lazy"></iframe>',
    '</section>'
  ].join('\n');
  result=once(result,'</footer>\n</main>','</footer>\n'+deep+'\n</main>');
  result=once(result,'</body>','<script type="module" src="/atlas-unified.js"></script>\n</body>');
  return result;
}

export function injectEmbeddedDeep(html){
  let result=once(html,'</head>','<link rel="stylesheet" href="/atlas-unified-embed.css"></head>');
  result=once(result,'</body>','<script type="module" src="/atlas-unified-embed.js"></script>\n</body>');
  return result;
}
