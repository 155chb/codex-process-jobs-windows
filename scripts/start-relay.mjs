// SPDX-License-Identifier: Apache-2.0
// Start the plugin-owned finite notifier. It does not execute the original command.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { read, directory } from './state.mjs';
const [id, owner] = process.argv.slice(2);
const job = read(id);
if (job.threadId !== owner) throw new Error('Owner mismatch; no relay started.');
const dir = directory(id);
if (!fs.existsSync(path.join(dir, 'background-receipt.json'))) {
  if (!['succeeded', 'failed'].includes(job.status)) throw new Error('Wrapper has not classified this task yet.');
  console.log(JSON.stringify({id, notification:'skipped-foreground', relayStarted:false}));
  process.exit(0);
}
const child = spawn(process.execPath, [fileURLToPath(new URL('./completion-relay.mjs', import.meta.url)), id, owner],
  { detached:true, windowsHide:true, stdio:'ignore', env:process.env, shell:false });
await new Promise((resolve,reject) => { child.once('spawn',resolve); child.once('error',reject); });
child.unref();
console.log(JSON.stringify({id, relayPid:child.pid, notification:'pending', payloadExecution:'unchanged in sandbox'}));
