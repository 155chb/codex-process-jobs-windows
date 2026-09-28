# Shared monitor protocol draft

This is an isolated prototype, not the installed Hook. It never executes supplied
commands or sends real Codex notifications. Runtime state is memory only.

## Lifecycle and messages

One plugin-owned host endpoint accepts bounded newline-delimited JSON. Production
must restrict the endpoint to the current Windows user, validate its protocol
version and plugin identity, and cap connections and jobs.

1. Hook connects and sends HELLO. READY identifies the instance and accepting state.
2. SUBMIT carries a unique job ID, owning thread, wrapper identity and threshold;
   never a command, credentials, environment dump or payload output.
3. Monitor validates, records the job, then sends ACCEPTED. Duplicate IDs in that
   instance return the same acknowledgement without starting another wait.
4. Monitor retains the process handle and registers an independent exit wait.
   Completion sends one `codex queue` attempt. Uncertain queue acceptance is never
   retried. Original output remains in the native Codex session.
5. When idle, monitor atomically changes ACCEPTING -> DRAINING. New jobs receive
   RETRY; existing IDs can still be acknowledged. It then closes and exits.

The prototype uses timers instead of process waits and explicit DRAIN/STOP so race
tests are deterministic. It does not yet implement production idle expiry,
authentication, process observation, notification, or Hook integration.

## Failure rules

- Failure before SUBMIT: reconnect or start a monitor, with a bounded deadline.
- Missing ACK after SUBMIT: retry the same ID at the same instance. Deduplication
  makes this safe while that instance remains alive.
- An unresponsive live instance: timeout; never wait forever or kill it implicitly.
- Instance exits after an uncertain submission: do not silently resend to a new
  instance. In-memory deduplication cannot prove whether the old instance already
  notified. Report notification unavailable; the native command remains usable.
- Concurrent creation: a common named endpoint has one successful listener;
  others reconnect to that listener. Alternatively, separate endpoints can each
  own disjoint jobs. Do not submit the same uncertain job to multiple instances.

Allowing several monitors is feasible, but does not remove the need to define
ownership and uncertain-delivery handling. Exactly-once delivery across crashes
cannot be promised without durable/shared deduplication or destination support.
