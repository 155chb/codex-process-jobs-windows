# Desktop 0.3.0 verification handoff

Read README.md and docs/fileless-validation.md. User requested plugin notification without payload file-write permission. Source 0.3.0 now uses a fileless payload wrapper plus an independent Node host that retains a normal PowerShell process observer. No job.json, stdout.log, pipe connection or task state files in this route.

Source-level live read-only test automatically woke this thread and original write_stdin returned exit 7 with stderr. 14 automated tests pass. Installed desktop ordinary-command interception is still the final gate. User must manually trust any changed Hook; never write trust records or use a trust bypass without new specific authorization.

Use normal native exec with one short harmless command, then a 25-second noninteractive output/sleep/exit-7 command. Do not manually invoke native-process-run, process-watch, the observer host or process-notify. The installed Hook must do all preparation. Inspect printed job ID and original native session ID, end turn without polling, and match automatic completion to this job. After wake, original write_stdin must supply actual output/exit 7. Do not compensate by manually notifying or rerunning the payload.

No payload permission grants for notification, no developer-board access, no second App Server or private desktop IPC. Configuration remains on host. If interception or queue fails, report actual scope without declaring readiness. Original session buffering/eviction applies; there is no output backup. Only authorized noninteractive PowerShell commands, with ordinary sandbox restrictions, are supported.
