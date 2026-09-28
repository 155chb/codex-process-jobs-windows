// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {TurnBatch} from '../scripts/turn-batch-prototype.mjs';
test('busy completions become one wake, late queued completions delivered together',()=>{
  const c=new TurnBatch();c.start('t1');
  for(let i=0;i<24;i++)assert.equal(c.complete('job-'+i,i%2?7:0),null);
  const wake=c.stop('t1');assert.ok(wake);c.accepted(wake.token);
  assert.equal(c.complete('job-late',0),null);
  const items=c.receive(wake.token,'t2');assert.equal(items.length,25);
  assert.equal(c.receive(wake.token,'t2').length,0);
  assert.equal(c.stop('t2'),null);
});
test('completion during handling waits for matching Stop; stale Stop ignored',()=>{
  const c=new TurnBatch();c.start('old');c.start('new');c.complete('one',7);
  assert.equal(c.stop('old'),null);assert.equal(c.busy,true);
  const wake=c.stop('new');c.receive(wake.token,'handle');c.complete('two',0);
  assert.equal(c.wake,null);assert.ok(c.stop('handle'));
});
test('user turn while wake pending does not cause a second queued wake',()=>{
  const c=new TurnBatch();c.start('one');c.complete('a',0);
  const wake=c.stop('one');c.accepted(wake.token);c.start('user');c.complete('b',0);
  assert.equal(c.stop('user'),null);assert.equal(c.receive(wake.token,'notice').length,2);
});
test('uncertain queue acceptance is not retried; completion is idempotent',()=>{
  const c=new TurnBatch();const wake=c.complete('a',0);c.uncertain(wake.token);
  c.start('one');c.complete('b',7);assert.equal(c.stop('one'),null);
  assert.equal(c.complete('a',7),null);assert.equal(c.pending.size,2);
});
