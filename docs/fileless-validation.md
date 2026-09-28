# Fileless validation (2026-09-27)

Default desktop read-only sandbox rejected writes to .cpjw-state (EPERM). A plugin-owned temporary named pipe was authorized for a fixed-string test, but the sandbox client connection also returned EPERM. No private Codex IPC or second App Server was used.

Host process observation succeeded without payload writes or communication: the host read the sandbox process command line, retained its process handle, waited for exit and read exit 7.

Failed attempts are not claimed as successes: one needed manual notification and another received none. PowerShell spawned with detached=true returned 0 without running even a simple output/exit command. Normal PowerShell executed correctly. A retained diagnostic parent completed observation and queue delivery successfully.

Final architecture: detach a Node notification process; that process retains a normal, hidden PowerShell observer. This preserves independent lifetime without launching PowerShell as DETACHED_PROCESS. Payload wrapper remains attached to its native session and creates no state or output files.

In the successful independent job, the hook preparation command returned before payload completion. An automatic completion message arrived after the agent final, with no manual relay or notification. Original write_stdin returned FILELESS_HOST_STDERR, FILELESS_HOST_END and exact exit 7. Source-level host Hook preparation was invoked explicitly for this experiment; installed version's ordinary-command interception must be validated separately after upgrade/trust.

14 automated tests and syntax checks passed. One regression denies filesystem mutation APIs during wrapper execution and verifies native stdout/stderr plus real exit 7; another verifies executable launch failure returns 1. Old file-state tests remain historical regression coverage, not the current production route.
