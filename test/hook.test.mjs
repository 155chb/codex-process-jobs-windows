import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {prepare,hook,literal,commandPreview} from '../scripts/native-hook.mjs';
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env={...process.env,CPJW_ENABLE_NATIVE_HOOK:'1',CPJW_TEST_DISABLE_WATCH:'1',
  CODEX_THREAD_ID:randomUUID(),CPJW_STATE_DIR:path.join(base,'.test-state',randomUUID()),
  CPJW_POWERSHELL:'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'};
const request={hook_event_name:'PreToolUse',tool_name:'Bash',cwd:base,tool_use_id:'test-call',tool_input:{command:'Write-Output "quotes $var"\nexit 7'}};

test('original command appears first as inert line comments for every line separator',()=>{
  const command='Write-Output "first"\r\n#>\rWrite-Output "second"\u0085third\u2028fourth\u2029fifth';
  assert.equal(commandPreview(command),'# Write-Output "first"\n# #>\n# Write-Output "second"\n# third\n# fourth\n# fifth');
  const plan=prepare({...request,tool_input:{command}},env);
  assert.ok(plan.rewritten.startsWith(commandPreview(command)+'\n\n& '));
  assert.equal(plan.args.at(-1),command);
});

test('multiline preview does not execute payload twice or change stdout, stderr or exit',async()=>{
  const command="Write-Output `\n  'ONCE_MARKER'\r\n$s = @'\n#> embedded block-comment terminator\n'@\nWrite-Output $s\n# trailing backtick `\nWrite-Error 'PREVIEW_STDERR' -ErrorAction Continue\nexit 7";
  const run=script=>new Promise((resolve,reject)=>{
    const child=spawn(env.CPJW_POWERSHELL,['-NoProfile','-NonInteractive','-Command',script],{cwd:base,env,stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
    child.once('error',reject);child.once('close',code=>resolve({out,err,code}));
  });
  const original=await run(command);
  const wrapped=await run(prepare({...request,tool_input:{command}},env).rewritten);
  assert.equal(wrapped.code,original.code);
  assert.equal(wrapped.code,7);
  assert.equal(wrapped.out,original.out);
  assert.equal((wrapped.out.match(/ONCE_MARKER/g)||[]).length,1);
  assert.match(original.err,/PREVIEW_STDERR/);assert.match(wrapped.err,/PREVIEW_STDERR/);
  assert.doesNotMatch(wrapped.err,/ParserError/);
});

test('default long-task threshold is 30 seconds and oversized thresholds are rejected',()=>{
  assert.equal(prepare(request,{...env,CPJW_NOTIFY_AFTER_MS:undefined}).budget,30000);
  assert.throws(()=>prepare(request,{...env,CPJW_NOTIFY_AFTER_MS:'30001'}),/threshold/);
});
test('production hook declines takeover without a valid current rollout',async()=>{
  assert.deepEqual(await hook(request,{...env,CPJW_TEST_DISABLE_WATCH:'0',CPJW_ROLLOUT_PATH:''}),{});
});
test('hook is opt-in, shell-specific, and excludes its own launcher',()=>{
  assert.equal(prepare(request,{...env,CPJW_ENABLE_NATIVE_HOOK:'0'}),null);
  assert.equal(prepare(request,{...env,CPJW_POWERSHELL:''}),null);
  assert.equal(prepare({...request,tool_input:{command:'node native-run.mjs'}},env),null);
  assert.equal(literal("a'b$`"),"'a''b$`'");
});

test('rewritten outer PowerShell preserves exact failure code and quoted script',async()=>{
  const command="Write-Output 'quote: '' 中文 $literal'; Write-Error 'TEST_STDERR' -ErrorAction Continue; exit 7";
  const isolated={...env,CPJW_STATE_DIR:path.join(base,'.test-state',randomUUID())};
  const plan=prepare({...request,tool_input:{command}},isolated);
  const child=spawn(env.CPJW_POWERSHELL,['-NoProfile','-NonInteractive','-Command',plan.rewritten],{
    cwd:base,env,stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const code=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  assert.equal(code,7);assert.match(out,/quote:/);assert.match(out,/\$literal/);assert.match(err,/TEST_STDERR/);
  assert.equal(fs.existsSync(isolated.CPJW_STATE_DIR),false);
});
test('hook preserves script text and creates no state directory',async()=>{
  const plan=prepare(request,env);
  assert.equal(plan.args.at(-1),request.tool_input.command);
  const result=await hook(request,env);
  assert.equal(result.hookSpecificOutput.permissionDecision,'allow');
  assert.equal(result.hookSpecificOutput.additionalContext,undefined);
  assert.match(result.hookSpecificOutput.updatedInput.command,/native-process-run\.mjs/);
  assert.equal(fs.existsSync(env.CPJW_STATE_DIR),false);
});
