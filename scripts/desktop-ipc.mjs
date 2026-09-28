// SPDX-License-Identifier: MIT
// Adapted from the isolated open-cross-session IPC probe; see NOTICE and licenses.
import net from 'node:net';
import {randomUUID} from 'node:crypto';
export async function connectDesktop(thread){
  const socket=net.connect(String.raw`\\.\pipe\codex-ipc`);
  let client='initializing-client',buffer=Buffer.alloc(0),written=false;
  const pending=new Map();
  const fail=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();};
  socket.on('error',fail);socket.on('close',()=>fail(Error('Desktop IPC closed')));
  socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=4){
      const size=buffer.readUInt32LE();
      if(!size||size>4*1024*1024){socket.destroy(Error('IPC frame too large'));return;}
      if(buffer.length<size+4)return;
      let event;try{event=JSON.parse(buffer.subarray(4,size+4));}catch{socket.destroy(Error('Invalid IPC frame'));return;}
      buffer=buffer.subarray(size+4);
      const p=event.type==='response'&&pending.get(event.requestId);
      if(p){clearTimeout(p.timer);pending.delete(event.requestId);p.resolve(event);}
    }
  });
  function request(method,version,params,target){
    const requestId=randomUUID(),timeoutMs=10000;
    const payload=Buffer.from(JSON.stringify({type:'request',requestId,sourceClientId:client,version,method,params,timeoutMs,...target?{targetClientId:target}:{}}));
    const frame=Buffer.alloc(payload.length+4);frame.writeUInt32LE(payload.length);payload.copy(frame,4);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error(method+' timeout'));},timeoutMs);
      pending.set(requestId,{timer,resolve,reject});
      try{if(method==='thread-follower-start-turn')written=true;socket.write(frame);}catch(e){clearTimeout(timer);pending.delete(requestId);reject(e);}
    }).then(r=>{if(r.resultType!=='success')throw Error(r.error??'IPC rejected');return r;});
  }
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.destroy();reject(Error('IPC connect timeout'));},3000);socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('error',e=>{clearTimeout(timer);reject(e);});});
    const init=await request('initialize',0,{clientType:'cpjw'});client=init.result?.clientId;
    if(typeof client!=='string')throw Error('No client ID');
    const route=await request('thread-owner-discovery',1,{hostId:'local',conversationId:thread});
    const owner=route.handledByClientId;if(typeof owner!=='string'||!owner)throw Error('No thread owner');
    return {close:()=>socket.destroy(),get written(){return written;},send:async items=>{
      const noticeId=randomUUID();
      const response=await request('thread-follower-start-turn',2,{conversationId:thread,turnStart:{request:{threadId:thread,input:[],clientUserMessageId:noticeId,toolOutput:{name:'cpjw_completed_jobs',namespace:null,output:JSON.stringify({kind:'cpjw-completion',noticeId,tasks:items,instructions:'Match task IDs to original commands and native sessions in this chat. If an existing functions.exec cell already owns a pending write_stdin await, collect that existing cell once using functions.wait instead of starting a second collector; otherwise collect the completed native session once using write_stdin. Use an already-delivered terminal result without collecting again. Do not rerun commands, read extra output logs, or poll remaining tasks. Continue only already authorized work.'})}},context:{inheritThreadSettings:true}}},owner);
      const turnId=response.result?.result?.turn?.id;if(typeof turnId!=='string')throw Error('No accepted turn ID');return {noticeId,turnId};
    }};
  }catch(e){socket.destroy();throw e;}
}
