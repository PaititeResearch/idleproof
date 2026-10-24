import { execFileSync } from 'node:child_process';
import { normalizedProjectPath } from './project-path.mjs';

// What the current change actually did to each file, from Git: the new-side line ranges of its
// hunks against the task's baseline tree, its added text, and whether the file is new. It ranks
// symbols and grounds explanations; it never claims a symbol was changed without a hunk touching it.

const MAX_FILES = 24;
const MAX_ADDED_TEXT = 64 * 1024;
const GIT_TIMEOUT_MS = 5000;
const OBJECT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

function git(cwd, args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true
  });
}

// The tree the current task started from, or HEAD when the session has no captured baseline.
export function changeBase(session = {}) {
  const tree = session?.baselineIdentity?.available ? session.baselineIdentity.base?.tree : null;
  return OBJECT.test(String(tree || '')) ? tree : 'HEAD';
}

function untracked(cwd, files) {
  const listed = files.length ? git(cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...files]) : '';
  return new Set(listed.split('\0').filter(Boolean).map(normalizedProjectPath));
}

// Files the change touched relative to its base (tracked edits and new untracked files), relative to cwd.
export function changedFiles(cwd, session = {}) {
  try {
    const base = changeBase(session);
    const tracked = git(cwd, ['diff', '--no-color', '--no-ext-diff', '--relative', '--name-only', '-z', base, '--']);
    const added = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
    return [...new Set([...tracked.split('\0'), ...added.split('\0')].filter(Boolean).map(normalizedProjectPath))].slice(0, 200);
  } catch {
    return [];
  }
}

// Map of relative path → {newFile, ranges:[[start,end]], addedText}. Missing entries mean unchanged
// or unknown; a Git failure yields an empty map, never an invented change.
export function changeEvidence(cwd, session = {}, files = []) {
  const wanted = [...new Set(files.filter(Boolean).map(normalizedProjectPath))].slice(0, MAX_FILES);
  const evidence = new Map();
  if (!wanted.length) return evidence;
  try {
    const fresh = untracked(cwd, wanted);
    for (const file of fresh) evidence.set(file, { newFile: true, ranges: [[1, Number.MAX_SAFE_INTEGER, true]], addedText: null });
    const tracked = wanted.filter((file) => !fresh.has(file));
    if (!tracked.length) return evidence;
    const diff = git(cwd, ['diff', '--no-color', '--no-ext-diff', '--relative', '-U0', changeBase(session), '--', ...tracked]);
    let current = null;
    for (const line of diff.split('\n')) {
      if (line.startsWith('diff --git ')) { current = null; continue; }
      if (line.startsWith('+++ ')) {
        const target = line.slice(4);
        current = target === '/dev/null' ? null : normalizedProjectPath(target.replace(/^b\//, ''));
        if (current && !evidence.has(current)) evidence.set(current, { newFile: false, ranges: [], addedText: '' });
        continue;
      }
      if (!current) continue;
      const entry = evidence.get(current);
      const hunk = line.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunk) {
        const start = Number(hunk[2]);
        const count = hunk[3] === undefined ? 1 : Number(hunk[3]);
        // [from, to, pure addition]. A pure deletion has no new-side line: it touches the code
        // around its position. Replaced lines are a modification, never an addition.
        entry.ranges.push(count ? [start, start + count - 1, hunk[1] === '0'] : [Math.max(1, start), Math.max(1, start + 1), false]);
        continue;
      }
      if (line.startsWith('+') && entry.addedText.length < MAX_ADDED_TEXT) entry.addedText += `${line.slice(1)}\n`;
    }
  } catch {
    return new Map();
  }
  return evidence;
}

const overlaps = (ranges, start, end) => ranges.some(([from, to]) => from <= end && to >= start);
const addedSpan = (ranges, start, end) => ranges.some(([from, to, pure]) => pure && from <= start && to >= end);

// `symbols`: [{name, line, end_line}] from a parser. A symbol is `added` when one pure addition
// covers its whole span, `modified` when any hunk touches it. Nested symbols are reported individually.
export function changedSymbolsFromLines(symbols = [], change = null) {
  if (!change) return new Map();
  const result = new Map();
  for (const symbol of symbols) {
    if (!Number.isInteger(symbol?.line) || !Number.isInteger(symbol?.end_line)) continue;
    if (change.newFile || addedSpan(change.ranges, symbol.line, symbol.end_line)) result.set(symbol.name, 'added');
    else if (overlaps(change.ranges, symbol.line, symbol.end_line) && result.get(symbol.name) !== 'added') result.set(symbol.name, 'modified');
  }
  return result;
}
