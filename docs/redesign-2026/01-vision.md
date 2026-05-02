# 01 — Vision

## Intent

Today Stina is a single chat thread between user and assistant. Everything — typed questions, incoming mail, calendar events, reminders — lands in the same stream. This works for short interactions, but breaks down as soon as multiple things are happening:

- The user can't focus on one topic without other topics interrupting it
- Stina has no clean way to notify about something without "speaking up" mid-conversation
- There's no separation between *what happened* (events) and *how Stina chose to respond*
- Memory is implicit in the chat history; nothing crosses thread boundaries cleanly

We want Stina to feel like a thoughtful presence that filters and organizes the user's day, not a chat window that everything flows through.

## Mental model: three actors

Every thread now has three potential speakers:

| Actor | Role | Example |
|-------|------|---------|
| **app** | Neutral, factual events from the system or extensions | "New mail from Peter, subject: Q2 plan" |
| **stina** | The agent — judges, decides, acts, sometimes stays silent | "I'll keep this in the background — doesn't look urgent." |
| **user** | The human — initiates threads, replies, gives instructions | "Reply that I'm on vacation until Friday." |

The flow is:

```
event → app speaks → stina decides → (silence | user gets notified)
```

Stina is **always the decider**. The app never speaks directly to the user; it speaks to Stina, who chooses whether to escalate. This is the core inversion compared to today's design.

For user-initiated work, the order is the obvious one: user speaks → stina responds (and may use tools).

## Why this matters

- **Silence becomes a valid action.** If Stina decides an event isn't worth interrupting the user, it logs the reason and stays quiet. Today's model has no way to express "I considered this and chose not to bother you."
- **Each thread tells a coherent story.** The trigger, Stina's reasoning, and any user interaction live together. This makes it auditable and reviewable.
- **The user controls focus.** A new mail spawns its own thread instead of polluting the conversation about the presentation.
- **Memory can be structured by intent.** Standing instructions live separately from chat history, so they apply across threads instead of getting buried.

## Core principles

1. **Inbox over stream.** Threads are first-class objects, listed and navigable. The user sees a list of things Stina is handling, not a single rolling log.
2. **Transparency over magic.** Every decision Stina makes — including silent ones — is visible somewhere. The user can always answer "why did Stina (not) do X?"
3. **Progressive autonomy.** Stina starts cautious. The user can grant standing permissions over time, scoped to specific contexts, always revocable.
4. **Deterministic safety floors.** Some tool actions can never be auto-approved no matter what (e.g. permanent deletion, unbounded mail send). The tool itself declares its severity level (see §02 `ToolSeverity`); `critical` actions can never be auto-policied.
5. **Local-first remains.** None of these changes alter Stina's local-first architecture. Memory and threads stay on the user's machine.
6. **Extensions own their domain data.** Mail, people, work — those stay in their extensions. Stina's memory layer is for *conversational facts and standing instructions*, not domain duplication.

## What this redesign is NOT

- It's not a rewrite of the extension API
- It's not a change to providers (Ollama/OpenAI/etc.)
- It's not a change to extension data schemas
- It's not (yet) a multi-user system — still single-user, local-first
- It's not addressing cost-per-event optimization (deferred; see §04)

## Implementation checklist

This section is the highest-level summary; details are in the linked sections.

- [ ] Introduce three-actor message model (`author: 'app' | 'stina' | 'user'`) — see §02
- [ ] Introduce thread as a first-class object with trigger, status, summary — see §02
- [ ] Memory layer with standing instructions, profile facts, thread summaries, recall API — see §03
- [ ] Event-triggered thread spawning from extensions — see §04
- [ ] Inbox-style UI with thread list, archive, search — see §05
- [ ] Autonomy/policy system with tool severity levels and per-context auto-permissions — see §06
- [ ] Idle dream-pass for memory consolidation and standing-instruction cleanup — see §07
- [ ] Migration path for current single-thread chat data — see §08

## Open questions

(Cross-cutting questions live in [09-open-questions.md](./09-open-questions.md). Section-local questions live in their own section.)

- How do we measure success? (User-reported reduction in interruptions? Time-to-first-action on incoming events? Number of auto-policies created? — needs decision before we ship.)
