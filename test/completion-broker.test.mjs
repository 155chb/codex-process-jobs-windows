// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {startBroker} from '../scripts/completion-broker.mjs';
import {brokerRequest} from '../scripts/broker-client.mjs';
import {CompletionBuffer} from '../scripts/completion-buffer.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('completion buffer batches exit failures and prevents duplicate delivery',()=>{
  const b=new CompletionBuffer();assert.equal(b.add({id:'a',exitCode:7}),true);
  assert.equal(b.add({id:'a',exitCode:7}),false);b.add({id:'b',exitCode:0});
  assert.deepEqual(b.take().map(x=>x.exitCode),[7,0]);assert.equal(b.add({id:'a',exitCode:7}),false);
});
test('broker waits for idle, merges real pipe statuses, deduplicates and never retries uncertain dispatch',{skip:process.platform!=='win32',timeout:6000},async()=>{
  const owner=randomUUID(),id='job-'+randomUUID(),id2='job-'+randomUUID(),id3='job-'+randomUUID();
  const dir=path.resolve('.test-state',randomUUID());fs.mkdirSync(dir,{recursive:true});
  const rollout=path.join(dir,'fixture.jsonl');fs.writeFileSync(rollout,'');
  const observed=[],sent=[];let state={type:'task_started',turn:'busy'},uncertain=false;
  const broker=await startBroker({id,owner,rollout,settleMs:40,observe:x=>observed.push(x),read:()=>state,connect:async()=>({close(){},written:true,send:async items=>{sent.push(items);if(uncertain)throw Error('ACK lost');return {turnId:'mock'};}})});
  try{
    await brokerRequest(owner,{kind:'register',id:id2});
    await brokerRequest(owner,{kind:'register',id:id2});assert.equal(observed.length,2);
    await brokerRequest(owner,{kind:'completed',id,exitCode:0});
    await brokerRequest(owner,{kind:'completed',id:id2,exitCode:7});
    await pause(160);assert.equal(sent.length,0);
    state={type:'task_complete',turn:'idle'};await brokerRequest(owner,{kind:'Stop'});
    await pause(200);assert.equal(sent.length,1);assert.equal(sent[0].length,2);assert.equal(sent[0][1].exitCode,7);
    assert.equal((await brokerRequest(owner,{kind:'completed',id,exitCode:0})).ok,false);
    await brokerRequest(owner,{kind:'register',id:id3});uncertain=true;
    await brokerRequest(owner,{kind:'completed',id:id3,exitCode:1});await pause(200);
    await brokerRequest(owner,{kind:'Stop'});await pause(200);assert.equal(sent.length,2);
  }finally{broker.close();}
});
