# 03 — Memory System

> Status: **Draft**. Schemas live in [§02](./02-data-model.md). This section defines behavior, lifecycle, recall semantics, and the system-prompt design that drives memory extraction.

## Intent

Stina needs a unified memory that crosses thread boundaries without dragging full chat history into every context. Memory comes in three types with different lifecycles and access patterns:

- **Standing instructions** — actively applied, loaded at thread start
- **Profile facts** — passively retrieved on demand
- **Thread summaries** — searchable index of past conversations

Domain data (mail, people, work) stays in extensions. Memory is for conversational facts and standing instructions only — anything an extension owns, recall queries the extension instead of duplicating (see §02 "Profile facts vs. extension-owned data").

## Design

### Memory types — technical and user-facing names

The codebase uses precise technical names. The UI and Stina's own speech use friendlier terms so the user has a clear mental model without learning the data model.

| Technical (§02) | User-facing label (en) | User-facing label (sv) | When it's used |
|-----------------|------------------------|-----------------------|----------------|
| `StandingInstruction` | "important memory" | "viktigt minne" | Rules and instructions Stina actively applies |
| `ProfileFact` | "fact memory" | "faktaminne" | Stable facts retrieved on demand (preferences, relationships, etc.) |
| `ThreadSummary` | (not surfaced as a "memory") | (samma) | Internal — used by recall to find past threads |

Stina is taught the user-facing labels through the system prompt and uses them consistently in inline status messages, recap, and any user-directed text. The technical names appear only in schema, code, and developer docs.

Per-locale UI labels are §05's responsibility. The labels above are working defaults that the locale layer can override.

### Extraction model: Stina decides, prompt-guided

Stina extracts memories autonomously, in the moment, guided by a focused section of her system prompt. There is no rule-based extractor and no batch-only path; memory creation happens during the same turn as the conversation that produced it.

This matches the model used by Claude Code, ChatGPT memory, and similar systems — and the same caveat applies: **the system prompt is the design surface**. Quality of extraction is a function of how clearly the prompt defines what's worth remembering. See "Memory-extraction prompt design" below.

The dream pass (§07) does *not* extract new memories from raw chat history. It consolidates, summarizes, prunes, and flags — but never invents. This boundary keeps the user's mental model simple: "Stina decides what to remember while we're talking, and tidies up at night."

### Status messages: inline via the activity log

Every memory creation, edit, or deletion produces an `ActivityLogEntry` of `kind: 'memory_change'` (see §02). Entries with a `thread_id` render **inline in that thread** at their `created_at` position, with the same severity-driven visual emphasis as tool calls. There is no separate message type for memory actions.

User-visible example (rendered inline as a `medium`-severity activity row):

> **Stina** · saved to important memory · *Reply to incoming work mail saying I'm on vacation until 2026-05-05*  · [Undo] [Edit]

The inline row is collapsible; the full structured detail is available in the activity log inspector (settings) and in the recap.

**One source of truth, two surfaces.** The same `ActivityLogEntry` is rendered inline in the thread *and* surfaced in recap and settings. We do not duplicate state across `Message` and `ActivityLogEntry`.

### Confirmation pattern

The friction model differs by memory type, because their *effects* differ.

#### Profile facts — no confirmation

Stina notes a fact, surfaces the inline status, and moves on. The user can edit or delete via the inline action or in settings. Profile facts are passive (retrieved on demand) so a wrong fact has limited blast radius.

#### Standing instructions — lightweight inline confirmation

Stina commits to changing her own future behavior. The inline status row carries an interactive widget — `[OK] [Undo] [Edit]` — that defaults to `OK` after a short timeout (default 30 seconds; user-configurable). The user can:

- **Click `OK` (or do nothing)** — instruction is committed
- **Click `Undo`** — instruction is removed; an `ActivityLogEntry` of `kind: 'memory_change'` records the reversal
- **Click `Edit`** — opens an inline editor for the rule text and scope

