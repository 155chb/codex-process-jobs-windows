# Active-turn queue experiment (2026-09-27)

Job and native session identifiers omitted from the public record.
Payload: harmless PowerShell sleep, stdout marker, stderr marker, exit 7.
The first relay launch omitted its owner argument and was rejected; no notification was sent by that attempt. Corrected relay dispatch was accepted at 06:07:54 UTC while this agent turn was active. This checks delivery during an active turn, but the payload had already finished before the corrected relay launch. No interruption was observed before this record was written. Actual next-turn wake and original-session exit retrieval remain pending.

No payload output logs were created. State and relay JSON are small metadata only.

## Follow-up verified

The first native session returned 1 while metadata said 7: outer PowerShell lacked explicit exit propagation and the test stderr API was blocked by Constrained Language Mode. Fixed generated command to end with exit $LASTEXITCODE; stderr probe now uses Write-Error.

For the corrected job, Queue accepted during the active turn at 06:10:02 UTC. Notification arrived as the next turn after the agent final. Original write_stdin returned stderr, QUEUE_FIXED_END and exact exit 7. No payload-output logs were read or created. Eleven automated tests passed, including actual outer PowerShell quoting and exact exit propagation.

## Actual native Hook CLI integration: failed, corrected but not rerun

Run native-hook-cli-1790489541347644000 ended with CLI exit 0 and harness exit 1. Both Hook watchers started, but no job.json appeared: raw original commands executed. Allowed write succeeded; outside write denied (PermissionError errno 13), sandbox identity codexsandboxoffline retained. No completion delivery was attempted because real queue was disabled.

Cause: native-hook returned updatedInput without permissionDecision=allow. Official PreToolUse wire format requires both (https://learn.chatgpt.com/docs/hooks). Added the missing rewrite decision; the generic hook unit/native execution tests pass. This is separate from PermissionRequest approval. Actual corrected Hook CLI invocation has NOT been rerun; the prior one-invocation trust bypass authorization was consumed. No production readiness claim.

## Corrected actual Hook integration passed

Isolated run native-hook-cli-1790489892814467900: CLI and harness both exited 0. Two ordinary Bash/PowerShell calls were actually rewritten and executed by native-run. Short job watcher finished skipped-foreground. Long job automatically created its background receipt, relay and watcher; relay finished unavailable because real queue was deliberately disabled in this test. Both jobs returned 0. Native tool output contained the permission report; payload outputFilesCreated=false and job directories contained JSON metadata/lock files only.

Sandbox identity remained codexsandboxoffline; cwd and marker preserved, allowed write succeeded, outside write denied errno 13. No manual start-relay tool call was needed. No global config, installation or persistent Hook trust was changed. Desktop queue/wake was proven separately by the active-turn exit-7 experiment. Installed desktop Hook coverage remains untested; this is an experimental CLI integration result, not universal tool interception.
