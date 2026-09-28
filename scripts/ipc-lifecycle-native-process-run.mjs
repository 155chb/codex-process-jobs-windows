// SPDX-License-Identifier: MIT
// Isolated Windows probe adapted from leeguooooo/open-cross-session src/codex-ipc.ts.
// See licenses/open-cross-session-MIT.txt. Never installed in the default Hook.
import net from 'node:net';
import {randomUUID} from 'node:crypto';
const thread=process.argv[2];const mode=process.argv[3]??'inspect';
if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(thread??'')||!['inspect','wake'].includes(mode))throw Error('Explicit thread and inspect/wake mode required');
const nonce=randomUUID();let startWritten=false;let socket;const pending=new Map();
const lifecycle=[];
const bridge=net.createServer(connection=>{
  let buffer='';
  connection.on('error',()=>{});
  connection.on('data',chunk=>{
    buffer+=chunk;
    if(buffer.length>16384){connection.destroy();return;}
    if(!buffer.includes('\n'))return;
    try{
      const event=JSON.parse(buffer.split('\n')[0]);
      lifecycle.push({event:event.event,turn:event.turn??null});
      console.log('IPC_LIFECYCLE '+JSON.stringify(lifecycle.at(-1)));
      connection.end('{}\n');
    }catch{connection.destroy();}
  });
});
await new Promise((resolve,reject)=>{
  bridge.once('error',reject);
  bridge.listen(String.raw`\\.\pipe\cpjw-turn-test-`+thread,resolve);
});
const endpoint='\\\\.\\pipe\\codex-ipc';let client='initializing-client';let incoming=Buffer.alloc(0);
function rejectAll(error){for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();}
function request(method,version,params,target){
  const requestId=randomUUID();const timeoutMs=10000;
  const payload=Buffer.from(JSON.stringify({type:'request',requestId,sourceClientId:client,version,method,params,
    ...(target?{targetClientId:target}:{}),timeoutMs}));
  const frame=Buffer.alloc(payload.length+4);frame.writeUInt32LE(payload.length);payload.copy(frame,4);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(requestId);reject(Error(method+' timeout'));},timeoutMs);
    pending.set(requestId,{timer,resolve,reject});
    try{socket.write(frame);if(method==='thread-follower-start-turn')startWritten=true;}
    catch(error){clearTimeout(timer);pending.delete(requestId);reject(error);}
  }).then(response=>{if(response.resultType!=='success')throw Error(response.error??method+' rejected');return response;});
}
try{
  if(mode==='wake'){
    console.log('IPC_PROBE_SCHEDULED '+nonce+'; toolOutput only; delay=20s');
    await new Promise(resolve=>setTimeout(resolve,20000));
  }
  socket=net.connect(endpoint);
  socket.on('data',chunk=>{
    incoming=Buffer.concat([incoming,chunk]);
    while(incoming.length>=4){
      const size=incoming.readUInt32LE();if(!size||size>4*1024*1024){socket.destroy(Error('Frame limit exceeded'));return;}
      if(incoming.length<size+4)return;
      let event;try{event=JSON.parse(incoming.subarray(4,size+4));}catch{socket.destroy(Error('Invalid frame'));return;}
      incoming=incoming.subarray(size+4);
      if(event.type==='response'&&pending.has(event.requestId)){
        const p=pending.get(event.requestId);clearTimeout(p.timer);pending.delete(event.requestId);p.resolve(event);
      }
      // Unsolicited broadcasts are discarded, never printed or stored.
    }
  });
  socket.on('error',rejectAll);socket.on('close',()=>rejectAll(Error('IPC closed')));
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.destroy();reject(Error('connect timeout'));},3000);
    socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('error',e=>{clearTimeout(timer);reject(e);});
  });
  const init=await request('initialize',0,{clientType:'cpjw-probe'});
  if(typeof init.result?.clientId!=='string')throw Error('No IPC client ID');client=init.result.clientId;
  const route=await request('thread-owner-discovery',1,{hostId:'local',conversationId:thread});
  const owner=route.handledByClientId;if(typeof owner!=='string'||!owner)throw Error('No owner for current thread');
  console.log('IPC_PROBE_READY '+JSON.stringify({thread,initialized:true,ownerFound:true,mode}));
  if(mode==='wake'){
    // Fail closed if another prompt won the race while this probe was waiting.
    // Stop is only a Hook boundary, not an atomic guarantee of Desktop idleness.
    // Do not treat this guard as production notification coordination.
    if(lifecycle.at(-1)?.event!=='Stop'){
      throw Error('IPC wake cancelled: no latest Stop boundary, or another prompt already started a turn');
    }
    const result=await request('thread-follower-start-turn',2,{conversationId:thread,turnStart:{
      request:{threadId:thread,input:[],clientUserMessageId:nonce,toolOutput:{
        name:'cpjw_completion_probe',namespace:null,
        output:`CPJW IPC probe ${nonce} completed. This is the user-authorized one-shot tool-output wake experiment in the current chat. This test observes lifecycle Hooks. Collect the original native session result once; report the observed Hook events. Do not start another experiment in this turn.`,
      }},context:{inheritThreadSettings:true,threadStartKind:'user'},
    }},owner);
    const turnId=result.result?.result?.turn?.id;
    if(typeof turnId!=='string')throw Error('No accepted turn ID');
    console.log('IPC_PROBE_TURN_ACCEPTED '+JSON.stringify({nonce,turnId,inputCount:0,toolName:'cpjw_completion_probe'}));
    await new Promise(resolve=>setTimeout(resolve,2000));
    console.log('IPC_LIFECYCLE_SUMMARY '+JSON.stringify(lifecycle));
  }
}catch(error){
  console.error(JSON.stringify({status:startWritten?'unknown-outcome':'not-submitted',error:error.message,retried:false}));process.exitCode=1;
}finally{socket?.destroy();rejectAll(Error('Probe closed'));bridge.close();}
