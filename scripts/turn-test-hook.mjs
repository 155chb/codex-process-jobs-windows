// SPDX-License-Identifier: Apache-2.0
// Test-only lifecycle bridge. No service exists outside a manually started test.
import net from 'node:net';
import {brokerRequest} from './broker-client.mjs';
let input='';for await(const b of process.stdin){input+=b;if(input.length>1024*1024)throw Error('Oversized event');}
const event=JSON.parse(input);
const owner=event.session_id;
if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner??'')){
  console.log('{}');
}else{
  try{await brokerRequest(owner,{kind:event.hook_event_name},500);}catch{}
  const endpoint='\\\\.\\pipe\\cpjw-turn-test-'+owner;
  const response=await new Promise(resolve=>{
    const socket=net.connect(endpoint);let data='';let settled=false;
    const finish=value=>{if(settled)return;settled=true;socket.destroy();resolve(value);};
    socket.setTimeout(1500,()=>finish(null));socket.on('error',()=>finish(null));
    socket.on('connect',()=>socket.write(JSON.stringify({event:event.hook_event_name,owner,turn:event.turn_id,prompt:event.prompt})+'\n'));
    socket.on('data',b=>{data+=b;if(data.length>16384)return finish(null);if(data.includes('\n')){
      try{finish(JSON.parse(data.split('\n')[0]));}catch{finish(null);}
    }});socket.on('end',()=>finish(null));
  });
  const result=response?.items?.length&&event.hook_event_name==='UserPromptSubmit'?
    {hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:
      'CPJW real batch test completed items: '+JSON.stringify(response.items)+'. Report these actual results; retain original native session for the final output. '+
      (response.allDone?'All six payloads exited.':'Other payloads remain running; do independent work or end the turn, without polling.')}}:{};
  console.log(JSON.stringify(result));
}
