// Explicit user-requested live short/long comparison. Called inside native sandbox.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { autoRun } from './auto-run.mjs';
const state = process.env.CPJW_STATE_DIR;
if (!state) throw new Error('A dedicated CPJW_STATE_DIR is required.');
const outcomes = [];
for (const sample of [
  {name:'short-success',delay:100,code:0,marker:'SHORT_COMPARE_OK',mode:'foreground'},
  {name:'short-failure',delay:100,code:7,marker:'SHORT_FAILURE_EXPECTED',mode:'foreground'},
  {name:'long-success',delay:45000,code:0,marker:'LONG_COMPARE_OK',mode:'background'},
]) {
  const script = `setTimeout(()=>{console.log(${JSON.stringify(sample.marker)});process.exit(${sample.code})},${sample.delay})`;
  const started = Date.now();
  const result = await autoRun(['--name',sample.name,'--wait-ms','1000','--',process.execPath,'-e',script]);
  assert.equal(result.mode,sample.mode);
  if (sample.mode === 'foreground') {
    assert.equal(result.exitCode,sample.code); assert.ok(result.stdout.includes(sample.marker));
  }
  const record = {case:sample.name,id:result.id ?? result.job.id,mode:result.mode,returnMs:Date.now()-started,
    exitCode:result.exitCode ?? null,expectedExit:sample.code,marker:sample.marker};
  outcomes.push(record); console.log(JSON.stringify(record));
}
fs.writeFileSync(path.join(state,'comparison.json'),JSON.stringify({owner:process.env.CODEX_THREAD_ID,cases:outcomes},null,2));
