// SPDX-License-Identifier: Apache-2.0
// Requires fresh one-run authorization. No real queue, no persistent hook trust.
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
if(!process.argv.includes('--approved-one-run-hook'))throw Error('One-run Hook approval required');
const codex=process.env.CODEX_PROCESS_JOBS_CODEX_BIN;
if(!codex)throw Error('Explicit Codex executable required');
const endpoint='\\\\.\\pipe\\cpjw-lifecycle-probe-'+randomUUID();const events=[];
const server=net.createServer(socket=>{
  let input='';socket.on('error',()=>{});socket.on('data',b=>{input+=b;if(input.length>4096)socket.destroy();});
  socket.on('end',()=>{try{events.push(JSON.parse(input));}catch{}});
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,resolve);});
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const hook='& '+literal(process.execPath)+' '+literal(path.resolve('test/lifecycle-probe-hook.mjs'));
const config='[{hooks=[{type="command",command='+JSON.stringify(hook)+',timeout=5}]}]';
let output='';let errors='';
try{
  const child=spawn(codex,['--dangerously-bypass-hook-trust','-c','features.hooks=true',
    '-c','hooks.UserPromptSubmit='+config,'-c','hooks.Stop='+config,
    'exec','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json',
    'Reply exactly LIFECYCLE_PROBE_OK. Do not call tools, run commands, modify files or start other tasks.'],{
      env:{...process.env,CPJW_ENABLE_NATIVE_HOOK:'0',CODEX_PROCESS_JOBS_DISABLE_CODEX_QUEUE:'1',CPJW_LIFECYCLE_PROBE_PIPE:endpoint},
      stdio:['ignore','pipe','pipe'],windowsHide:true,
    });
  const timer=setTimeout(()=>child.kill(),90000);
  child.stdout.on('data',b=>{output+=b;if(output.length>1024*1024)child.kill();});
  child.stderr.on('data',b=>{errors+=b;if(errors.length>65536)child.kill();});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timer);
  const start=events.find(e=>e.event==='UserPromptSubmit');const stop=events.find(e=>e.event==='Stop');
  const passed=code===0&&start&&stop&&start.session===stop.session&&start.turn===stop.turn&&output.includes('LIFECYCLE_PROBE_OK');
  console.log(JSON.stringify({passed:!!passed,cliExit:code,events,realQueue:'disabled',persistentTrust:'unchanged',
    error:passed?undefined:errors.slice(-3000)},null,2));process.exitCode=passed?0:1;
}finally{server.close();}
