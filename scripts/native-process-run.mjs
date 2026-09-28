// SPDX-License-Identifier: Apache-2.0
// No state files, sockets or host execution. Payload remains in its native sandbox.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function run(argv,env=process.env) {
  const sep=argv.indexOf('--');
  if(sep<0 || !argv[sep+1])throw new Error('Expected -- executable args');
  let id=`job-${randomUUID()}`,notifyAfterMs=30000;
  const options=argv.slice(0,sep);
  for(let i=0;i<options.length;i++){
    if(options[i]==='--id')id=options[++i];
    else if(options[i]==='--notify-after-ms')notifyAfterMs=Number(options[++i]);
    else if(options[i]==='--tool-use-id')i++;
    else throw new Error('Unsupported option');
  }
  if(!/^job-[0-9a-f-]{36}$/.test(id))throw new Error('Invalid job ID');
  if(!Number.isFinite(notifyAfterMs)||notifyAfterMs<0||notifyAfterMs>30000)throw new Error('Invalid notification threshold');
  const command=argv.slice(sep+1);

  const child=spawn(command[0],command.slice(1),{cwd:process.cwd(),env,shell:false,
    windowsHide:true,stdio:'inherit',detached:false});
  return await new Promise(resolve=>{
    let failed=false;
    child.once('error',error=>{failed=true;console.error(error.message);});
    child.once('close',code=>resolve(failed?1:code??1));
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
