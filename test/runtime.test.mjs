import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { autoRun } from '../scripts/auto-run.mjs';
import { read } from '../scripts/state.mjs';
import { appendTail, completionMessage } from '../scripts/worker.mjs';

const base = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, CPJW_STATE_DIR: path.join(base, '.test-state', randomUUID()) };
test('short command returns its real nonzero exit code and bounded output', async () => {
  const r = await autoRun(['--wait-ms', '4000', '--', process.execPath, '-e', 'console.log("SHORT_OK");process.exit(7)'], env);
  assert.equal(r.mode, 'foreground'); assert.equal(r.exitCode, 7);
  assert.match(r.stdout, /SHORT_OK/); assert.equal(r.job.notification.status, 'disabled');
});
test('long command returns before completion, then retains actual exit/output', async () => {
  const start = Date.now();
  const r = await autoRun(['--wait-ms', '200', '--', process.execPath, '-e', 'setTimeout(()=>console.log("LONG_OK"),2000)'], env);
  assert.equal(r.mode, 'background'); assert.ok(Date.now() - start < 1800);
  const deadline = Date.now() + 10000;
  let j;
  do { j = read(r.id, env); if (j.completedAt) break; await delay(100); } while (Date.now() < deadline);
  assert.equal(j.status, 'succeeded'); assert.equal(j.exitCode, 0);
  assert.match(fs.readFileSync(path.join(env.CPJW_STATE_DIR, r.id, 'stdout.log'), 'utf8'), /LONG_OK/);
});
test('log bounds and notification contain no payload data', () => {
  assert.equal(appendTail(Buffer.alloc(65000), Buffer.alloc(5000)).length, 65536);
  const message = completionMessage({id:'job-example',exitCode:0,execution:'SECRET',stdout:'SECRET'});
  assert.doesNotMatch(message,/SECRET/);
});
