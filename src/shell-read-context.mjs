import { admitProjectSource } from './project-source.mjs';
import path from 'node:path';

const privatePath = value => /(?:^|\/)(?:\.[^/]+|credentials?(?:\.[^/]+)?|secrets?(?:\.[^/]+)?|id_rsa|id_ed25519)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i.test(value);

// Deliberately small shell grammar, never evaluated. Unknown syntax invalidates
// the whole command so cwd changes, loops, substitutions and conditionals cannot
// silently turn a string that mentions a path into a file observation.
function readArguments(words) {
  const [tool, ...args] = words;
  let i = 0;
  if (tool === 'cat') {
    while (/^-[nbsETAv]+$/.test(args[i] || '')) i++;
  } else if (tool === 'nl') {
    if (args[i] === '-ba') i++;
  } else if (tool === 'head' || tool === 'tail') {
    if (args[i] === '-n' && /^\d{1,6}$/.test(args[i+1] || '')) i += 2;
    else if (/^-n?\d{1,6}$/.test(args[i] || '')) i++;
  } else if (tool === 'sed') {
    if (args[i++] !== '-n' || !/^\d+(?:,\d+)?p$/.test(args[i++] || '')) return null;
  } else return null;
  if (args[i] === '--') i++;
  const files = args.slice(i);
  return files.length && files.every(file => file && !file.startsWith('-')) ? files : null;
}

export function shellReadPaths(event = {}, cwd = event.cwd) {
  if (!cwd || event.hook_event_name !== 'PostToolUse' || event.error
      || !/^(?:Bash|exec_command|shell_command)$/.test(event.tool_name || '')) return [];
  const response = event.tool_response;
  if (response && (response.interrupted || response.is_error || response.error
      || ['exit_code','exitCode'].some(key => response[key] !== undefined && response[key] !== 0))) return [];
  const input = event.tool_input || {};
  const command = input.command ?? input.cmd;
  if (typeof command !== 'string' || !command.trim() || command.length > 16000) return [];
  // An explicit tool workdir must be resolved by the caller, not guessed here.
  if (input.workdir || input.cwd) return [];
  const commands = [[]];
  const token = /\s+|&&|;|\r?\n|'[^'\r\n]*'|"[^"\r\n]*"|[A-Za-z0-9_./:-]+/y;
  let at = 0, count = 0, previous = 'separator';
  while (at < command.length) {
    token.lastIndex = at;
    const match = token.exec(command);
    if (!match || ++count > 512) return [];
    at = token.lastIndex;
    const value = match[0];
    if (/^[;\r\n]|^&&$/.test(value) || /^\s+$/.test(value) && /[\r\n]/.test(value)) {
      if ((value === ';' || value === '&&') && !commands.at(-1).length) return [];
      if (commands.at(-1).length) commands.push([]);
      previous = value === '&&' ? 'and' : 'separator';
    } else if (!/^\s+$/.test(value)) {
      if (previous === 'word') return [];
      const word = /^['"]/.test(value) ? value.slice(1,-1) : value;
      // Reject expansions even inside quotes; this bounded parser has no shell state.
      if (/[$`\\*?\[\]{}~<>|&;\x00-\x1f]/.test(word)) return [];
      commands.at(-1).push(word);
      previous = 'word';
    } else if (previous === 'word') previous = 'space';
  }
  if (previous === 'and') return [];
  const batches = commands.filter(words => words.length).map(readArguments);
  if (!batches.length || batches.length > 32 || batches.some(files => !files)) return [];
  const candidates = [...new Set(batches.flat())];
  if (candidates.length > 32) return [];
  return candidates.flatMap(candidate => {
    // Never inspect private configuration or credential-shaped paths for a lesson.
    const admitted = admitProjectSource(cwd, candidate);
    if (!admitted || privatePath(admitted.relative)
        || privatePath(path.relative(admitted.root,admitted.canonical).split(path.sep).join('/'))) return [];
    return [admitted.relative];
  });
}
