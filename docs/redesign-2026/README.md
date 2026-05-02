# Redesign 2026

Design specification for a major UX and architecture change to Stina:

- Multi-thread "inbox" model instead of a single chat thread
- Event-triggered conversations (mail, calendar, schedule) as first-class threads
- Three actors per thread: **app** (system events), **stina** (the agent), **user**
- Unified memory across threads, with explicit memory types and lifecycles
- Progressive autonomy with deterministic severity floors
- Idle "dream pass" for memory consolidation and cleanup

## Status

This is a **design specification under active development**. No implementation has started. The spec is the source of truth — implementation issues will reference it.

| # | Section | Status |
|---|---------|--------|
| 01 | [Vision](./01-vision.md) | Draft |
| 02 | [Data model](./02-data-model.md) | Draft |
| 03 | [Memory system](./03-memory.md) | Draft |
| 04 | [Event flow](./04-event-flow.md) | Stub |
| 05 | [UI / UX](./05-ui-ux.md) | Stub |
| 06 | [Autonomy](./06-autonomy.md) | Stub (v1 trust model + collision handling decided) |
| 07 | [Dream pass](./07-dream-pass.md) | Stub |
| 08 | [Migration](./08-migration.md) | Stub (chat history default + package decomposition decided) |
| 09 | [Open questions](./09-open-questions.md) | Living |

## How each section is structured

Every section follows the same shape:

1. **Intent** — what we're trying to achieve and why
2. **Design** — the chosen approach
3. **Implementation checklist** — concrete requirements derived from the design
4. **Open questions** — what we haven't decided yet

The implementation checklist in each section IS the source for implementation issues. Nothing should be built that isn't on a checklist; nothing should be on a checklist that isn't tied to design intent.

## How to contribute to the spec

- Update the spec whenever a decision changes. The spec must always reflect the *current* understanding, not history.
- Move resolved questions out of "Open questions" and into the relevant Design section.
- Add new questions to `09-open-questions.md` if they cross-cut multiple sections; otherwise put them in the section they belong to.
- Update the Status table in this README when a section moves between Stub → Draft → Stable.

## Branch

All work happens on `redesign-2026`. Push regularly. Implementation will branch off from this once the spec stabilizes.

## Out of scope (for this redesign)

- Extension data models (mail/people/work extensions keep their schemas)
- Provider extensions (Ollama/OpenAI integration unchanged)
- Authentication and account systems
- Rewriting the build / packaging pipeline
