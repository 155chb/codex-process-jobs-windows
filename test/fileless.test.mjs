import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('../scripts/native-process-run.mjs',import.meta.url));
test('fileless wrapper works with filesystem mutations forbidden and forwards real failure output',async()=>{
  const code=`import fs from 'node:fs';
    for(const name of ['writeFileSync','appendFileSync','mkdirSync','renameSync','unlinkSync'])fs[name]=()=>{throw new Error('FILESYSTEM_MUTATION_FORBIDDEN');};
    const {run}=await import(${JSON.stringify(new URL('../scripts/native-process-run.mjs',import.meta.url).href)});
    process.exitCode=await run(['--',process.execPath,'-e','console.log("FILELESS_OUT");console.error("FILELESS_ERR");process.exit(7)']);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const exit=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  assert.equal(exit,7);assert.equal(out,"FILELESS_OUT\n");assert.equal(err,"FILELESS_ERR\n");
  assert.doesNotMatch(out+err,/FILESYSTEM_MUTATION_FORBIDDEN/);
});
test('fileless launch failure is a failure, not a successful completion',async()=>{
  const child=spawn(process.execPath,[runner,'--',path.resolve('does-not-exist-cpjw.exe')],{stdio:['ignore','pipe','pipe']});
  let err='';child.stderr.on('data',b=>err+=b);child.stdout.resume();
  const exit=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  assert.equal(exit,1);assert.match(err,/ENOENT/);
});

test('long command output contains only payload stdout/stderr even beyond notification threshold',async()=>{
  const child=spawn(process.execPath,[runner,'--notify-after-ms','100','--',process.execPath,'-e','console.log("BEGIN");setTimeout(()=>{console.error("ERR");console.log("END");process.exit(7)},400)'],{stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const exit=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  assert.equal(exit,7);assert.equal(out,'BEGIN\nEND\n');assert.equal(err,'ERR\n');
});

test('plugin exposes no skills or pre-execution model guidance',async()=>{
  const fs=await import('node:fs');const manifest=JSON.parse(fs.readFileSync(new URL('../.codex-plugin/plugin.json',import.meta.url),'utf8'));
  assert.equal(manifest.skills,undefined);assert.equal(fs.existsSync(new URL('../skills',import.meta.url)),false);
});
