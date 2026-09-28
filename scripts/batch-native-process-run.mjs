// SPDX-License-Identifier: Apache-2.0
// Explicit harmless test runner, excluded from the existing native wrapper hook.
// Child exit events are real. Original stdout/stderr stays in this native session.
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {TurnBatch} from './turn-batch-prototype.mjs';
import {enqueueCodexNotification} from './codex-queue.mjs';
import {configuredEnvironment} from './hook-entry.mjs';
import {formatBatchCompletion,parseBatchWake} from './notification-format.mjs';
const owner=process.argv[2];
if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner??''))throw Error('Explicit test owner required');
const endpoint='\\\\.\\pipe\\cpjw-turn-test-'+owner;const coordinator=new TurnBatch();
coordinator.busy=true;
const run=randomUUID();const children=[];const sockets=new Set();const total=6;
let exited=0;let delivered=0;let closing=false;let pendingQueues=0;
const env=configuredEnvironment();
async function notify(wake){
  if(!wake)return;
  pendingQueues++;
  const message=formatBatchCompletion(run,wake.token,[...coordinator.pending.values()]);
  try{
    const reply=await enqueueCodexNotification([{type:'text',text:message}],owner,10000,env,{forceQueueMode:true});
    if(reply){coordinator.accepted(wake.token);console.log('BATCH_QUEUE_ACCEPTED '+wake.token);}
    else {coordinator.uncertain(wake.token);console.log('BATCH_QUEUE_UNAVAILABLE '+wake.token);}
  }catch(error){coordinator.uncertain(wake.token);console.log('BATCH_QUEUE_UNCERTAIN '+error.message);}
  finally{pendingQueues--;}
}
const timeout=setTimeout(()=>shutdown('BATCH_TEST_TIMEOUT',1),180000);
function shutdown(label,code){
  if(closing)return;closing=true;clearTimeout(timeout);console.log(label);
  for(const child of children)if(child.exitCode===null)child.kill();
  for(const socket of sockets)socket.destroy();server.close();process.exitCode=code;
}
const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));let input='';
  socket.on('data',chunk=>{
    input+=chunk;if(input.length>16384){socket.destroy();return;}if(!input.includes('\n'))return;socket.removeAllListeners('data');
    let event;try{event=JSON.parse(input.split('\n')[0]);}catch{socket.end('{}\n');return;}
    if(event.owner!==owner){socket.end('{}\n');return;}
    let items=[];let wake=null;
    if(event.event==='UserPromptSubmit'){
      coordinator.start(event.turn);
      const token=parseBatchWake(event.prompt,run);
      if(token){
        items=coordinator.receive(token,event.turn);delivered+=items.length;
        console.log('BATCH_DELIVERED '+JSON.stringify(items));
      }
    }else if(event.event==='Stop'){
      if(coordinator.turn===null)coordinator.turn=event.turn;
      wake=coordinator.stop(event.turn);
    }
    socket.end(JSON.stringify({items,allDone:exited===total})+'\n');
    void notify(wake);
    if(event.event==='Stop'&&exited===total&&delivered===total&&!coordinator.wake&&!pendingQueues){
      setTimeout(()=>shutdown('BATCH_TEST_PASS all six results delivered',0),100);
    }
  });
});
server.on('error',error=>shutdown('BATCH_SERVER_ERROR '+error.code,1));
await new Promise(resolve=>server.listen(endpoint,resolve));
console.log('BATCH_TEST_READY '+run);
for(const [index,seconds] of [8,10,12,55,58,61].entries()){
  const id='task-'+(index+1);const expected=index%2?7:0;
  const script=`console.log('${id} started');setTimeout(()=>{console.log('${id} ended exit=${expected}');process.exit(${expected})},${seconds*1000})`;
  const child=spawn(process.execPath,['-e',script],{stdio:'inherit',windowsHide:true,shell:false});children.push(child);
  child.once('error',error=>console.error(id+' '+error.message));
  child.once('close',code=>{exited++;console.log('BATCH_COMPLETION '+id+' '+code);void notify(coordinator.complete(id,code??1));});
}
