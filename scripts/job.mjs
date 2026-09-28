// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { root, directory, read, save, list, tail, ownerRollout } from './state.mjs';
import { execution, resolveCodex } from './execution.mjs';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const action = argv.shift();
  if (action === 'start') {
    if (process.platform !== 'win32') throw new Error('This implementation requires native Windows.');
    const sep = argv.indexOf('--');
    if (sep < 0) throw new Error('Usage: start [--name NAME] [--shell] [--no-notify] -- executable args...');
    const opts = argv.slice(0, sep), command = argv.slice(sep + 1);
    let name = 'background job', cwd = process.cwd(), threadId = env.CODEX_THREAD_ID, notify = true, shell = false, codex;
    for (let i = 0; i < opts.length; i++) {
      const key = opts[i];
      if (key === '--no-notify') notify = false;
      else if (key === '--shell') shell = true;
      else if (['--name', '--cwd', '--thread', '--codex'].includes(key)) {
        const value = opts[++i];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
        if (key === '--name') name = value;
        if (key === '--cwd') cwd = path.resolve(value);
        if (key === '--thread') threadId = value;
        if (key === '--codex') codex = value;
      } else throw new Error(`Unknown option: ${key}`);
    }
    if (!fs.statSync(cwd).isDirectory()) throw new Error('Invalid working directory.');
    const descriptor = execution(command, shell, env);
    const rollout = notify ? ownerRollout(threadId, env) : null;
    if (notify && !rollout) throw new Error('Owner rollout not found; no command started. Use --no-notify for execution only.');
    const job = { schemaVersion: 1, id: `job-${randomUUID()}`, name, cwd, execution: descriptor,
      threadId: threadId ?? null, rollout, createdAt: new Date().toISOString(), status: 'starting',
      exitCode: null, notification: { status: notify ? 'pending' : 'disabled' }, codex: resolveCodex(codex, env) };
    save(job, env);
    const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
    const child = spawn(process.execPath, [worker, job.id], {
      detached: true, windowsHide: true, stdio: 'ignore', cwd,
      env: { ...env, CPJW_STATE_DIR: root(env), CPJW_RELAY: '1' }, shell: false,
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    return { id: job.id, status: job.status, workerPid: child.pid, stateFile: path.join(directory(job.id, env), 'job.json') };
  }
  if (action === 'status') return argv[0] ? read(argv[0], env) : list(env).map(({ id, name, status, exitCode, notification }) => ({ id, name, status, exitCode, notification }));
  if (action === 'result') {
    const job = read(argv[0], env), dir = directory(job.id, env);
    return { job, stdout: fs.existsSync(path.join(dir, 'stdout.log')) ? tail(path.join(dir, 'stdout.log')) : '',
      stderr: fs.existsSync(path.join(dir, 'stderr.log')) ? tail(path.join(dir, 'stderr.log')) : '',
      outputIsUntrusted: true };
  }
  throw new Error('Commands: start, status [job-ID], result job-ID.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
