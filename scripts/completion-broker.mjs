// SPDX-License-Identifier: Apache-2.0
// Per-thread in-memory broker. Incoming data is status only, never commands.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {endpoint,brokerRequest} from './broker-client.mjs';
import {CompletionBuffer} from './completion-buffer.mjs';
import {readLifecycle,prepareIdleSubmission} from './ipc-idle-guard.mjs';
import {connectDesktop} from './desktop-ipc.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
export async function startBroker({id,owner,shell,budget,rollout,settleMs=5000,observe,connect=connectDesktop,read=()=>readLifecycle(rollout)}){
  const initial={kind:'register',id};
  try{return await brokerRequest(owner,initial);}catch{}
  const items=new CompletionBuffer(),jobs=new Set();let timer,expiry,watcher,flushing=false,activity=0;
  const lifetime=setTimeout(()=>{clearTimeout(timer);clearTimeout(expiry);watcher?.close();server.close();},3900000);
  const server=net.createServer(socket=>{
    let data='';socket.on('error',()=>{});socket.setTimeout(1500,()=>socket.destroy());
    socket.on('data',chunk=>{
      data+=chunk;if(data.length>16384){socket.destroy();return;}if(!data.includes('\n'))return;
      let msg;try{msg=JSON.parse(data.split('\n')[0]);}catch{socket.destroy();return;}
      let ok=false;
      if(msg.kind==='register'&&/^job-[0-9a-f-]{36}$/.test(msg.id??'')){register(msg.id);ok=true;}
      if(msg.kind==='completed'&&jobs.has(msg.id)&&Number.isInteger(msg.exitCode)){
        jobs.delete(msg.id);items.add({id:msg.id,exitCode:msg.exitCode});activity++;schedule();ok=true;
      }
      if(['Stop','UserPromptSubmit','PreToolUse'].includes(msg.kind)){activity++;schedule();ok=true;}
      socket.end(JSON.stringify({ok})+'\n');
    });
  });
  function expiryCheck(){clearTimeout(expiry);if(!jobs.size&&!items.size&&!flushing)expiry=setTimeout(()=>{clearTimeout(lifetime);watcher?.close();server.close();},10000);}
  function register(job){
    clearTimeout(expiry);if(jobs.has(job)||items.seen.has(job))return;jobs.add(job);
    if(observe){observe(job);return;}
    const child=spawn(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(base,'process-watch.ps1'),'-JobId',job,'-Owner',owner,'-WrapperPath',path.join(base,'native-process-run.mjs'),'-NodePath',process.execPath,'-ThresholdMs',String(budget)],{windowsHide:true,stdio:'ignore',shell:false,env:process.env});
    child.once('error',()=>{jobs.delete(job);expiryCheck();});
    child.once('close',()=>{jobs.delete(job);expiryCheck();});
  }
  function schedule(){clearTimeout(timer);if(items.size&&!flushing)timer=setTimeout(flush,settleMs);else expiryCheck();}
  async function flush(){
    if(flushing||!items.size)return;flushing=true;let ipc;const generation=activity;
    try{
      const result=await prepareIdleSubmission({read,settle:()=>new Promise(r=>setTimeout(r,settleMs)),initialize:async()=>{ipc=await connect(owner);},send:async()=>{
        if(activity!==generation)return {deferred:true};
        // Remove before dispatch. Never resend even if acknowledgement is lost.
        const batch=items.take();return await ipc.send(batch);
      }});
      if(result.status==='submitted'&&!result.result?.deferred)console.log('[CPJW] IPC accepted '+JSON.stringify(result.result));
    }catch(e){console.error('[CPJW] '+(ipc?.written?'IPC outcome uncertain; no retry':'IPC unavailable; pending retained')+': '+e.message);}
    finally{ipc?.close();flushing=false;if(items.size&&activity!==generation)schedule();else expiryCheck();}
    // Busy threads resume via lifecycle/file events, never an agent polling loop.
  }
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint(owner),resolve);});}
  catch(e){clearTimeout(lifetime);server.close();if(e.code!=='EADDRINUSE')throw e;for(let n=0;n<3;n++){try{return await brokerRequest(owner,initial);}catch{await new Promise(r=>setTimeout(r,200));}}throw Error('Existing CPJW broker did not acknowledge registration');}
  try{watcher=fs.watch(rollout,()=>{activity++;schedule();});}catch(e){clearTimeout(lifetime);server.close();throw e;}
  register(id);return {ok:true,close:()=>{clearTimeout(lifetime);clearTimeout(timer);clearTimeout(expiry);watcher?.close();server.close();}};
}
