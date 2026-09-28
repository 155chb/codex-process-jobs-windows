import importlib.util
from pathlib import Path
import unittest
import json

spec = importlib.util.spec_from_file_location("probe_hook", Path(__file__).with_name("rewrite-probe-hook.py"))
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)


class HookProbeTests(unittest.TestCase):
    def test_only_exact_selected_command_is_rewritten(self):
        env = {"CPJW_PROBE_ORIGINAL": "approved probe", "CPJW_PROBE_ARGV": json.dumps(["python.exe", "probe.py"]),
            "CPJW_PROBE_NODE": "node.exe"}
        self.assertEqual(hook.rewrite({"hook_event_name": "PreToolUse", "tool_input": {"command": "other"}}, env), {})
        self.assertEqual(hook.rewrite({"hook_event_name": "PostToolUse", "tool_input": {"command": "approved probe"}}, env), {})
        result = hook.rewrite({"hook_event_name": "PreToolUse", "tool_input": {"command": "approved probe"}}, env)
        self.assertEqual(result["hookSpecificOutput"]["permissionDecision"], "allow")
        self.assertIn("auto-run.mjs", result["hookSpecificOutput"]["updatedInput"]["command"])
        self.assertNotIn("require_escalated", json.dumps(result))

    def test_powershell_literal_quote(self):
        self.assertEqual(hook.quote("a'b$`"), "'a''b$`'")


if __name__ == "__main__":
    unittest.main()
