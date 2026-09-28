// SPDX-License-Identifier: Apache-2.0
// Runs as an asynchronous PreToolUse hook. Never touches payload stdout/stderr.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {configuredEnvironment} from './hook-entry.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
export function contextFor(request,result){
  if(result?.state!=='long-running'||!/^job-[0-9a-f-]{36}$/.test(result.id??''))return {};
  const command=String(request.tool_input?.command??'').slice(0,500);
  return {hookSpecificOutput:{hookEventName:'PreToolUse',additionalContext:
    `CPJW has now observed this command still running beyond 30 seconds. Task ID: ${result.id}. Tool invocation: ${request.tool_use_id}. Command reference: ${JSON.stringify(command)}. `+
    'HANDOFF REQUIRED NOW: This command is not complete. The observer will provide an implicit completion result. Preserve the original native session ID and any already-running functions.exec cell ID; stdout/stderr remain exclusively in the native session. Do not poll, sleep, or wait for this task or its execution cell. An existing write_stdin await may continue independently; do not wait for that cell before ending your reply, and do not start a second collector. If no independent authorized work remains, end this turn immediately with a brief truthful running-status message. On the completion wake, if a functions.exec cell already owns a pending native wait, collect that existing cell once with functions.wait; otherwise collect the original native session once using write_stdin. Use any already-delivered terminal result without collecting again. Do not rerun the command or read extra logs.'}};
}
export async function thresholdHook(request,env=process.env,observe){
  const configured=configuredEnvironment(env);
  if(configured.CPJW_ENABLE_NATIVE_HOOK!=='1'||request.hook_event_name!=='PreToolUse'||request.tool_name!=='Bash'||!/^exec-[0-9a-f-]{36}$/i.test(request.tool_use_id??''))return {};
  const command=request.tool_input?.command;
  if(typeof command!=='string'||['native-run.mjs','native-process-run.mjs','process-watch.ps1','start-relay.mjs'].some(x=>command.includes(x)))return {};
  // Matches the unique tool-use marker added by the synchronous wrapper hook.
  const args=['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(base,'threshold-watch.ps1'),
    '-ToolUseId',request.tool_use_id,'-WrapperPath',path.join(base,'native-process-run.mjs')];
  const result=observe?await observe():await new Promise(resolve=>{
    const child=spawn(configured.CPJW_POWERSHELL,args,{stdio:['ignore','pipe','ignore'],windowsHide:true,shell:false});
    let out='';child.on('error',()=>resolve(null));child.stdout.on('data',b=>{if(out.length<8192)out+=b;});
    child.on('close',()=>{try{resolve(JSON.parse(out.trim()));}catch{resolve(null);}});
  });
  return contextFor(request,result);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let input='';for await(const b of process.stdin){input+=b;if(input.length>1024*1024)throw Error('Oversized hook input');}
  try{console.log(JSON.stringify(await thresholdHook(JSON.parse(input))));}catch(e){console.error(e.message);process.exitCode=1;}
}
