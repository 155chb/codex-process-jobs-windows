import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareIdleSubmission} from '../scripts/ipc-idle-guard.mjs';

const idle=()=>({type:'task_complete',turn:'old-turn'});
async function probe(read,settle=async()=>{},initialize=async()=>{}){
  let sends=0;
  const result=await prepareIdleSubmission({read,settle,initialize,send:async()=>{sends++;return 'accepted';}});
  return {result,sends};
}
test('unknown lifecycle fails closed',async()=>assert.equal((await probe(()=>null)).sends,0));
test('active user turn never submits',async()=>assert.equal((await probe(()=>({type:'task_started',turn:'user'}))).sends,0));
test('Stop alone is not task completion',async()=>assert.equal((await probe(()=>({type:'Stop',turn:'old-turn'}))).sends,0));
test('user wins during settle: no submission',async()=>{
  let state=idle();
  const p=await probe(()=>state,async()=>{state={type:'task_started',turn:'user'};});
  assert.equal(p.sends,0);assert.equal(p.result.reason,'changed-during-settle');
});
test('user wins during IPC initialize: no submission',async()=>{
  let state=idle();
  const p=await probe(()=>state,async()=>{},async()=>{state={type:'task_started',turn:'user'};});
  assert.equal(p.sends,0);assert.equal(p.result.reason,'changed-during-initialize');
});
test('another completed turn also invalidates observation',async()=>{
  let state=idle();
  const p=await probe(()=>state,async()=>{state={type:'task_complete',turn:'new-turn'};});
  assert.equal(p.sends,0);
});
test('stable completed turn submits exactly once',async()=>{
  const p=await probe(idle);assert.equal(p.sends,1);assert.equal(p.result.status,'submitted');
});
test('uncertain submission is not retried',async()=>{
  let sends=0;
  await assert.rejects(prepareIdleSubmission({read:idle,settle:async()=>{},initialize:async()=>{},send:async()=>{sends++;throw Error('response lost');}}));
  assert.equal(sends,1);
});
