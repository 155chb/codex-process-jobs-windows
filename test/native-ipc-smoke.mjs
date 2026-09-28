// SPDX-License-Identifier: Apache-2.0
// Explicit manual smoke test, excluded from npm test. One harmless 32-second job.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const [owner,rollout,shell]=process.argv.slice(2);
if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner??'')||!rollout||!shell)throw Error('Explicit owning thread, rollout and shell required');
const id='job-'+randomUUID();
const observer=spawn(process.execPath,[path.resolve('scripts/process-observer-host.mjs'),id,owner,shell,'30000',rollout],{detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,CODEX_PROCESS_JOBS_DISABLE_CODEX_QUEUE:'0'}});
await new Promise((resolve,reject)=>{observer.once('spawn',resolve);observer.once('error',reject);});observer.unref();
console.log('CPJW_0_4_SMOKE: real broker, threshold=30s, one 32s harmless command, no Queue fallback.');
const payload=spawn(process.execPath,[path.resolve('scripts/native-process-run.mjs'),'--id',id,'--',process.execPath,'-e','console.log("CPJW_SMOKE_STDOUT");setTimeout(()=>{console.error("CPJW_SMOKE_STDERR");console.log("CPJW_SMOKE_DONE");},32000)'],{stdio:'inherit',windowsHide:true});
process.exitCode=await new Promise((resolve,reject)=>{payload.once('close',resolve);payload.once('error',reject);});
