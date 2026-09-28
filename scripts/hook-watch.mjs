// SPDX-License-Identifier: Apache-2.0
// Runs on the host side. Watches receipts only; never executes payload commands.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { directory,read } from './state.mjs';
import { relay } from './completion-relay.mjs';
const [id,owner]=process.argv.slice(2),dir=directory(id);
const resultFile=path.join(dir,'watch.json');
const result={id,owner,status:'waiting-for-launch',startedAt:new Date().toISOString()};
const persist=()=>fs.writeFileSync(resultFile,JSON.stringify(result,null,2));
persist();
const deadline=Date.now()+Number(process.env.CPJW_COMPLETION_TIMEOUT_MS || 3600000);
try {
  while(Date.now()<deadline) {
    let job;
    try {job=read(id);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(job) {
      if(job.threadId!==owner)throw new Error('Owner mismatch.');
      if(fs.existsSync(path.join(dir,'background-receipt.json'))) {
        const outcome=await relay(id,owner);
        result.status=outcome.status;break;
      }
      if(job.completedAt) {result.status='skipped-foreground';break;}
    } else if(Date.now()-Date.parse(result.startedAt)>120000) {
      result.status='launch-not-observed';break;
    }
    await delay(250);
  }
  if(result.status==='waiting-for-launch')result.status='watch-timeout';
} catch(error) {result.status='failed';result.reason=error.message;}
result.finishedAt=new Date().toISOString();persist();
