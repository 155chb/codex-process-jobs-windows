// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const enabled=process.platform==='win32'&&process.env.CPJW_RUN_HOST_TESTS==='1';
const shell=process.env.CPJW_POWERSHELL??'pwsh.exe';
for(const threshold of [30000,0])test('retained Windows process handle and threshold '+threshold,{skip:!enabled,timeout:20000},async()=>{
  const id='job-'+randomUUID(),owner=randomUUID();
  const observer=spawn(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',path.resolve('scripts/process-watch.ps1'),'-JobId',id,'-Owner',owner,'-WrapperPath',path.resolve('scripts/native-process-run.mjs'),'-NodePath',process.execPath,'-ThresholdMs',String(threshold),'-LaunchTimeoutMs','10000'],{env:{...process.env,CODEX_PROCESS_JOBS_DISABLE_CODEX_QUEUE:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='',err='';observer.stdout.on('data',x=>output+=x);observer.stderr.on('data',x=>err+=x);
  const done=new Promise((resolve,reject)=>{observer.once('close',resolve);observer.once('error',reject);});
  const payload=spawn(process.execPath,[path.resolve('scripts/native-process-run.mjs'),'--id',id,'--',process.execPath,'-e','console.log("HOST_NATIVE_OUTPUT");setTimeout(()=>process.exit(7),2500)'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const payloadDone=new Promise((resolve,reject)=>{payload.once('close',resolve);payload.once('error',reject);});payload.stdout.resume();payload.stderr.resume();
  try{assert.equal(await payloadDone,7);assert.equal(await done,0,err);assert.match(output,/CPJW_OBSERVER_ATTACHED/);assert.match(output,/CPJW_OBSERVER_EXIT 7/);assert.match(output,threshold===30000?/CPJW_OBSERVER_SHORT/:/CPJW_OBSERVER_NOTIFICATION_DISABLED/);}
  finally{if(observer.exitCode===null)observer.kill();if(payload.exitCode===null)payload.kill();}
});
