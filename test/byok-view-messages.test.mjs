import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatByokError } from '../public/byok-view.js';

// Every refusal the local BYOK code can raise reaches the page as a sentence, never a bare code.
test('every BYOK code thrown by the local implementation has a human message', () => {
  const sources = ['../src/byok.mjs', '../src/byok-storage.mjs'].map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  const codes = [...new Set([...sources.matchAll(/new Error\('(BYOK_[A-Z0-9_]+)'\)/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 15, `found ${codes.length} codes`);
  for (const code of codes) {
    const text = formatByokError(new Error(code));
    assert.doesNotMatch(text, /BYOK_/, `${code} reaches the page as a bare code`);
    assert.match(text, /^[A-Z].+\.$/, code);
  }
});

test('refusals before any generation say that nothing was sent; unknown codes stay visible', () => {
  for (const code of ['BYOK_SCAN_REQUIRED', 'BYOK_NOT_CONFIGURED', 'BYOK_SCOPE_INVALID', 'BYOK_SENSITIVE_PATH', 'BYOK_EXPLICIT_CONSENT_REQUIRED']) {
    assert.match(formatByokError(new Error(code)), /Nothing was sent\./, code);
  }
  assert.equal(formatByokError(new Error('BYOK_SOMETHING_NEW')), 'The request could not be completed (BYOK_SOMETHING_NEW).');
  assert.equal(formatByokError(new Error('HTTP 502')), 'HTTP 502');
});
