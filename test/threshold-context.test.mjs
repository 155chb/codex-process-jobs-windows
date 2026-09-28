import test from 'node:test';
import assert from 'node:assert/strict';
import {thresholdHook,contextFor} from '../scripts/threshold-context.mjs';
const request={hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:'exec-11111111-1111-1111-1111-111111111111',tool_input:{command:'Write-Output "payload"'}};
const env={CPJW_CONFIG_FILE:'does-not-exist.json',CPJW_ENABLE_NATIVE_HOOK:'1'};
test('no model context for a command completed before threshold',async()=>{assert.deepEqual(await thresholdHook(request,env,async()=>({state:'completed'})),{});});
test('context only after actual running-threshold observation',async()=>{let released=false;const promise=thresholdHook(request,env,async()=>{await new Promise(r=>setTimeout(r,30));released=true;return {state:'long-running',id:'job-22222222-2222-2222-2222-222222222222'};});assert.equal(released,false);const result=await promise;assert.match(result.hookSpecificOutput.additionalContext,/Do not poll, sleep, or wait/);assert.match(result.hookSpecificOutput.additionalContext,/existing cell once with functions.wait/);assert.equal(result.hookSpecificOutput.permissionDecision,undefined);assert.equal(result.hookSpecificOutput.updatedInput,undefined);});
test('invalid or unobserved tasks produce no guidance',()=>{assert.deepEqual(contextFor(request,{state:'not-observed'}),{});assert.deepEqual(contextFor(request,{state:'long-running',id:'bad'}),{});});
test('disabled hook does not observe or inject context',async()=>{assert.deepEqual(await thresholdHook(request,{...env,CPJW_ENABLE_NATIVE_HOOK:'0'},()=>{throw Error('unexpected observation')}),{});});