The timeout-defaults-to-OK pattern is deliberate: it gives the user a real chance to intervene without blocking Stina's flow, and matches the "transparency without friction" principle from §01. Standing instructions remain tentative during the timeout window; if Stina needs to *act on* the instruction during that window, she explicitly confirms before acting.

#### Memory edits and deletions — same pattern, no confirmation

Inline status for the change, undoable via activity log. Edits and deletions are also memory_change entries, with the previous and new content in `details` for audit and undo.

### Standing-instruction matching: Stina judges at event time

When an event arrives in a new thread, Stina is given the active standing instructions as part of her thread-start context (see "Token budget at thread start" below) and decides which apply to this specific event. There is no structural match algorithm in v1.

This matches the rest of the design — Stina's judgment is the runtime, prompted to reason explicitly. It is also the most flexible option: instructions like *"reply that I'm on vacation, but if it's a customer escalation, escalate to me"* are within reach without any structural schema.

The cost: every event-triggered turn pays for the active standing instructions in the model context. This is bounded by the active standing-instruction count (typically small) and is the deliberate price for behavioral expressiveness. Two-tier triage (cheap classifier first, full Stina only for ambiguous cases) is deferred per §04 — when we revisit it, the classifier can do a structural pre-filter on `InstructionScope.channels` to reduce candidate instructions before LLM judgment.

This resolves §02's "scope-matching mechanism" open question for standing instructions. `InstructionScope.match` becomes optional structured hints that Stina may consult, not a binding match algorithm.

### Conflict resolution

Two kinds of conflicts.

**Memory ↔ memory.** Two profile facts say different things about the same subject/predicate. Resolution: the more recent `last_referenced_at` wins for live use; the dream pass surfaces the contradiction in recap so the user can resolve.

**Memory ↔ extension.** A profile fact says X; an extension reports Y. Resolution: extension wins (per §02 "Profile facts vs. extension-owned data"). Stina may surface the discrepancy in recap so the user can decide whether to retire the profile fact.

**Memory ↔ user.** The user says something that contradicts a stored memory. Resolution: user wins immediately. Stina updates the memory in the same turn and produces a `memory_change` activity log entry showing the diff.

### Recall behavior

`recall` semantics (interface in §02) in summary:

- Stina decides when to call recall. There is no automatic memory injection beyond the thread-start load (next subsection).
- `recall` queries memory and registered extension recall providers in parallel, merges results by score.
- For paraphrased queries, recall benefits from semantic search; v1 ships with keyword search and treats embedding-backed search as a future improvement (see Open questions).
- User-facing search (the inbox-style search in §05) may share the recall implementation or be a separate index — open question in §05.

### Token budget at thread start

When a thread starts (for any trigger kind), Stina's initial context includes:

