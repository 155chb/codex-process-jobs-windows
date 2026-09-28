import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('native wrapper forwards stdout/stderr, preserves nonzero exit, writes no output files',async()=>{
  const root=path.join(base,'.test-state',randomUUID()),id=`job-${randomUUID()}`;
  const child=spawn(process.execPath,[path.join(base,'scripts/native-run.mjs'),'--id',id,'--notify-after-ms','5000','--',
    process.execPath,'-e','console.log("NATIVE_STDOUT");console.error("NATIVE_STDERR");process.exit(7)'],
    {env:{...process.env,CPJW_STATE_DIR:root},stdio:['ignore','pipe','pipe']});
  let out='',err=''; child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const exit=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  assert.equal(exit,7);assert.match(out,/NATIVE_STDOUT/);assert.match(err,/NATIVE_STDERR/);
  assert.deepEqual(fs.readdirSync(path.join(root,id)),['job.json']);
  const state=JSON.parse(fs.readFileSync(path.join(root,id,'job.json'),'utf8'));
  assert.equal(state.outputFilesCreated,false);assert.equal(state.exitCode,7);
});
