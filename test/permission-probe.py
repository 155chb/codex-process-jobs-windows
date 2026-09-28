"""Harmless runtime permission probe. No remote hosts or development board."""
import json
import os
import pathlib
import subprocess
import sys
import time

time.sleep(float(sys.argv[3]))
report = {"pid": os.getpid(), "started_after_delay": True}
report["identity"] = subprocess.check_output(["whoami"], text=True).strip()
report["cwd"] = os.getcwd()
report["environment_marker"] = os.getenv("CPJW_PROBE_ENV")
for key, name in [("allowed_write", sys.argv[1]), ("outside_write", sys.argv[2])]:
    try:
        with open(name, "x", encoding="utf-8") as stream:
            stream.write("CPJW harmless permission probe\n")
        report[key] = {"succeeded": True}
    except OSError as error:
        report[key] = {"succeeded": False, "error": type(error).__name__, "errno": error.errno}
report["finished_at"] = time.time()
print(json.dumps(report), flush=True)
