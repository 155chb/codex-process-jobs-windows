// SPDX-License-Identifier: Apache-2.0
import net from 'node:net';
export const endpoint=owner=>String.raw`\\.\pipe\cpjw-completion-`+owner;
export function brokerRequest(owner,message,timeout=1500){
  return new Promise((resolve,reject)=>{
    const socket=net.connect(endpoint(owner));let data='',done=false;
    const finish=(error,value)=>{if(done)return;done=true;socket.destroy();error?reject(error):resolve(value);};
    socket.setTimeout(timeout,()=>finish(Error('CPJW broker timeout')));socket.on('error',e=>finish(e));
    socket.on('connect',()=>socket.write(JSON.stringify(message)+'\n'));
    socket.on('end',()=>{if(!done)finish(Error('CPJW broker closed'));});
    socket.on('data',chunk=>{data+=chunk;if(data.length>16384)return finish(Error('Broker response too large'));if(data.includes('\n')){try{finish(null,JSON.parse(data.split('\n')[0]));}catch(e){finish(e);}}});
  });
}
