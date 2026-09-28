import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { relay, validateCompleted } from '../scripts/completion-relay.mjs';
import { save } from '../scripts/state.mjs';
const owner = randomUUID();
const base = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function fixture() {
  const env = {...process.env, CPJW_STATE_DIR:path.join(base,'.test-state',randomUUID())};
  const job = {schemaVersion:1,id:`job-${randomUUID()}`,threadId:owner,status:'succeeded',exitCode:0,completedAt:new Date().toISOString(),command:'SECRET'};
  save(job,env);
  fs.writeFileSync(path.join(env.CPJW_STATE_DIR,job.id,'background-receipt.json'),JSON.stringify({id:job.id,mode:'background'}));
  return {env,job};
}
test('relay verifies owner and terminal state', () => {
  const {job} = fixture();
  assert.throws(()=>validateCompleted(job,randomUUID()),/owner/);
  assert.equal(validateCompleted({...job,status:'running'},owner),false);
});
test('relay dispatches once, only metadata, with queue mode', async () => {
  const {env,job} = fixture(); let calls=0;
  const result = await relay(job.id,owner,env, async (input,thread,timeout,e,options)=> {
    calls++; assert.equal(thread,owner); assert.equal(options.forceQueueMode,true);
    assert.doesNotMatch(JSON.stringify(input),/SECRET/); return {transport:'mock'};
  });
  assert.equal(result.status,'accepted'); assert.equal(calls,1);
  await assert.rejects(relay(job.id,owner,env,()=>{calls++;}),/EEXIST/);
  assert.equal(calls,1);
});
test('uncertain acceptance never retries', async () => {
  const {env,job} = fixture(); let calls=0;
  const result = await relay(job.id,owner,env,async()=> {
    calls++; throw Object.assign(new Error('ack timeout'),{turnAccepted:true});
  });
  assert.equal(result.status,'acceptance-uncertain'); assert.equal(calls,1);
});
test('foreground jobs cannot send a completion notification', async () => {
  const {env,job} = fixture(); let calls=0;
  fs.unlinkSync(path.join(env.CPJW_STATE_DIR,job.id,'background-receipt.json'));
  await assert.rejects(relay(job.id,owner,env,()=>{calls++;}),/ENOENT/);
  assert.equal(calls,0);
});
