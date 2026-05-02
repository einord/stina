# 05 — UI / UX

> Status: **Stub**.

## Intent

Move from a single chat view to an inbox-like presentation:

- A list of threads (active first, quiet second, archived hidden)
- Each thread is a card with trigger type, title, last activity, and a snippet
- Clicking a thread opens a chat view scoped to that thread
- A morning recap (user-configurable time) summarizes overnight activity
- A unified activity log surfaces every autonomous decision Stina made

Visual direction is calm and reflective, in line with the concept sketch shared in design. Not finalized.

## Design

_To be written._

Topics to cover:

- Thread list view (sort, filter, archive action)
- Thread detail view (chat-like, but with `app`/`stina`/`user` author distinction visible)
- Universal input: when on the thread list, typing creates a new thread; when in a thread, typing replies in it
- Recap view: morning (or user-configurable), includes silenced events, woken threads from dream pass, suggested auto-policies
- Activity log: same UI/layout as the existing scheduled-jobs list (reuse pattern)
- Settings surface for memory inspection, auto-policies, recap timing, retention windows
- Notification behavior: instant when Stina speaks, silent for app-level events Stina silenced

## Implementation checklist

_Filled in as design solidifies._

## Open questions

- **Archive vs. delete**: do we ever offer thread deletion, or is archive permanent? Lean toward archive-only for auditability.
- **Search scope from thread list**: search threads by title, by message content, or both?
- **Thread grouping**: spec discussion deferred this until usage shows it's needed. Confirm we ship without it.
- **Mobile/responsive considerations**: the current Stina has Web/Electron/CLI frontends. Inbox model needs design across all three.
- **Keyboard navigation**: in an inbox-style UI, what are the shortcuts? Define before implementation.
- **Unread state**: how is "new since I last looked" represented? Bold text, dot, count?
- **CLI/TUI representation**: the inbox concept needs a TUI mapping. Probably a thread list + thread view, but command shapes need design.
- **User-facing search**: §02 describes `recall` as a Stina-only tool. The user also needs a way to search threads, messages, and memories from the UI. Open question: does user-facing search share the recall implementation, or is it a separate index-backed search?
