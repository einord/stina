# 08 — Migration

> Status: **Stub**.

## Intent

The redesign breaks the current single-thread chat data model. Per design discussion: chat history is **not** considered critical to preserve, but **extension data (people, work, etc.) must remain intact**.

Migration scope:

- Chat history: convertible to a single archived "legacy" thread, or wiped after user backup. User decides.
- Extension data: untouched. Schemas and storage stay as-is.
- Extension API: new capabilities added (event emission, recall provider). Existing capabilities preserved.
- Settings: user preferences migrated where compatible; new redesign settings created with defaults.

## Design

_To be written in full._

### Chat history default (decided)

Existing single-thread chat history is converted to a single archived "legacy" thread on first launch after upgrade. Status `archived`, trigger `{ kind: 'user' }`, title auto-generated ("Pre-redesign conversation history"). The thread's contents remain searchable via `recall`. Auto-deletion is **not** the default; the user must explicitly choose to wipe.

Rationale: even though we discussed "chat history is not critical to preserve", the redesign makes a strong audit claim ("the user can always answer 'why did Stina do X?'"). Wiping by default undermines that claim. Archive-by-default is the safer choice.

### Package decomposition (likely)

The redesign domain is much larger than chat orchestration and shouldn't all land in `packages/chat`. A reasonable decomposition (subject to confirmation as we implement):

- `packages/core` — pure types and predicates (Thread, Message, Memory shapes; state-machine transitions; scope-matching predicates)
- `packages/threads` (new, Node.js) — Thread + Message persistence and status machine
- `packages/memory` (new, Node.js) — standing instructions, profile facts, recall coordination, dream pass
- `packages/autonomy` (new, Node.js) — policy storage, severity enforcement, activity log
- `packages/chat` — keeps orchestration, consumes the above

The existing layer rules in `AGENTS.md` (core = pure TypeScript; chat = Node.js) carry forward unchanged. Treat this as the working assumption; revise if implementation reveals a cleaner shape.

Topics to cover:

- Data migration script: detect current schema, run upgrades, preserve user data, allow rollback
- Extension API additions vs. removals:
  - **Added**: `emitEvent(event)` for spawning event-triggered threads, `registerRecallProvider(handler)` for recall integration
  - **Preserved**: existing tool registration, configuration views, OAuth flows, etc.
  - **Possibly deprecated**: any "send to chat" patterns that assumed a single thread (need audit)
- First-run experience post-upgrade: explain the new model, walk user through settings
- Rollback strategy: can the user go back to v0.x if they hate it?

## Implementation checklist

- [ ] First-launch migration converts existing single-thread chat history to one archived "legacy" thread (status `archived`, trigger `{ kind: 'user' }`, auto-generated title); contents remain searchable via `recall`
- [ ] No automatic wipe of legacy chat history; wiping requires an explicit user action
- [ ] Create `packages/threads` (Node.js) for Thread + Message persistence and status machine
- [ ] Create `packages/memory` (Node.js) for standing instructions, profile facts, recall coordination, dream pass
- [ ] Create `packages/autonomy` (Node.js) for policy storage, severity enforcement, activity log
- [ ] `packages/core` holds pure types and predicates (Thread, Message, Memory shapes; state-machine transitions; scope-matching predicates)
- [ ] `packages/chat` keeps orchestration only and consumes the new packages
- [ ] Extension API additions: `emitEvent(event)` for spawning event-triggered threads, `registerRecallProvider(handler)` for recall integration, optional per-tool `redactor` declaration in tool manifest (consumed by §06 audit-trail sanitization)

_Further items added as remaining design solidifies._

## Open questions

- **Extension compatibility**: every existing extension needs auditing for assumed single-thread behavior. Which ones break?
- **Settings migration**: which existing settings translate cleanly, which are obsolete, which need user re-input?
- **Version coordination**: do extensions need a min-Stina-version bump? How is that surfaced?
- **Rollback feasibility**: realistic to support, or one-way migration with warnings?
