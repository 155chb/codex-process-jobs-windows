"""Isolated hook experiment. Rewrite ONE exact, preselected harmless probe only.

Does not execute the payload, grant permissions, install hooks or alter hook trust.
Not a production classifier; unrelated tools and commands pass through unchanged.
"""
import json
import os
import pathlib
import sys


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def rewrite(request, env):
    original = request.get("tool_input", {}).get("command")
    if request.get("hook_event_name") != "PreToolUse" or not isinstance(original, str):
        return {}
    if not env.get("CPJW_PROBE_ORIGINAL") or original != env["CPJW_PROBE_ORIGINAL"]:
        return {}
    args = json.loads(env["CPJW_PROBE_ARGV"])
    wrapper = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "auto-run.mjs"
    command = "& " + " ".join(quote(value) for value in [env["CPJW_PROBE_NODE"], wrapper,
        "--wait-ms", "200", "--", *args])
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow",
        "updatedInput": {"command": command}, "additionalContext":
        "Isolated CPJW permission test. A background receipt is not command completion. "
        "Do not poll or rerun; report the receipt and end this test turn."}}


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        response = rewrite(request, os.environ)
        if response:
            log = pathlib.Path(os.environ["CPJW_STATE_DIR"]) / "hook-rewrite.json"
            log.write_text(json.dumps({"original": request["tool_input"]["command"],
                "rewritten": response["hookSpecificOutput"]["updatedInput"]["command"],
                "cwd": request.get("cwd")}, indent=2), encoding="utf-8")
        print(json.dumps(response))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)  # Never silently run the original command on malformed probe configuration.
