// SPDX-License-Identifier: Apache-2.0
// Isolated protocol prototype: simulated completion only, no commands or queue.
import net from 'node:net';
export class Registry {
  constructor(){ this.phase='accepting'; this.jobs=new Map(); }
  submit(id,delay){
    if(this.jobs.has(id))return {type:'accepted',id,duplicate:true};
    if(this.phase!=='accepting')return {type:'retry',reason:'draining'};
    this.jobs.set(id,{done:false});
    return {type:'accepted',id,duplicate:false,delay};
  }
  complete(id){const job=this.jobs.get(id);if(!job||job.done)return false;job.done=true;return true;}
  drain(){if([...this.jobs.values()].some(j=>!j.done))return false;this.phase='draining';return true;}
}
if(process.argv[2]==='serve'){
  const endpoint=process.argv[3];
  if(!endpoint?.startsWith('\\\\.\\pipe\\cpjw-prototype-'))throw Error('Prototype pipe required');
  const registry=new Registry();let completed=0;const sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    let input='';socket.on('data',chunk=>{
      input+=chunk;if(input.length>4096){socket.destroy();return;}
      if(!input.includes('\n'))return;
      socket.removeAllListeners('data');
      let request;try{request=JSON.parse(input.split('\n')[0]);}catch{socket.end('{"type":"invalid"}\n');return;}
      let response;
      if(request.type==='hello')response={type:'ready',pid:process.pid,phase:registry.phase};
      else if(request.type==='submit' && /^job-[a-z0-9-]{1,80}$/.test(request.id??'') && Number.isInteger(request.delay) && request.delay>=0 && request.delay<=2000){
        response=registry.submit(request.id,request.delay);
        if(response.type==='accepted'&&!response.duplicate)setTimeout(()=>{if(registry.complete(request.id))completed++;},request.delay);
      }else if(request.type==='stats')response={type:'stats',jobs:registry.jobs.size,completed,phase:registry.phase};
      else if(request.type==='drain')response={type:registry.drain()?'draining':'busy'};
      else if(request.type==='stop' && registry.phase==='draining'){
        response={type:'stopping'};setTimeout(()=>{for(const s of sockets)s.destroy();server.close();},20);
      }else response={type:'invalid'};
      // Deliberately drop ACK to test reconnect and idempotency.
      if(request.dropAck)socket.destroy();else socket.end(JSON.stringify(response)+'\n');
    });
  });
  server.listen(endpoint,()=>console.log('READY'));
  server.on('error',error=>{console.error(error.code);process.exitCode=1;});
}
