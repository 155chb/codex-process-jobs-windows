// SPDX-License-Identifier: Apache-2.0
// Keep the payload in Codex's native execution session. Never capture its output.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeId, save, directory } from './state.mjs';

export async function nativeRun(argv, env = process.env) {
  env = {...env};
  const sep = argv.indexOf('--');
  if (sep < 0 || !argv[sep + 1]) throw new Error('Expected -- executable args...');
  const options = argv.slice(0, sep), command = argv.slice(sep + 1);
  let id = `job-${randomUUID()}`, budget = 2000, toolUseId=null;
  for (let i = 0; i < options.length; i++) {
    if (options[i] === '--id') id = safeId(options[++i]);
    else if (options[i] === '--notify-after-ms') budget = Number(options[++i]);
    else if (options[i] === '--state-root') env.CPJW_STATE_DIR=path.resolve(options[++i]);
    else if (options[i] === '--owner') env.CODEX_THREAD_ID=options[++i];
    else if (options[i] === '--tool-use-id') toolUseId=options[++i];
    else throw new Error(`Unsupported option ${options[i]}`);
  }
  if (!Number.isFinite(budget) || budget < 0 || budget > 30000) throw new Error('Invalid notification threshold.');
  const job = {schemaVersion:1,id,threadId:env.CODEX_THREAD_ID ?? null,cwd:process.cwd(),
    createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),status:'running',exitCode:null,
    outputTransport:'native-exec-session',outputFilesCreated:false,nativeToolUseId:toolUseId,notification:{status:'external-relay'}};
  const dir = directory(id,env);
  if (fs.existsSync(path.join(dir,'job.json'))) throw new Error('Job already exists; payload not restarted.');
  let trackingAvailable=true;
  try { save(job,env); }
  catch (error) { trackingAvailable=false; console.error(`CPJW tracking unavailable; original command stays in native execution: ${error.message}`); }
  console.log(`[CPJW native job ${id}; output remains in the original execution session]`);
  const threshold = setTimeout(() => {
    if (!trackingAvailable) return;
    try {
      fs.writeFileSync(path.join(dir,'background-receipt.json'),JSON.stringify({id,mode:'background',
        outputTransport:'native-exec-session',thresholdMs:budget,createdAt:new Date().toISOString()}));
    } catch (error) {
      console.error(`CPJW notification receipt unavailable: ${error.message}`);
    }
  },budget);
  try {
    const child = spawn(command[0],command.slice(1),{
      cwd:process.cwd(),env,shell:false,windowsHide:true,stdio:'inherit',detached:false,
    });
    const outcome = await new Promise(resolve => {
      let launchError=null;
      child.once('error',error=>{launchError=error.message;});
      child.once('close',(code,signal)=>resolve({code,signal,launchError}));
    });
    job.exitCode=outcome.code; job.signal=outcome.signal; job.launchError=outcome.launchError;
    job.status=outcome.code===0 && !outcome.launchError ? 'succeeded':'failed';
    if (outcome.launchError) console.error(outcome.launchError);
  } catch (error) {
    job.status='failed'; job.launchError=error.message; console.error(error.message);
  } finally {
    clearTimeout(threshold); job.completedAt=new Date().toISOString();
    if (trackingAvailable) {
      try { save(job,env); } catch(error) { console.error(`CPJW completion status unavailable: ${error.message}`); }
    }
  }
  return job;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  nativeRun(process.argv.slice(2)).then(job=>{process.exitCode=job.exitCode ?? 1;})
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
