// Explicit development probe: only self-created child processes, no wakeups or files.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const shell=process.env.CPJW_TEST_POWERSHELL ?? 'pwsh';
const runner=fileURLToPath(new URL('../scripts/native-process-run.mjs',import.meta.url));
const watch=fileURLToPath(new URL('../scripts/threshold-watch.ps1',import.meta.url));
for(const [name,threshold] of [['long',1000],['short',10000]]){
 const id='job-'+randomUUID(),tool='exec-'+randomUUID();
 const child=spawn(process.execPath,[runner,'--id',id,'--tool-use-id',tool,'--',process.execPath,'-e','console.log("BEGIN");setTimeout(()=>{console.error("ERR");console.log("END")},4000)'],{stdio:['ignore','pipe','pipe']});
 let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
 const closed=new Promise(r=>child.once('close',r));
 const observer=spawn(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',watch,'-ToolUseId',tool,'-WrapperPath',runner,'-ThresholdMs',String(threshold)],{stdio:['ignore','pipe','pipe']});
 let status='',diag='';observer.stdout.on('data',b=>status+=b);observer.stderr.on('data',b=>diag+=b);
 const code=await new Promise(r=>observer.once('close',r));assert.equal(code,0,diag);
 const result=JSON.parse(status.trim());assert.equal(result.state,name==='long'?'long-running':'completed');
 if(name==='long')assert.equal(result.id,id);
 assert.equal(await closed,0);assert.equal(out,'BEGIN\nEND\n');assert.equal(err,'ERR\n');
 console.log(JSON.stringify({case:name,state:result.state,nativeOutputClean:true}));
}
