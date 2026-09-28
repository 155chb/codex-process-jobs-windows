// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';

export function execution(command, shell, env = process.env) {
  if (shell) {
    if (command.length !== 1 || !command[0].trim()) throw new Error('--shell needs one PowerShell script argument.');
    const program = env.CPJW_POWERSHELL || path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (!fs.existsSync(program)) throw new Error('PowerShell not found; set CPJW_POWERSHELL.');
    // EncodedCommand prevents quotes, $, backticks and newlines being reinterpreted by a wrapper.
    const script = "$ErrorActionPreference = 'Stop'\n" + command[0] + '\nif ($LASTEXITCODE) { exit $LASTEXITCODE }\n';
    return { kind: 'powershell', program, args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
  }
  if (!command.length) throw new Error('Provide an executable after --.');
  if (/\.(cmd|bat)$/i.test(command[0])) throw new Error('For .cmd/.bat wrappers use --shell and an explicit PowerShell command.');
  return { kind: 'argv', program: command[0], args: command.slice(1) };
}

export function resolveCodex(explicit, env = process.env) {
  if (explicit || env.CPJW_CODEX_BIN) return explicit || env.CPJW_CODEX_BIN;
  // Desktop updates use versioned paths; discovery avoids hardcoding one installed version.
  const dir = path.join(env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (env.LOCALAPPDATA && fs.existsSync(dir)) {
    const candidates = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())
      .map(d => path.join(dir, d.name, 'codex.exe')).filter(f => fs.existsSync(f))
      .map(file => ({ file, time: fs.statSync(file).mtimeMs })).sort((a, b) => b.time - a.time);
    if (candidates[0]) return candidates[0].file;
  }
  return 'codex';
}
