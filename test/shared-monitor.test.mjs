// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {Registry} from '../scripts/shared-monitor-prototype.mjs';
test('draining rejects new work; duplicate completion is ignored',()=>{
  const r=new Registry();r.submit('job-a',1);assert.equal(r.drain(),false);
  assert.equal(r.complete('job-a'),true);assert.equal(r.complete('job-a'),false);
  assert.equal(r.drain(),true);assert.equal(r.submit('job-b',1).type,'retry');
  assert.equal(r.submit('job-a',1).duplicate,true);
});
test('host pipe: concurrent submissions, lost ACK, duplicate, drain and exit',{skip:process.platform!=='win32',timeout:10000},async()=>{
  const endpoint='\\\\.\\pipe\\cpjw-prototype-'+randomUUID();
  const child=spawn(process.execPath,['scripts/shared-monitor-prototype.mjs','serve',endpoint],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  const exit=new Promise(resolve=>child.once('exit',resolve));
  const rpc=request=>new Promise((resolve,reject)=>{
    const socket=net.connect(endpoint);let text='';
    socket.setTimeout(1000,()=>socket.destroy(Error('timeout')));
    socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));
    socket.on('data',b=>text+=b);socket.on('error',reject);
    socket.on('end',()=>text?resolve(JSON.parse(text)):reject(Error('ACK missing')));
  });
  try{
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('server exit '+code)));});
    assert.equal((await rpc({type:'hello'})).type,'ready');
    const replies=await Promise.all(Array.from({length:24},(_,i)=>rpc({type:'submit',id:'job-'+i,delay:100})));
    assert.ok(replies.every(r=>r.type==='accepted'));
    await assert.rejects(rpc({type:'submit',id:'job-lost',delay:100,dropAck:true}),/ACK missing/);
    assert.equal((await rpc({type:'submit',id:'job-lost',delay:100})).duplicate,true);
    assert.equal((await rpc({type:'drain'})).type,'busy');
    await new Promise(resolve=>setTimeout(resolve,250));
    const stats=await rpc({type:'stats'});assert.equal(stats.jobs,25);assert.equal(stats.completed,25);
    assert.equal((await rpc({type:'drain'})).type,'draining');
    assert.equal((await rpc({type:'submit',id:'job-late',delay:0})).type,'retry');
    assert.equal((await rpc({type:'stop'})).type,'stopping');assert.equal(await exit,0);
    await assert.rejects(rpc({type:'hello'}));
  }finally{if(child.exitCode===null)child.kill();}
});
