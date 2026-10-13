#!/usr/bin/env bash
# Update only the isolated human-recipe runtime; never the private witness.
set +x
set -euo pipefail
umask 077
unset NODE_OPTIONS NODE_DEBUG

RECIPE_ROOT="${IDLEPROOF_RECIPE_ROOT:-$HOME/recette-idleproof-alpha}"
NODE="${IDLEPROOF_RECIPE_NODE:-$HOME/.nvm/versions/node/v22.23.3/bin/node}"
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT="$RECIPE_ROOT/projects/projet-multicouche"
RUNTIME="$RECIPE_ROOT/runtime"
CLI="$RUNTIME/node_modules/idleproof/bin/idleproof.mjs"
test -x "$NODE"
test -f "$CLI"
test -d "$PROJECT/.idleproof"
export PATH="$(dirname -- "$NODE"):$PATH"
NPM="$(dirname -- "$NODE")/npm"
test -x "$NPM"

# Refuse to stop a different recipe instance recorded in this project.
cd -- "$PROJECT"
"$NODE" --input-type=module <<'JS'
import fs from 'node:fs';
if (fs.existsSync('.idleproof/server.json')) {
  const info=JSON.parse(fs.readFileSync('.idleproof/server.json','utf8'));
  if(info.port!==4778 || fs.realpathSync(info.cwd)!==fs.realpathSync('.'))
    throw new Error('Unexpected recipe server identity; update stopped before installation.');
}
JS

WORK="$(mktemp -d "$RECIPE_ROOT/byok-update.XXXXXX")"
mkdir -- "$WORK/backup" "$WORK/candidate"
# Older npm releases still invoke prepare during pack with --ignore-scripts.
# Some also ignore script-shell and invoke bare sh. Block both paths only while
# packing; keep the package manifests and the caller's shell environment intact.
mkdir -- "$WORK/no-lifecycle"
printf '#!/bin/sh\nexit 0\n' > "$WORK/no-lifecycle/sh"
chmod 700 "$WORK/no-lifecycle/sh"
PATH="$WORK/no-lifecycle:$PATH" "$NPM" pack "$RUNTIME/node_modules/idleproof" --ignore-scripts --script-shell "$WORK/no-lifecycle/sh" --pack-destination "$WORK/backup" --json > "$WORK/backup.json"
PATH="$WORK/no-lifecycle:$PATH" "$NPM" pack "$SOURCE" --ignore-scripts --script-shell "$WORK/no-lifecycle/sh" --pack-destination "$WORK/candidate" --json > "$WORK/candidate.json"
BACKUP="$WORK/backup/$("$NODE" -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[0].filename' "$WORK/backup.json")"
CANDIDATE="$WORK/candidate/$("$NODE" -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[0].filename' "$WORK/candidate.json")"
test -f "$BACKUP"
test -f "$CANDIDATE"
STOPPED=0
rollback() {
  local status=$?
  trap - ERR
  if [ "$STOPPED" = 1 ]; then
    printf '%s\n' 'Update failed; restoring the previous runtime.' >&2
    "$NPM" install --offline --ignore-scripts --no-audit --no-fund --prefix "$RUNTIME" "$BACKUP" &&
      "$NODE" "$CLI" start --port 4778 --no-open ||
      printf 'Automatic restore failed. Backup: %s\n' "$BACKUP" >&2
  fi
  exit "$status"
}
trap rollback ERR
"$NODE" "$CLI" stop
STOPPED=1
"$NPM" install --offline --ignore-scripts --no-audit --no-fund --prefix "$RUNTIME" "$CANDIDATE"
"$NODE" --check "$RUNTIME/node_modules/idleproof/src/byok.mjs"
"$NODE" --check "$RUNTIME/node_modules/idleproof/public/project-scan.js"
"$NODE" "$CLI" start --port 4778 --no-open
STOPPED=0
trap - ERR
"$NODE" "$CLI" ai status
printf 'Recipe updated: http://127.0.0.1:4778/\nBackup retained: %s\nNo generation was requested.\n' "$BACKUP"
