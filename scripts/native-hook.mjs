// SPDX-License-Identifier: Apache-2.0
// Experimental, opt-in native Bash rewrite. Trusted hook launches only a notifier.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
export function literal(value){return "'"+String(value).replaceAll("'","''")+"'";}
// Line comments keep the original command readable without executing it twice.
// Never use a block comment: the payload may itself contain its closing token.
export function commandPreview(command){
  return command.split(/\r\n|[\r\n\u0085\u2028\u2029]/u).map(line=>'# '+line).join('\n');
}
export function prepare(request,env=process.env){
  if(env.CPJW_ENABLE_NATIVE_HOOK!=='1' || process.platform!=='win32')return null;
  if(request.hook_event_name!=='PreToolUse' || request.tool_name!=='Bash')return null;
  const command=request.tool_input?.command;
  if(typeof command!=='string' || !command.trim() || ['native-run.mjs','native-process-run.mjs','process-watch.ps1','start-relay.mjs'].some(name=>command.includes(name)))return null;
  const owner=request.session_id || env.CODEX_THREAD_ID;
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner??''))return null;
  // An explicit shell path is required: never guess a different PowerShell edition.
  const shell=env.CPJW_POWERSHELL;
  if(!shell || !fs.existsSync(shell))return null;
  const id=`job-${randomUUID()}`;
  const budget=Number(env.CPJW_NOTIFY_AFTER_MS || 30000);
  if(!Number.isFinite(budget)||budget<0||budget>30000)throw new Error('Invalid CPJW notification threshold.');
  const args=[process.execPath,path.join(base,'native-process-run.mjs'),'--id',id,'--tool-use-id',request.tool_use_id || '', '--notify-after-ms',String(budget),'--',shell,
    '-NoLogo','-NoProfile','-NonInteractive','-Command',command];
  const rollout=request.transcript_path || env.CPJW_ROLLOUT_PATH;
  const rewritten=commandPreview(command)+'\n\n& '+args.map(literal).join(' ')+'; exit $LASTEXITCODE';
  return {id,owner,budget,shell,rollout,command,args,rewritten};
}
export async function hook(request,env=process.env,diagnostics={}){
  const plan=prepare(request,env);if(!plan)return {};
  if(env.CPJW_TEST_DISABLE_WATCH!=='1' && (!plan.rollout || !fs.existsSync(plan.rollout)))return {};
  if(env.CPJW_TEST_DISABLE_WATCH!=='1'){
    const child=spawn(process.execPath,[path.join(base,'process-observer-host.mjs'),plan.id,plan.owner,plan.shell,String(plan.budget),plan.rollout],{
      // DETACHED_PROCESS works for Node; its normal PowerShell child remains retained.
      detached:true,windowsHide:true,stdio:diagnostics.observerStdio ?? 'ignore',shell:false,env,
    });
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  }
  // PreToolUse requires allow alongside updatedInput. This is a rewrite decision,
  // not a PermissionRequest approval; payload still runs under the original sandbox.
  return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',updatedInput:{command:plan.rewritten}}};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let input='';for await(const chunk of process.stdin)input+=chunk;
  try{console.log(JSON.stringify(await hook(JSON.parse(input))));}
  catch(error){console.error(error.message);process.exitCode=2;}
}
