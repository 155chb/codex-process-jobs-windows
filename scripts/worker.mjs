// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { read, save, directory, ownerIdle } from './state.mjs';
import { enqueueCodexNotification } from './codex-queue.mjs';

const LOG_LIMIT = 65536;
export function appendTail(buffer, chunk, limit = LOG_LIMIT) {
  if (chunk.length >= limit) return Buffer.from(chunk.subarray(chunk.length - limit));
  const keep = Math.min(buffer.length, limit - chunk.length);
  return Buffer.concat([buffer.subarray(buffer.length - keep), chunk]);
}
export function completionMessage(job) {
  // Deliberately excludes command, path, name, environment and output.
  return `CPJW background job ${job.id} completed with exit code ${job.exitCode ?? 'unavailable'}.`;
}
async function deliver(job, env) {
  if (job.notification.status === 'disabled') return;
  job.notification = { status: 'waiting-for-idle' }; save(job, env);
  const deadline = Date.now() + Number(env.CPJW_IDLE_TIMEOUT_MS || 3600000);
  let settled = false;
  while (Date.now() < deadline) {
    let idle = false;
    try { idle = ownerIdle(job.rollout, job.createdAt); } catch { /* Missing or unreadable history cannot establish idle. */ }
    if (idle && settled) break;
    settled = idle;
    await delay(2000);
  }
  if (!settled || Date.now() >= deadline) {
    job.notification = { status: 'unavailable', reason: 'No confirmed idle boundary within timeout.' };
    save(job, env); return;
  }
  // Persist intent before dispatch. Never retry uncertain acceptance, to avoid duplicate turns.
  job.notification = { status: 'dispatching', attemptedAt: new Date().toISOString() }; save(job, env);
  try {
    let reason;
    const result = await enqueueCodexNotification([{ type: 'text', text: completionMessage(job) }], job.threadId,
      Number(env.CPJW_QUEUE_TIMEOUT_MS || 30000), { ...env, CODEX_PROCESS_JOBS_CODEX_BIN: job.codex },
      { forceQueueMode: true, onUnavailable: value => { reason = value; } });
    job.notification = result ? { status: 'accepted', transport: result.transport, acceptedAt: new Date().toISOString() }
      : { status: 'unavailable', reason };
  } catch (error) {
    job.notification = { status: error.turnAccepted ? 'acceptance-uncertain' : 'failed', reason: error.message };
  }
  save(job, env);
}
export async function run(id, env = process.env) {
  const job = read(id, env);
  const lock = fs.openSync(path.join(directory(id, env), 'worker.lock'), 'wx', 0o600);
  try { fs.writeFileSync(lock, String(process.pid)); } finally { fs.closeSync(lock); }
  // A worker may only launch a new record once. No persisted environment secrets.
  if (job.status !== 'starting') throw new Error('Job has already been launched.');
  const dir = directory(id, env);
  job.workerPid = process.pid; job.startedAt = new Date().toISOString(); job.status = 'running';
  job.heartbeatAt = job.startedAt; save(job, env);
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), outBytes = 0, errBytes = 0;
  const flush = () => {
    fs.writeFileSync(path.join(dir, 'stdout.log'), stdout);
    fs.writeFileSync(path.join(dir, 'stderr.log'), stderr);
  };
  const heartbeat = setInterval(() => {
    flush(); job.heartbeatAt = new Date().toISOString(); save(job, env);
  }, 5000);
  try {
    const child = spawn(job.execution.program, job.execution.args, {
      cwd: job.cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    job.childPid = child.pid ?? null; save(job, env);
    child.stdout.on('data', chunk => { outBytes += chunk.length; stdout = appendTail(stdout, chunk); });
    child.stderr.on('data', chunk => { errBytes += chunk.length; stderr = appendTail(stderr, chunk); });
    const outcome = await new Promise(resolve => {
      let launchError = null;
      child.once('error', error => { launchError = error.message; });
      child.once('close', (code, signal) => resolve({ code, signal, launchError }));
    });
    job.exitCode = outcome.code; job.signal = outcome.signal; job.launchError = outcome.launchError;
    job.status = outcome.code === 0 && !outcome.launchError ? 'succeeded' : 'failed';
  } catch (error) {
    job.status = 'failed'; job.exitCode = null; job.launchError = error.message;
  } finally {
    clearInterval(heartbeat); flush();
    job.completedAt = new Date().toISOString();
    job.logs = { limitBytesPerStream: LOG_LIMIT, stdoutBytes: outBytes, stderrBytes: errBytes,
      stdoutTruncated: outBytes > LOG_LIMIT, stderrTruncated: errBytes > LOG_LIMIT };
    save(job, env);
  }
  await deliver(job, env);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
