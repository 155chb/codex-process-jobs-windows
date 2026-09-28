# IPC lifecycle collision, 2026-09-27

Evidence from the current conversation's local rollout and Desktop log (UTC):

| Time | Observed event |
| --- | --- |
| 09:05:29.537 | Original turn completed. |
| 09:05:29.663 | A new turn started. |
| 09:05:30.583 | Visible Queue completion entered that turn. |
| 09:05:34.982 | Desktop accepted the IPC `turn/start` request. Probe returned the same turn ID. |
| 09:05:37.271 | `cpjw_completion_probe` function output entered that existing turn. |
| 09:05:42.343 | That turn completed normally. |
| 09:12:29.895 | After app restart, resume log reported latestTurnStatus=completed and markedStreaming=true. |

The user observed a stuck thinking indicator and could neither send nor interrupt.
The native probe exited zero. This was not proof of an independent IPC wake:
Queue had already started the turn. Its UserPromptSubmit Hook cannot be attributed
to IPC. The prior lifecycle pass claim is withdrawn.

The backend completed; the failure appears in Desktop's displayed/interactive
turn state. Concurrent submission is the leading suspect, not a confirmed cause.
ResizeObserver errors were also present, but their causal role is unknown.
The resume streaming flag alone does not prove the underlying frontend cause.

The lifecycle probe now cancels before submission unless its latest observed
event is Stop. This prevents the observed Stop -> UserPromptSubmit -> IPC case.
It does not eliminate the race between checking and sending, and is not a
production-ready fix. No automatic retries or Queue fallback are added.

Before integration, isolate Queue from IPC and verify both backend completion
and usable Desktop input after the invisible wake. Busy-turn IPC submission
remains unvalidated and must not be advertised as working.
