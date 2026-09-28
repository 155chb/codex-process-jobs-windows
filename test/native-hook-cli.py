"""One approved, isolated run of the actual native Hook; no persistent trust."""
import json, os, shutil, subprocess, sys, time
from pathlib import Path
if '--approved-one-run-hook' not in sys.argv:
    raise SystemExit('Explicit one-run Hook authorization required')
base = Path(__file__).resolve().parents[1]
state = base / '.test-state' / ('native-hook-cli-' + str(time.time_ns()))
state.mkdir(parents=True)
node = os.environ.get('CPJW_TEST_NODE') or shutil.which('node')
codex = os.environ.get('CPJW_TEST_CODEX') or shutil.which('codex')
shell = os.environ.get('CPJW_TEST_POWERSHELL') or shutil.which('pwsh') or shutil.which('powershell')
if not all((node, codex, shell)):
    raise SystemExit('Set CPJW_TEST_NODE, CPJW_TEST_CODEX and CPJW_TEST_POWERSHELL to available executables')
q = lambda s: "'" + str(s).replace("'", "''") + "'"
allowed = state / 'allowed.txt'
outside = base.parent.parent.parent / (state.name + '-denied.txt')
short = '& ' + q(node) + ' --version'
long = '& ' + ' '.join(q(s) for s in [sys.executable, base/'test/permission-probe.py',allowed,outside,'4']) + '; exit $LASTEXITCODE'
env = dict(os.environ, CPJW_ENABLE_NATIVE_HOOK='1', CPJW_POWERSHELL=shell,
    CPJW_STATE_DIR=str(state), CPJW_NOTIFY_AFTER_MS='2000', CPJW_PROBE_ENV='native-hook-test',
    CODEX_PROCESS_JOBS_DISABLE_CODEX_QUEUE='1', CPJW_COMPLETION_TIMEOUT_MS='30000')
env.pop('CODEX_THREAD_ID',None)
env.pop('CPJW_TEST_DISABLE_WATCH',None)
hook = '& '+q(node)+' '+q(base/'scripts/native-hook.mjs')
group='[{matcher="Bash",hooks=[{type="command",command='+json.dumps(hook)+',timeout=10}]}]'
prompt='Run these two harmless commands exactly once each, with no other commands. Do not poll or retry. End after the two results. First:\n'+short+'\nSecond:\n'+long
cmd=[codex,'--dangerously-bypass-hook-trust','-c','features.hooks=true','-c','hooks.PreToolUse='+group,
     'exec','--ephemeral','--skip-git-repo-check','--sandbox','workspace-write','--json','-C',str(state),prompt]
print(json.dumps({'test_state':str(state),'real_queue':'disabled','persistent_trust':'unchanged'}),flush=True)
with (state/'events.jsonl').open('w',encoding='utf-8') as out, (state/'cli-stderr.txt').open('w',encoding='utf-8') as err:
    run=subprocess.run(cmd,cwd=state,env=env,stdout=out,stderr=err,timeout=180)
# Bounded local wait for the plugin's finite watcher, not Agent polling.
end=time.monotonic()+8
while time.monotonic()<end:
    dirs=list(state.glob('job-*'))
    if len(dirs)==2 and all((d/'watch.json').exists() and json.loads((d/'watch.json').read_text()).get('finishedAt') for d in dirs): break
    time.sleep(.1)
items=[json.loads(s) for s in (state/'events.jsonl').read_text(encoding='utf-8').splitlines()]
outputs=[e['item'].get('aggregated_output','') for e in items if e.get('type')=='item.completed' and e.get('item',{}).get('type')=='command_execution']
probe=None
for output in outputs:
    for line in output.splitlines():
        if line.startswith('{'):
            try:
                value=json.loads(line)
                if 'allowed_write' in value: probe=value
            except ValueError: pass
jobs=[]
for d in state.glob('job-*'):
    jobs.append({'files':sorted(p.name for p in d.iterdir()),'job':json.loads((d/'job.json').read_text()) if (d/'job.json').exists() else None,
                 'watch':json.loads((d/'watch.json').read_text()) if (d/'watch.json').exists() else None})
statuses=[j.get('watch',{}).get('status') for j in jobs]
ok=run.returncode==0 and len(jobs)==2 and sorted(statuses)==['skipped-foreground','unavailable'] and probe is not None and probe['allowed_write']['succeeded'] and not probe['outside_write']['succeeded'] and not outside.exists() and all(j['job']['exitCode']==0 for j in jobs)
result={'passed':ok,'cli_exit':run.returncode,'probe':probe,'jobs':jobs,'state':str(state),'scope':'actual CLI Hook; real queue disabled; desktop installed Hook not tested'}
(state/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2),flush=True)
sys.exit(0 if ok else 1)
