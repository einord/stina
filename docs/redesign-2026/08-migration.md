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

_To be written._

Topics to cover:

- Data migration script: detect current schema, run upgrades, preserve user data, allow rollback
- Extension API additions vs. removals:
  - **Added**: `emitEvent(event)` for spawning event-triggered threads, `registerRecallProvider(handler)` for recall integration
  - **Preserved**: existing tool registration, configuration views, OAuth flows, etc.
  - **Possibly deprecated**: any "send to chat" patterns that assumed a single thread (need audit)
- First-run experience post-upgrade: explain the new model, walk user through settings
- Rollback strategy: can the user go back to v0.x if they hate it?

## Implementation checklist

_Filled in as design solidifies._

## Open questions

- **Chat history disposition**: archive as legacy thread, export to file then wipe, or let user choose?
- **Extension compatibility**: every existing extension needs auditing for assumed single-thread behavior. Which ones break?
- **Settings migration**: which existing settings translate cleanly, which are obsolete, which need user re-input?
- **Version coordination**: do extensions need a min-Stina-version bump? How is that surfaced?
- **Rollback feasibility**: realistic to support, or one-way migration with warnings?
