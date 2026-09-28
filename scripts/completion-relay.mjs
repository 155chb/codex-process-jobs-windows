// SPDX-License-Identifier: Apache-2.0
// Host-side notification ONLY. Never evaluates payload commands or launches jobs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { read, directory } from './state.mjs';
import { enqueueCodexNotification } from './codex-queue.mjs';

export function validateCompleted(job, owner) {
  if (job.threadId !== owner) throw new Error('Job owner does not match relay owner.');
  if (!['succeeded', 'failed'].includes(job.status) || !job.completedAt) return false;
  if (job.exitCode !== null && !Number.isInteger(job.exitCode)) throw new Error('Invalid terminal exit code.');
  return true;
}
export async function relay(id, owner, env = process.env, enqueue = enqueueCodexNotification) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner ?? '')) throw new Error('Invalid owner UUID.');
  const dir = directory(id, env), resultFile = path.join(dir, 'relay.json');
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'background-receipt.json'), 'utf8'));
  if (receipt.id !== id || receipt.mode !== 'background') throw new Error('Not a background receipt; no notification sent.');
  // Retain lock even after failure; an uncertain delivery must not be retried.
  const lock = fs.openSync(path.join(dir, 'relay.lock'), 'wx', 0o600);
  fs.closeSync(lock);
  const result = { schemaVersion: 1, id, owner, relayPid: process.pid,
    startedAt: new Date().toISOString(), status: 'waiting-for-completion' };
  const persist = () => fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  persist();
  try {
    const deadline = Date.now() + Number(env.CPJW_COMPLETION_TIMEOUT_MS || 900000);
    let job;
    do {
      job = read(id, env);
      if (validateCompleted(job, owner)) break;
      if (Date.now() >= deadline) throw new Error('Completion watch timed out. No notification sent.');
      await delay(1000);
    } while (true);
    result.status = 'dispatching'; result.attemptedAt = new Date().toISOString(); persist();
    let reason;
    // Queue mode delegates active-turn handling to Codex. An old JSONL transcript
    // is NOT a reliable idle signal after thread history migration.
    const message = `CPJW background job ${id} completed with exit code ${job.exitCode ?? 'unavailable'}.`;
    const accepted = await enqueue([{type:'text', text:message}], owner, 30000, env,
      { forceQueueMode: true, onUnavailable: value => { reason = value; } });
    result.status = accepted ? 'accepted' : 'unavailable';
    result.reason = reason ?? null;
    result.transport = accepted?.transport ?? null;
  } catch (error) {
    result.status = error.turnAccepted ? 'acceptance-uncertain' : 'failed';
    result.reason = error.message;
  }
  result.finishedAt = new Date().toISOString(); persist();
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  relay(process.argv[2], process.argv[3]).then(result => {
    console.log(JSON.stringify(result)); process.exitCode = result.status === 'accepted' ? 0 : 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
