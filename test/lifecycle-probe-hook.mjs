// SPDX-License-Identifier: Apache-2.0
// Probe sends only lifecycle identity to a plugin-owned pipe, no prompt/log files.
import net from 'node:net';
let input='';for await(const b of process.stdin){input+=b;if(input.length>1024*1024)throw Error('Oversized event');}
const event=JSON.parse(input);const endpoint=process.env.CPJW_LIFECYCLE_PROBE_PIPE;
if(!endpoint?.startsWith('\\\\.\\pipe\\cpjw-lifecycle-probe-'))throw Error('Invalid probe pipe');
if(!['UserPromptSubmit','Stop'].includes(event.hook_event_name))throw Error('Unexpected event');
await new Promise((resolve,reject)=>{
  const socket=net.connect(endpoint);
  socket.setTimeout(2000,()=>socket.destroy(Error('timeout')));
  socket.on('error',reject);socket.on('connect',()=>socket.end(JSON.stringify({
    event:event.hook_event_name,session:event.session_id,turn:event.turn_id,stopActive:event.stop_hook_active??null,
  })+'\n'));socket.on('close',resolve);
});
console.log('{}');
