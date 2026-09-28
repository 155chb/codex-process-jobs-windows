// SPDX-License-Identifier: Apache-2.0
// CPJ-inspired lifecycle checks; independently implemented for a fileless probe.
// Reads Codex's existing transcript, never creates a job/output log.
import fs from 'node:fs';

export function readLifecycle(path){
  const fd=fs.openSync(path,'r');
  try{
    const size=fs.fstatSync(fd).size;
    const start=Math.max(0,size-2*1024*1024);
    const buffer=Buffer.alloc(size-start);
    fs.readSync(fd,buffer,0,buffer.length,start);
    const lines=buffer.toString('utf8').split('\n');
    if(start)lines.shift();
    let latest=null;
    for(const line of lines){
      let record;try{record=JSON.parse(line);}catch{continue;}
      const event=record.payload;
      if(record.type==='event_msg'&&['task_started','task_complete','turn_aborted'].includes(event?.type)){
        latest={type:event.type,turn:event.turn_id};
      }
    }
    return latest;
  }finally{fs.closeSync(fd);}
}

export async function prepareIdleSubmission({read,settle,initialize,send}){
  const first=read();
  if(first?.type!=='task_complete'||!first.turn)return {status:'deferred',reason:'not-completed'};
  await settle();
  const unchanged=()=>{
    const latest=read();
    return latest?.type==='task_complete'&&latest.turn===first.turn;
  };
  if(!unchanged())return {status:'deferred',reason:'changed-during-settle'};
  await initialize();
  if(!unchanged())return {status:'deferred',reason:'changed-during-initialize'};
  // No asynchronous work between this check and send. A cross-process race
  // still exists: this is not an atomic server-side compare-and-start.
  return {status:'submitted',result:await send(),previousTurn:first.turn};
}
