"""One-off CLI hook canary; requires the user's explicit one-run trust authorization.

No global config writes or persistent hook-trust changes. Read-only probe target
outside the test workspace must remain denied. Only locally reviewed hook runs.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--codex", required=True)
parser.add_argument("--node", required=True)
parser.add_argument("--approved-one-run-hook", action="store_true")
args = parser.parse_args()
if not args.approved_one_run_hook:
    parser.error("Explicit user authorization for this one-off reviewed hook is required.")
base = Path(__file__).resolve().parents[1]
state = base / ".test-state" / ("hook-canary-" + str(time.time_ns()))
state.mkdir(parents=True)
allowed = state / "allowed.txt"
outside = base.parent.parent.parent / ("cpjw-denied-hook-" + state.name + ".txt")
payload = [sys.executable, str(base / "test" / "permission-probe.py"), str(allowed), str(outside), "5"]
quote = lambda s: "'" + str(s).replace("'", "''") + "'"
original = "& " + " ".join(quote(s) for s in payload)
env = dict(os.environ, CPJW_STATE_DIR=str(state), CPJW_PROBE_ENV="hook-environment-preserved",
    CPJW_PROBE_ORIGINAL=original, CPJW_PROBE_ARGV=json.dumps(payload), CPJW_PROBE_NODE=args.node)
hook_command = "& " + quote(sys.executable) + " " + quote(base / "test" / "rewrite-probe-hook.py")
group = '[{matcher="Bash",hooks=[{type="command",command=' + json.dumps(hook_command) + ',timeout=10}]}]'
prompt = "Run exactly this harmless command once, with no other tools. Do not poll or retry. " \
    "After its result, end your turn: " + original
cmd = [args.codex, "--dangerously-bypass-hook-trust", "-c", "features.hooks=true", "-c",
    "hooks.PreToolUse=" + group, "exec", "--ephemeral", "--skip-git-repo-check", "--sandbox",
    "workspace-write", "--json", "-C", str(state), prompt]
print(json.dumps({"test_state": str(state), "scope": "isolated CLI; not current desktop hook"}), flush=True)
with (state / "events.jsonl").open("w", encoding="utf-8") as out, \
        (state / "stderr.log").open("w", encoding="utf-8") as err:
    completed = subprocess.run(cmd, env=env, cwd=state, stdout=out, stderr=err, timeout=180)
# This bounded local test wait is not an agent polling loop.
deadline = time.time() + 15
jobs = []
while time.time() < deadline:
    jobs = list(state.glob("job-*/job.json"))
    if jobs and json.loads(jobs[0].read_text(encoding="utf-8")).get("completedAt"):
        break
    time.sleep(0.1)
job = json.loads(jobs[0].read_text(encoding="utf-8")) if jobs else None
result = {"cli_exit": completed.returncode, "rewrite_observed": (state / "hook-rewrite.json").exists(),
    "job": job, "outside_file_exists": outside.exists(), "state": str(state)}
if job:
    log = state / job["id"] / "stdout.log"
    try:
        result["permission_probe"] = json.loads(log.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        result["permission_probe"] = None
(state / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2), flush=True)
probe = result.get("permission_probe") or {}
ok = completed.returncode == 0 and result["rewrite_observed"] and job and job.get("exitCode") == 0 \
    and probe.get("allowed_write", {}).get("succeeded") is True \
    and probe.get("outside_write", {}).get("succeeded") is False
sys.exit(0 if ok else 1)
