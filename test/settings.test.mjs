import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {configuredEnvironment} from '../scripts/hook-entry.mjs';
test('private settings enable hook without global environment changes; explicit disable wins',()=>{
  const dir=path.resolve('.test-state',randomUUID());fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'settings.json');
  assert.equal(configuredEnvironment({CPJW_CONFIG_FILE:file}).CPJW_ENABLE_NATIVE_HOOK,'0');
  fs.writeFileSync(file,JSON.stringify({enabled:true,powershellPath:'test-shell',codexBin:'test-codex',notifyAfterMs:2000}));
  const env=configuredEnvironment({CPJW_CONFIG_FILE:file});
  assert.equal(env.CPJW_ENABLE_NATIVE_HOOK,'1');assert.equal(env.CPJW_POWERSHELL,'test-shell');
  assert.equal(env.CODEX_PROCESS_JOBS_CODEX_BIN,'test-codex');
  assert.equal(configuredEnvironment({CPJW_CONFIG_FILE:file,CPJW_ENABLE_NATIVE_HOOK:'0'}).CPJW_ENABLE_NATIVE_HOOK,'0');
});
