// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {formatJobCompletion,formatBatchCompletion,parseBatchWake} from '../scripts/notification-format.mjs';
const run='d04425a3-2656-43f4-bdad-90deb7e43cf6';
test('single completion identifies task and distinguishes zero/nonzero exit',()=>{
  assert.match(formatJobCompletion('job-a',0),/任务 ID：job-a\n- 退出码：0（正常退出）/);
  assert.match(formatJobCompletion('job-b','7'),/7（非零退出）/);
});
test('batch display has each result and stable notification identity round trips',()=>{
  const message=formatBatchCompletion(run,'wake-2',[{id:'task-4',code:7},{id:'task-5',code:0}]);
  assert.match(message,/本批任务：2 个/);assert.match(message,/task-4：退出码 7/);
  assert.equal(parseBatchWake(message,run),'wake-2');
  assert.equal(parseBatchWake(message,'00000000-0000-0000-0000-000000000000'),null);
  assert.equal(parseBatchWake('Someone quoted:\n'+message,run),null);
  assert.equal(parseBatchWake(`CPJW batch-test ${run} wake-1: completed tasks available.`,run),'wake-1');
});
