// SPDX-License-Identifier: Apache-2.0
// Host entry point: optional private settings, no payload execution here.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {home} from './state.mjs';
import {hook} from './native-hook.mjs';

export function configuredEnvironment(env=process.env) {
  const file=env.CPJW_CONFIG_FILE || path.join(home(env),'process-jobs-windows','settings.json');
  let settings={};
  try {settings=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  if(settings.enabled!==undefined && typeof settings.enabled!=='boolean')throw new Error('Invalid enabled setting');
  return {...env,
    CPJW_ENABLE_NATIVE_HOOK:env.CPJW_ENABLE_NATIVE_HOOK ?? (settings.enabled===true?'1':'0'),
    CPJW_POWERSHELL:env.CPJW_POWERSHELL ?? settings.powershellPath,
    CPJW_NOTIFY_AFTER_MS:env.CPJW_NOTIFY_AFTER_MS ?? settings.notifyAfterMs,
    CODEX_PROCESS_JOBS_CODEX_BIN:env.CODEX_PROCESS_JOBS_CODEX_BIN ?? settings.codexBin,
  };
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let input='';for await(const part of process.stdin)input+=part;
  try {console.log(JSON.stringify(await hook(JSON.parse(input),configuredEnvironment())));}
  catch(error) {console.error(error.message);process.exitCode=2;}
}
