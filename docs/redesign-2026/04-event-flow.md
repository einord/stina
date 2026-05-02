# 04 — Event Flow

> Status: **Stub**.

## Intent

When something happens (mail arrives, calendar reminder fires, scheduled job triggers), the flow must be:

```
event → app speaks in a new thread → stina decides → (silence | escalate to user)
```

Stina is always the decider. The user is only notified when Stina chooses to escalate. Silenced events are still logged and visible in the recap and activity log.

## Design

_To be written._

Topics to cover:

- Extension API: how an extension emits an event into Stina
- Event payload shape: facts only, optional `importance_hint` from extension, optional `category`
- Thread spawning: every event creates a thread, even if Stina decides to silence it (the silenced thread lives in archive/log)
- Stina's decision turn: prompt structure, what context she has, what tools she may call (recall, extension lookups)
- Notification channel: how "Stina has spoken" surfaces to user (matches today's notification behavior — instant when Stina speaks)
- Standing-instruction matching: how relevant instructions are loaded for the trigger context
- Cost discipline (deferred to a later phase per design discussion): two-tier triage with cheap classifier first, full Stina only for ambiguous cases

## Implementation checklist

_Filled in as design solidifies._

## Open questions

- **Event coalescing**: if 10 mails arrive in a minute, do we get 10 threads or one batched thread? Likely 10, but worth designing.
- **Throttling**: should Stina be able to defer events ("I'll batch these and look at them at noon")? Or is that always user-controlled?
- **Failure mode**: what if Stina's decision turn errors out? Default to user-visible thread or default to silence?
- **Scheduled jobs as triggers**: existing scheduled-jobs system needs to integrate with thread spawning — replace today's "send a chat message" with "open a thread".
- **Two-tier triage details**: deferred to phase 2, but the architecture must not preclude it.
- ~~**Standing instruction matching mechanism**~~ — resolved in §03 "Standing-instruction matching": Stina judges at event time (LLM), with active instructions loaded into thread-start context.