1. **All active standing instructions** (those with `valid_from <= now <= (valid_until ?? ∞)` and not invalidated). Typically a handful; budgeted at < 2K tokens in normal operation.
2. **Profile facts directly matching trigger entities** (e.g. for a mail event, facts whose `subject` references the mail's sender or other linked entities). Bounded by entity count; typically a handful.
3. **Trigger payload** itself (`AppContent` for app-triggered threads, user input for user-triggered).

Nothing else is auto-loaded. Thread summaries, non-matching profile facts, raw history of other threads — all require an explicit `recall` call. This is the token-discipline + transparency contract from §02.

If active standing instructions ever exceed the budget (rare, but possible if a user accumulates many), the dream pass is responsible for flagging this in recap and proposing consolidations. The runtime does not silently drop instructions.

### Memory inspection and editing UI (overview)

Detailed UI design lives in §05. The contract from §03 is:

- The user can browse all memories in a settings/activity surface, grouped by type (important memories, fact memories).
- Every memory shows its provenance: source thread (clickable), creation timestamp, who created it (user-explicit vs. Stina-extracted).
- Edit and delete are direct operations producing `memory_change` activity log entries (audit + undo).
- Inline status rows in threads expose the same edit/undo affordances for newly-created memories.

### Memory-extraction prompt design

Because Stina's judgment *is* the extraction mechanism, the relevant section of her system prompt is part of this spec. Working draft:

> **Memory.** You may save memories during a conversation when something is worth remembering across future threads.
>
> Save an **important memory** (StandingInstruction) when the user gives you a rule or instruction that should change your future behavior — e.g. *"during my vacation, reply to work mail that I'm away until Friday"*, *"don't surface newsletter mails to me"*, *"my morning recap should arrive at 06:30"*. Capture: the rule, when it starts, when it ends (if known), and what should invalidate it. Do NOT save short-term tactical instructions ("send this one mail") as important memories.
>
> Save a **fact memory** (ProfileFact) when the user reveals a stable fact about themselves, their relationships, or their preferences that you'd want to recall in unrelated future conversations — e.g. *"my manager is Peter"*, *"I prefer concise answers"*, *"my flight to Berlin is on Friday"*. Do NOT save facts that an installed extension already owns (people in the People extension, mails in the Mail extension, etc.) — note them via that extension instead, or skip saving entirely if the extension already has them.
>
> Do NOT save: idle conversation, things the user is asking *you* about (those are queries, not facts), opinions you formed about the user, or anything you would not want the user to read in their settings.
>
> When you save, the user sees an inline confirmation in the thread. For important memories, the user has a brief window to undo or edit before the rule takes effect. For fact memories, you may save without confirmation; the user can edit later.

This prompt section is **versioned** as part of the spec. Changes to it are intentional design decisions, not implementation incidents.

## Implementation checklist

- [ ] System prompt section "Memory" included in Stina's base system prompt for all threads
- [ ] User-facing labels for `StandingInstruction` and `ProfileFact` available to the locale layer
- [ ] Inline rendering of `memory_change` activity log entries in their source thread (re-uses the activity-log inline rendering from §02)
- [ ] Lightweight confirmation widget for `StandingInstruction` creation: `[OK] [Undo] [Edit]` with timeout-defaults-to-OK (default 30s; configurable)
- [ ] Stina re-confirms a tentative standing instruction before acting on it during the timeout window
- [ ] `ProfileFact` creation has no confirmation widget but produces the same inline activity log entry
- [ ] Memory edits and deletes produce `memory_change` activity log entries with previous/new content in `details`
- [ ] Standing-instruction matching at thread start is performed by Stina's judgment (LLM call), not by a structural matcher in v1
- [ ] Thread-start context loader: active standing instructions + profile facts matching trigger entities + trigger payload; nothing else auto-loaded
- [ ] Active-standing-instruction count is bounded; oversize triggers a dream-pass flag in recap (§07)
- [ ] Conflict-resolution rules implemented: memory↔memory by `last_referenced_at`; memory↔extension by extension; memory↔user by user immediately
- [ ] Recall provider registration in extension API, with parallel query + score-merged results (see §02 RecallAPI)
- [ ] Settings/activity surface for browsing memories by type, with provenance, edit, and delete (UI in §05)

## Open questions

- **Embeddings vs. keyword search for recall**: v1 ships with keyword search. When do we add local embeddings? Triggered by user complaint, by query-quality benchmarks, or scheduled? Adds a model dependency and storage overhead.
- **Memory-extraction prompt iteration loop**: how do we measure whether the prompt is extracting the *right* memories? Periodic user review of recent extractions in recap? Sampling for spec authors to review?
- **Standing-instruction count limit**: what's the soft cap before the dream pass starts pushing for consolidation? 20? 50? Needs feel-data from real use.
- **Confirmation timeout default**: 30 seconds is a guess. Validate with user testing. Should the timeout pause if the user is actively reading the thread?
- **`ProfileFact.predicate` taxonomy**: free text or controlled vocabulary? Free text is more flexible; controlled vocabulary makes recall ranking easier. Leaning free text in v1.
- **Cross-locale memory content**: a Swedish user might phrase rules in Swedish; if Stina later operates in English mode, do we translate, store both, or ignore? Probably store as-is and let recall do cross-language matching when we add embeddings.
