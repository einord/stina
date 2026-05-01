# 03 — Memory System

> Status: **Stub**. Schemas live in [§02](./02-data-model.md). This section will define behavior, lifecycle, and the recall semantics in depth.

## Intent

Stina needs a unified memory that crosses thread boundaries without dragging full chat history into every context. Memory comes in three types with different lifecycles and access patterns:

- **Standing instructions** — actively applied, loaded at thread start
- **Profile facts** — passively retrieved on demand
- **Thread summaries** — searchable index of past conversations

Domain data (mail, people, work) stays in extensions. Memory is for conversational facts and standing instructions only — anything an extension owns, recall queries the extension instead of duplicating.

## Design

_To be written._

Topics to cover:

- Lifecycle of each memory type (creation, update, decay, deletion)
- Who creates memories: user explicit, Stina extracted, automatic from conversation
- Confirmation flow when Stina extracts a memory ("I noticed you said X — should I remember that?")
- Conflict resolution (memory says X, extension says Y, user just said Z)
- Recall ranking and merging across sources
- Token budget at thread start (active standing instructions + matching profile facts)

## Implementation checklist

_Filled in as design solidifies._

## Open questions

- **Extraction strategy**: Stina extracts memories actively (per conversation) vs. only during dream pass. Active is more responsive but more expensive.
- **User confirmation cadence**: confirm every extracted memory, batch confirmations in recap, or trust Stina silently with audit log?
- **Memory editing UI**: where does the user go to view/edit/delete memories directly? Settings page? Per-thread sidebar?
- **People extension overlap**: the People extension stores person facts. Are profile facts about people forbidden in Stina's memory, or do we allow shadow facts that defer to People when present?
- **Memory provenance**: every memory should know which thread/message it came from. Required for "why do you think this?"
- **Embeddings vs. keyword search for recall**: local embeddings keep us local-first but add a model dependency. Keyword search is simpler but worse for paraphrased queries.
