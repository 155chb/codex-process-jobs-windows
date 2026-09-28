# Development instructions

Preserve LICENSE and NOTICE and identify all changes to copied upstream code.
Do not persist credentials or complete environment variables in job records.
Use only `codex queue`; do not add private desktop IPC or a second App Server.
An accepted queue message is not proof that the agent woke or inspected results.
Never automatically retry a notification whose acceptance is uncertain.
Do not change user AGENTS.md files, trust hooks, or publish/install automatically.
Test exit failure, bounded logs, PowerShell quoting, detached survival and queue
failure before declaring a version ready. Run tests with real notification disabled.
