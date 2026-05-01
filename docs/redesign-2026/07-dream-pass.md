# 07 — Dream Pass

> Status: **Stub**.

## Intent

Periodically, when the system is idle, Stina runs a "dream pass" to consolidate memories, summarize quiet threads, and prune expired data. This avoids the question of "when is a thread done?" — threads simply go quiet and get processed asynchronously.

Hard rules for the dream pass:

- **Never fabricate new facts.** Only consolidate, summarize, prune.
- **Never overwrite user-set memories.** Profile facts the user explicitly stated are immutable to dream pass.
- **Always log changes.** The user can see exactly what changed each night, with undo.
- **Never run on top of active work.** Idle trigger only.

## Design

_To be written._

Topics to cover:

- Trigger conditions (idle time threshold, time-of-day window, or both)
- Tasks the dream pass performs:
  - Summarize threads that just transitioned to `quiet`
  - Expire standing instructions past `valid_until`
  - Check standing instructions against signals (e.g. "user has been active during expected vacation — flag for review")
  - Detect contradictions between memories
  - Decay confidence on stale profile facts (if we adopt decay)
  - Generate insights to surface in the recap
- Dream pass output: morning recap content, activity log entries, optional re-opened threads
- Safety: dry-run mode, max changes per pass, user-visible diff
- "Waking" a thread from dream pass insight: surface in recap, not as a notification

## Implementation checklist

_Filled in as design solidifies._

## Open questions

- **Trigger model**: pure idle-based, fixed nightly window, or hybrid?
- **Cost**: dream pass uses a model. Local model only, or allow user-configured provider?
- **Undo granularity**: per-change undo or per-pass rollback?
- **Failure mode**: what if dream pass crashes halfway through? Transaction or per-task atomicity?
- **Cap on change volume**: refuse to run if a single pass would alter > N memories?
