import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {injectUnifiedAtlas,injectEmbeddedDeep} from '../src/atlas-unified.mjs';

const read=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

test('unified Atlas composes the original structure/notes/history with lazy Deep navigation',()=>{
  const original=read('atlas.html'),combined=injectUnifiedAtlas(original);
  assert.match(combined,/id="atlasUnifiedNav"/);
  assert.match(combined,/role="tablist"/);
  assert.match(combined,/id="atlasUnifiedDeepFrame"/);
  assert.match(combined,/role="tabpanel"/);
  assert.match(combined,/atlas-unified\.js/);
  assert.match(combined,/atlas-unified\.css/);
  assert.match(combined,/id="annotation"/);
  assert.match(combined,/id="note"/);
  assert.match(combined,/id="historyDialog"/);
  assert.match(combined,/id="editor"/);
  assert.match(combined,/id="save"/);
  assert.match(combined,/id="umlExport"/);
  assert.match(combined,/\/atlas\.js/);
  // The original editor, controls, dialogs and scripts are retained as text.
  assert.ok(combined.includes(original.slice(original.indexOf('<div class="intro">'),original.indexOf('</footer>')+9)));
  assert.equal(original.includes('atlasUnifiedNav'),false);
  assert.equal(combined.includes('src="/atlas-deep.html?embedded=1"'),false,'Deep frame must be lazy');
  assert.throws(()=>injectUnifiedAtlas(combined),/ATLAS_UNIFIED_SHELL_INCOMPATIBLE/);
});

test('Deep has an independent same-origin embed bridge without mutating its original document',()=>{
  const plain=read('atlas-deep.html');
  const embedded=injectEmbeddedDeep(plain);
  assert.match(embedded,/atlas-unified-embed\.js/);
  assert.match(embedded,/atlas-unified-embed\.css/);
  assert.match(embedded,/id="globalOverview"/);
  assert.match(embedded,/id="focusChooser"/);
  assert.match(embedded,/id="runtimeView"/);
  assert.match(embedded,/id="sourceCode"/);
  assert.ok(embedded.includes(plain.slice(plain.indexOf('<main>'),plain.indexOf('</main>')+7)));
  assert.equal(plain.includes('atlas-unified-embed.js'),false);
  assert.throws(()=>injectEmbeddedDeep('<main></main>'),/ATLAS_UNIFIED_SHELL_INCOMPATIBLE/);
});

test('unified injection accepts CRLF Windows checkout without normalizing original V1 facts',()=>{
  const original=read('atlas.html').replace(/\r?\n/g,'\r\n');
  const combined=injectUnifiedAtlas(original);
  assert.match(combined,/id="atlasUnifiedNav"/);
  assert.match(combined,/id="atlasUnifiedStructure"/);
  assert.match(combined,/id="atlasUnifiedDeepFrame"/);
  assert.ok(combined.includes(original.slice(original.indexOf('<div class="intro">'),original.indexOf('</footer>')+9)));
  assert.ok(combined.includes('\r\n<div class="intro">'),'Windows newline retained at source boundary');
  assert.throws(()=>injectUnifiedAtlas(combined),/ATLAS_UNIFIED_SHELL_INCOMPATIBLE/);
});
