// SPDX-License-Identifier: Apache-2.0
// Experimental transparent wrapper. The native tool, not a hook, runs this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { main } from './job.mjs';
import { read, directory } from './state.mjs';

export async function autoRun(argv, env = process.env) {
  const sep = argv.indexOf('--');
  if (sep < 0) throw new Error('Expected -- before original executable and arguments.');
  const options = argv.slice(0, sep);
  const at = options.indexOf('--wait-ms');
  const waitMs = at < 0 ? 2000 : Number(options[at + 1]);
  if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 10000) throw new Error('Invalid wait budget.');
  if (at >= 0) options.splice(at, 2);
  // Notification is deferred until the foreground/background decision is durable.
  const started = await main(['start', ...options, '--no-notify', '--', ...argv.slice(sep + 1)], env);
  const deadline = Date.now() + waitMs;
  let job;
  do {
    job = read(started.id, env);
    if (['succeeded', 'failed'].includes(job.status)) break;
    await delay(50);
  } while (Date.now() < deadline);
  if (['succeeded', 'failed'].includes(job.status)) {
    const result = await main(['result', started.id], env);
    return { mode: 'foreground', exitCode: job.exitCode, ...result };
  }
  // A host-side notifier can attach to this receipt without executing the payload.
  const receipt = { id: job.id, returnedAt: new Date().toISOString(), mode: 'background',
    notification: 'requires-host-relay', instruction: 'Task continues independently; do not poll or rerun. An attached host relay can notify the owning thread.' };
  fs.writeFileSync(path.join(directory(job.id, env), 'background-receipt.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  autoRun(process.argv.slice(2)).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.mode === 'foreground') process.exitCode = result.exitCode ?? 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
