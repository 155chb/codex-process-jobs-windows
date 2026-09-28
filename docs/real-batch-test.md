# Real lifecycle batch experiment

Test-only lifecycle bridges connect to a per-thread plugin-owned pipe, with a
bounded timeout, and otherwise return `{}`. No task state or output files are
written. The experiment runner starts six fixed harmless Node processes (8, 10,
12, 55, 58, 61 seconds); exit codes alternate 0 and 7. All output remains in the
original native session. This is real child-exit observation, not timer completion
simulation, but it is not yet production observation of arbitrary existing tasks.

The installed Hook must include UserPromptSubmit and Stop bridges and the user
must explicitly review/trust the changed definitions. Do not silently install or
trust it. Before starting a test, confirm lifecycle hook availability.

Start the runner, then do short commands long enough for the first three tasks to
exit. Finish the agent turn. Its Stop sends one doorbell using `codex queue`.
The matching UserPromptSubmit retrieves all pending results into developer context.
Perform another finite stretch of short work until the remaining tasks finish,
then end the turn. The next Stop should produce a second combined wake. Preserve
the native session ID; after the final Stop the runner exits with the final result.

Uncertain notification acceptance is never retried. A 180-second safety deadline
cleans up this experiment's processes and endpoint. No commands are accepted over
the pipe. Lifecycle identity and prompt marker are the only inputs. Production
authentication, restart recovery and Interrupt handling remain outside this test.
