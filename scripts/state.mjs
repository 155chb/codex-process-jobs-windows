// SPDX-License-Identifier: Apache-2.0
// Windows implementation, 2026, 155chb contributors.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export function home(env = process.env) {
  return path.resolve(env.CODEX_HOME || path.join(os.homedir(), '.codex'));
}
export function root(env = process.env) {
  return path.resolve(env.CPJW_STATE_DIR || path.join(home(env), 'process-jobs-windows'));
}
export function safeId(id) {
  if (!/^job-[0-9a-f-]{36}$/.test(id ?? '')) throw new Error('Invalid job ID.');
  return id;
}
export function directory(id, env = process.env) { return path.join(root(env), safeId(id)); }
export function read(id, env = process.env) {
  const value = JSON.parse(fs.readFileSync(path.join(directory(id, env), 'job.json'), 'utf8'));
  if (value.id !== id || value.schemaVersion !== 1) throw new Error('Invalid job record.');
  return value;
}
export function save(job, env = process.env) {
  const dir = directory(job.id, env);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `state-${randomUUID()}.tmp`);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(job, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  const destination = path.join(dir, 'job.json');
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, destination); break; }
    catch (error) {
      if (process.platform !== 'win32' || !['EACCES', 'EBUSY', 'EPERM'].includes(error.code) || attempt >= 5) {
        try { fs.unlinkSync(temp); } catch { /* Keep the original write error. */ }
        throw error;
      }
      // A Windows reader or scanner can briefly block replacing an existing file.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(10 * 2 ** attempt, 100));
    }
  }
}
export function list(env = process.env) {
  if (!fs.existsSync(root(env))) return [];
  return fs.readdirSync(root(env)).filter(n => /^job-[0-9a-f-]{36}$/.test(n))
    .map(id => read(id, env)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function tail(file, max = 65536) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, max));
    fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
    return buffer.toString('utf8');
  } finally { fs.closeSync(fd); }
}

// Adapted conceptually from Joel Farthing's session.mjs: locate only the owner rollout.
export function ownerRollout(threadId, env = process.env) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId ?? ''))
    throw new Error('A valid owning CODEX_THREAD_ID or --thread UUID is required.');
  const stack = [path.join(home(env), 'sessions')], matches = [];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { if (['ENOENT', 'EACCES'].includes(e.code)) continue; throw e; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name.endsWith(`${threadId}.jsonl`))
        matches.push({ file, time: fs.statSync(file).mtimeMs });
    }
  }
  matches.sort((a, b) => b.time - a.time);
  return matches[0]?.file ?? null;
}
export function ownerIdle(file, notBefore) {
  if (!file) return false;
  const lines = tail(file, 1024 * 1024).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let item;
    try { item = JSON.parse(lines[i]); } catch { continue; }
    if (item.type !== 'event_msg') continue;
    if (['task_complete', 'turn_aborted'].includes(item.payload?.type)) {
      // Migrated histories leave old rollout files behind. Old completion is not
      // evidence that the current launch turn has ended.
      if (notBefore && !(Date.parse(item.timestamp) >= Date.parse(notBefore))) return false;
      return true;
    }
    if (item.payload?.type === 'task_started') return false;
  }
  return false;
}
