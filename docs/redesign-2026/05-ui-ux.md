# 05 — UI / UX

> Status: **Draft**. Defines the user-facing surface for Web and Electron (shared `packages/ui-vue`). TUI/CLI is deferred and will follow later.

## Intent

The inbox model from §01 is the mental shift. The UI must:

- Make the inbox the home view — threads are first-class, browsable, navigable.
- Make Stina's silence and her actions equally visible (in their right places, not equally loud).
- Stay calm. The concept sketch direction — sober typography, generous whitespace, warm accents — is the visual goal. The redesign should make Stina feel like a thoughtful presence, not a dashboard.
- Let extensions shape how their content appears, within a constrained palette so the whole inbox stays coherent.

## Design

### Layout

Two-column, with the right column collapsible. The main menu (settings, extensions, activity log) is hidden behind a single `☰` button to keep the visual surface uncluttered.

```
┌────────────────────────────────────────────┬──────────────────┐
│                                            │                  │
│  TRÅD-LISTA + ÖPPEN TRÅD                   │  EXTENSION-      │
│  (master/detail split, email-style)        │  WIDGETS         │
│                                            │  (existing,      │
│  ┌─ Trådlista (~30%) ─┬─ Öppen tråd ──┐    │   collapsible)   │
│  │                    │                │    │                  │
│  │  Trådkort          │  Meddelanden   │    │  Today           │
│  │  Trådkort          │  Inline status │    │  • 09:00 ...     │
│  │  ...               │  Universal in. │    │  • 14:30 ...     │
│  │                    │                │    │  ─────           │
│  └────────────────────┴────────────────┘    │  Mail unread: 3  │
│                                            │                  │
└────────────────────────────────────────────┴──────────────────┘
                              ☰  (settings · extensions · activity log · provider · about)
```

**Responsive behavior.**

- **≥ 1024 px wide**: full layout. Trådlista + öppen tråd side-by-side; extension panel visible by default.
- **768–1024 px**: extension panel collapses by default; user can pin it open.
- **< 768 px (mobile / narrow window)**: single-column. Trådlista is the home view; tapping a thread navigates to the detail view; extension panel becomes a slide-over from the right edge.

The same `packages/ui-vue` components serve all widths.

### Pending and loading states

Per §04, a thread is created synchronously on `emitEvent` but is **invisible in any UI surface** until its first decision turn completes (success or failure). The UI must uphold this:

- **Trådlistan** never renders a thread before its first decision turn finishes — no skeleton row, no placeholder, no "loading" entry.
- **App-level title-bar / dock-icon unread count** never increments before first-turn completion. This avoids flicker (count up then down if Stina silences) and avoids leaking the existence of in-flight threads.
- **In-flight indicator** sits as a tiny spinner under the `☰` button when ≥ 1 events are being processed. Shows a tooltip on hover with the per-extension count ("2 mail · 1 calendar"). Hidden when nothing is in flight. This is the only visible signal that Stina is actively reasoning about events; it never pushes anything into the trådlista.
- **Thread loading inside the detail pane** (cold-loading messages from disk, e.g. when navigating to an old thread) renders a quiet skeleton row in the message list, not a blocking spinner.

### Thread list

A scrollable list of thread cards. Default sort: most recent activity first. Pinned section at top for surfaced threads with active follow-up; quiet/background segments below.

**Segments (collapsible headers):**

1. **Active** — surfaced threads with recent activity (default expanded)
2. **Quiet** — surfaced threads that have gone quiet (default expanded; less emphasis)
3. **Silently handled** — background threads (default *collapsed*; header shows count: *"Silently handled (12 since last visit)"*)
4. **Archived** — collapsed, must be expanded to see; user can also reach via search

**Filters and search.** A single search field at the top filters by title and (optionally) message content. Filter chips for trigger kind (`mail`, `calendar`, `scheduled`, `user`, `stina`) and for state (active / quiet / background / archived). Search and filter compose.

**Unread state.** A surfaced thread is "unread" until the user opens it. Unread cards have a subtle left-edge accent (color from the trigger's accent palette — see Extension hints below) and bolder title. No dot, no count badge per card; the unread state is visual weight, not counter noise. The app-level title-bar / dock-icon may carry an aggregate count of unread surfaced threads (platform convention).

### Background-thread visibility (segment + counter)

Background threads (per §04 — not surfaced, no notification) live in the **Silently handled** segment. The segment is the audit cue users glance at to confirm Stina isn't over-silencing. Concrete semantics:

- **Increment**: every time a thread enters Background — i.e. first decision turn completes with the thread staying background, OR a background thread receives a new app message that Stina also keeps silent.
- **Reset**: when the user **expands the segment header**. Direct opens of individual background threads (via search, deep link, command palette) do NOT reset.
- **Display ceiling**: counter never exceeds the actual current number of background threads. If a background thread transitions to Active (Stina later surfaces it), the counter decrements; it cannot show "12 since last visit" if there are only 8 threads in the segment.
- **Persistence**: per-app-install (stored alongside the user's settings), not per-session. Closing and reopening the app preserves the count.

When a background thread transitions to Active (e.g. a follow-up app message and Stina decides to surface), the thread leaves the segment and the counter decreases.

### Thread cards

Each card carries the same baseline data: title, last-activity time, snippet. **Extensions provide rendering hints** for cards spawned from their triggers, within a constrained set so the inbox stays coherent.

```ts
interface ExtensionThreadHints {
  icon?: string                   // sprite name from a registered icon set
  accent?: AccentName             // from a constrained palette (see below)
  card_style?: 'minimal' | 'bordered' | 'left-line'
  snippet_field?: string          // name of an AppContent field to render as the card preview
  badge?: string                  // very short text overlay (e.g. "3 new")
}

type AccentName =
  | 'sand' | 'olive' | 'rose' | 'sky' | 'plum' | 'graphite' | 'amber'
```

The runtime renders the card; extensions only provide structured hints. This keeps untrusted extension content from injecting raw DOM into the inbox.

**Hint validation at install time.** §06's install dialog validates the manifest's hints: `accent` ∈ palette, `card_style` ∈ enum, `icon` ∈ registered sprite set, `snippet_field` ∈ the named `AppContent` kind's known fields. Validation failure blocks install with a specific error pointing to the field. The install dialog also renders a *preview* of what cards from this extension will look like (uses the validated hints, shows the chosen accent and icon), so the user sees their consent visually before installing.

For threads not from an extension (`trigger.kind: 'user'` or `trigger.kind: 'stina'`), the runtime uses defaults: minimal card style, neutral accent, no icon. The recap thread is a special case (see Recap below).

**Examples.** Mail extension might use `{ icon: 'envelope', accent: 'sky', card_style: 'left-line', snippet_field: 'snippet' }`. Calendar extension: `{ icon: 'calendar', accent: 'olive', card_style: 'bordered', snippet_field: 'title' }`. The visual variation gives the user fast trigger-type recognition without needing to read each title.

**Accent palette in light and dark mode.** Each accent is defined as a light/dark token pair in `packages/ui-vue`'s theme. Both must meet WCAG AA contrast against their respective backgrounds. The token names (`sand`, `olive`, etc.) are stable across themes; the resolved colors differ. This means an extension that picks `sky` gets the "right" sky in both modes without doing anything.

### Thread detail view

The center pane when a thread is open. Vertical chat-like flow with three author types visually distinguished:

- **`user`** — right-aligned, accent background. Trusted-input visual.
- **`stina`** — left-aligned, plain background. Stina is the assistant; her messages are the primary content.
- **`app`** — center-aligned banner-style block with the trigger icon, slightly inset from full width. Visually distinct from conversational messages because they are *events*, not turns.

**Inline activity entries** render at their timestamp position, with severity-driven emphasis (per §02). Memory-change rows from §03 follow the same scale.

**Author and source labels.** Each `app` block shows the source extension's name and icon. Each `stina` message that involved a tool call shows the tool name and (if any) the auto-policy that authorized it. Hover/long-press surfaces full metadata.

#### Auto-action provenance chip

Auto-action rows from §06 carry a clickable provenance chip with the full traceability chain. Two render templates:

- **Instruction-bound policy**: `Policy: <tool> · Instruction: "<rule excerpt>"`
- **Free-standing policy** (no `standing_instruction_id`): `Policy: <tool> · Created in <thread title> on <date>`

Both are clickable and open the activity log inspector with the chain pre-expanded: `auto_action → AutoPolicy → StandingInstruction (if any) → source thread`. Free-standing policies do not degrade to nothing — they show their creation context instead.

#### `action_blocked` rendering

When Stina hits a collision (per §06 — wanted to act, but severity exceeds authorization), the `action_blocked` row renders with three explicit pieces of information:

- **What she intended** — the tool and a short summary of the input ("Send mail to peter@…")
- **Why she couldn't** — the blocker (`severity: critical`, `no policy for high tool`, etc.)
- **What she did instead** — a verb badge: **Escalated** / **Skipped** / **Solved differently**, plus a one-line description ("Saved as draft" / "Surfaced this thread for your decision" / "Did not act this time")

A one-click affordance "Approve original action now" is shown where applicable (Stina chose to skip or solve differently, but the user could still authorize the original). Clicking it routes through the normal severity prompt.

**Severity inheritance.** The `action_blocked` row's visual severity inherits from the *intended* tool's severity, not the chosen alternative's. Otherwise a `critical` action solved with a `low` alternative would render as `low` and disappear from view.

#### Trust-boundary marker

The runtime renders a subtle dotted border around any string whose ultimate source is non-Stina untrusted data. This applies to:

- All interpolated strings from `AppContent` fields (mail subject, calendar title, snippet, extension status detail)
- `ProfileFact.fact` text and `StandingInstruction.rule` text wherever they are quoted in the UI (recap, dream-pass flag, settings)
- `EntityRef` snapshot strings
- Quoted user content rendered inside Stina's structured outputs (e.g. when a `dream_pass_flag` quotes the user's words back during a `user_says` invalidation match)

Stina's own free `text` does NOT get the marker — she is trusted to compose, even when paraphrasing untrusted input. The trust-boundary line for *her words* is enforced at the model layer (untrusted-data wrapper per §02), not in the UI.

The visual: 1px dotted border in the surface accent color, with a tiny "external content" tooltip on hover. Quiet enough to not disrupt reading; clear enough to remind on inspection.

### Universal input

The composer at the bottom of the thread detail view. Behavior depends on context:

- **In an open thread** — typing replies in that thread, enter sends.
- **No thread open (thread list focused, no detail)** — the composer floats at the bottom of the trådlista pane. Typing creates a new thread (`trigger.kind: 'user'`) on enter, which immediately opens.
- **In the recap thread** — same as any thread (typing replies in the recap, which converts the recap into an ongoing conversation).

If Stina is mid-turn in the active thread, the composer accepts input and the user message is enqueued in the per-thread FIFO from §04. Visual: a small dot to the left of the composer with the queued-message count when ≥ 1; tooltip on hover lists queued messages with timestamps. Persists across thread navigation as long as the queue is non-empty.

### Recap

The recap appears as a thread in the inbox, but with intentional differences:

- **Card style**: full-width, larger title, warmer accent (`amber`). It catches the eye without shouting.
- **Card content**: the morning briefing renders directly in the card so the user can read it without opening — but with a height cap (~60vh on desktop, snippet-only on `< 768 px`). When the briefing exceeds the cap, the card collapses the tail with a "Show full recap" affordance that opens the thread.
- **Open behavior**: clicking the card opens it as a normal thread. The user can reply, ask Stina to follow up on items, dismiss flags, accept suggested policies — all using normal thread mechanics.
- **Lifecycle**: a fresh recap thread is created at each scheduled recap time (default 06:30, configurable). The runtime spawns it via `runtime.emitEventInternal` (per §04) with `trigger: { kind: 'stina', reason: 'recap' }`. The previous recap thread goes `quiet` automatically after 12 hours and stays there indefinitely (one per day is low-volume; Quiet segment groups them; user can archive manually if desired).

#### Recap composition contract

Recap composition (per §07) emits a structured payload that the UI renders. The payload is an ordered list of typed sections, each with a priority weight; the card renders top-priority sections first and clips the tail with a count when the height cap is hit.

```ts
interface RecapPayload {
  sections: RecapSection[]   // ordered by priority
}

type RecapSection =
  | { kind: 'overnight_summary'; text: string; priority: number }
  | { kind: 'flags'; items: FlagItem[]; priority: number }
  | { kind: 'auto_actions_grouped'; groups: { tool: string; count: number; sample: string[] }[]; priority: number }
  | { kind: 'silenced_grouped'; groups: { trigger_kind: string; count: number }[]; priority: number }
  | { kind: 'suggestions'; items: SuggestionItem[]; priority: number }   // policy suggestions, etc.
  | { kind: 'degraded_mode'; transitions: { entered_at: number; exited_at?: number; error_class: string }[]; priority: number }

interface FlagItem {
  flag_id: string                  // ActivityLogEntry.id of the underlying dream_pass_flag
  flag_kind: string                // copied from dream_pass_flag.details.kind (e.g. 'contradiction', 'stale_fact', 'user_says_match', 'oversize_count', 'change_cap_hit', 'precap_pass_timeout', 'rule_violation')
  summary: string                  // human-readable; renders inside trust-boundary marker if it quotes untrusted content
  thread_id: string | null         // related thread, if any
  actions: FlagAction[]            // user affordances (dismiss, accept, snooze, edit, open)
}

type FlagAction =
  | { kind: 'dismiss' }
  | { kind: 'accept' }             // for confirmable flags (user_says match, suggested instruction edit)
  | { kind: 'snooze'; days: number }
  | { kind: 'edit'; target: 'memory' | 'instruction' | 'policy'; ref_id: string }
  | { kind: 'open_thread'; thread_id: string }

interface SuggestionItem {
  suggestion_id: string            // stable id for dedup across recaps until acted on
  kind: 'policy' | 'instruction_consolidation' | 'memory_promotion'
  summary: string                  // user-facing explanation
  reasoning: string                // why Stina is suggesting this (e.g. "approved 4 times this week")
  preview: Record<string, unknown> // structured preview of what would be created/changed
  actions: FlagAction[]            // typically accept | edit | dismiss
}
```

Sections that get clipped from the card are still in the opened thread view. The "Show full recap" link's text indicates the count: *"Show full recap (3 more sections)"*.

The recap composition output is interpolated content; its strings (especially in `flags.items` and `auto_actions_grouped.sample`) go through the trust-boundary marker rules above where they reference untrusted data.

### Activity log (under the menu)

The activity log lives behind the `☰` menu rather than as a permanent panel. Two reasons:

1. The most user-relevant entries are already rendered **inline in their threads** (memory_change, auto_action, action_blocked) per §02 / §03 — so the log is for *cross-thread* exploration, not first-line awareness.
2. Visual restraint: the home view shouldn't have three competing panels.

When opened, the activity log takes over the center pane (replacing the master/detail split). Structure:

- **Filter row**: by `kind` (multi-select), by date range, by source (`dream pass` / `Stina` / `user`), by severity, by tool, by extension.
- **Entry list**: one row per entry, ordered by time descending. Severity-driven visual weight. Dream-pass-origin entries (`details.source: 'dream_pass'`) carry a small persistent dream-pass marker (icon + tooltip). Same marker is used in Inställningar → Minne for memories whose last edit was dream-pass.
- **Inspector**: clicking an entry opens a side-by-side detail view with full `details` payload, traceability chain (entry → policy → instruction → source thread), and undo/recreate affordances where applicable.

The "dream pass" filter chip (per §07) is a first-class control. Same for "auto actions" (per §06).

### Main menu (☰)

Hidden behind a single button to preserve the calm visual surface. Items:

- **Inställningar** — app-level settings (recap time, quiet hours, notification preferences, retention defaults, dream pass settings, model provider)
- **Extensions** — installed extensions with status, per-extension settings, install/uninstall, registry browser
- **Aktivitetslogg** — the activity log view described above
- **Provider** — quick switcher for current AI provider (visible here for fast access; full settings in Inställningar)
- **Om** — version, credits, links

The menu is deliberately short. Power-user surfaces (developer tools, debug exports) sit under sub-pages of Inställningar rather than as top-level menu items.

### Memory inspection (in Inställningar)

Under Inställningar → Minne:

- **Viktiga minnen** (StandingInstructions): list with filters (active/expired/all, by source, by `created_by`), with edit / delete affordances
- **Faktaminnen** (ProfileFacts): list with same filters, edit / delete

Thread summaries are not surfaced as a "memory" type — they are internal to the recall implementation per §03.

Every memory shows its provenance: source thread (clickable), creation timestamp, who created it (user vs. Stina-extracted), source of last edit (user vs. dream pass). Entries whose last edit was dream-pass carry the dream-pass marker (same icon used in the activity log) — never just a metadata column. The marker is the user's at-a-glance answer to "did I do this, or did Stina do this asleep?" per §07's hard rule.

Edits and deletes from this surface produce `memory_change` entries identical to inline edits — the activity log captures both paths uniformly.

### Notification settings

Under Inställningar → Notiser:

- Master toggle (mute all)
- Per-trigger-kind toggles (notify for `mail` / `calendar` / `scheduled` / `stina`; `user`-triggered are always self-initiated and don't notify)
- Per-extension toggles (override the trigger-kind setting for specific extensions)
- "Quiet hours" (separate from dream-pass quiet hours, but defaults to the same range): notifications during this window are deferred until the window ends and surfaced as one aggregate
- Failure / degraded-mode notifications: separately configurable so the user can keep them even if all other notifications are muted

The runtime checks these settings before firing per §04 — if suppressed, `notified_at` stays null while `surfaced_at` is set as usual.

#### Quiet-hours aggregation contract

When quiet-hours suppression defers notifications, the runtime collects the suppressed surfacings in an internal queue. At the moment quiet-hours ends:

- **One aggregate OS notification** fires with title *"N updates while you were away"*. Tapping it opens an aggregated view (a synthetic recap-style screen) showing the surfaced threads grouped by trigger kind.
- **`Thread.notified_at` is set per individual thread** at this moment — preserving the audit contract that "notification fired for this thread" is recorded, even though the actual OS notification was aggregated.
- If degraded-mode aggregation is also pending in the same window, the degraded-mode anchor's `notified_at` is set at the same moment; both aggregations fire as one combined OS notification.
- If the user opens the app *during* the quiet-hours window (without an OS notification), the deferred surfacings are still visible in the trådlista — just no OS-level notification fires. `notified_at` remains null until the window closes (or until the user opens an individual thread, which doesn't set `notified_at` either; the spec keeps the field strictly tied to "OS notification did fire").

### Severity rendering reference

Centralized so designers and implementers stay aligned:

| Severity | Inline activity row | Tool call rendering | Notification |
|----------|---------------------|---------------------|--------------|
| `low` | Grey one-liner, condensed, optional collapse | Same | Never notifies |
| `medium` | One-liner with icon and timestamp | Same | Surfacing follows the §04 rules |
| `high` | Accented row with border-left, expandable details | Prominent block with tool name and policy chip | Surfacing follows the §04 rules |
| `critical` | Full-card with strong border, requires user acknowledgment to dismiss | Modal/blocking prompt before execution | Always notifies, bypassing user-set suppression; respects platform-level limits (see below) |

#### `critical` rate limiting and platform respect

`critical` is the user's deepest trust contract; the UI must protect it from abuse:

- **Per-extension critical-call rate limit**: ≥ 3 unresolved `critical` modals from the same extension within 60 seconds collapses subsequent ones into a single "Extension X is requesting N critical actions — review queue?" sheet. The user opens the sheet to see and act on each individually. Every critical stays visible; no critical is silently dropped. This prevents a misbehaving extension from training the user to dismiss critical prompts mindlessly.
- **Notification-bypass scoping**: "always notifies, bypasses suppression" applies only to *user-set* suppressions in Stina (master toggle, per-trigger-kind, quiet hours). Platform-level limits the user has consciously set (browser notification permission revoked, macOS Focus modes) are respected — Stina degrades to in-app blocking modal in those cases. The OS-level signal that the user does not want notifications is honored.
- **In-app modal always fires** for `critical` regardless of OS notification state, so the user sees the prompt the next time they look at the app.

### Keyboard navigation

Goal: a power user can run the inbox without a mouse.

- `j` / `k` — move down / up in the trådlista
- `Enter` — open the focused thread
- `Esc` — close the open thread, return focus to trådlista
- `e` — archive the open thread
- `/` — focus the search field
- `c` — focus the composer (creates a new thread if none is open)
- `g a` / `g q` / `g s` / `g r` — jump to Active / Quiet / Silently handled / Archived segments
- `?` — show keyboard shortcut overlay
- `cmd/ctrl + ,` — open Inställningar
- `cmd/ctrl + l` — open Aktivitetslogg
- `cmd/ctrl + k` — global command palette (search + actions)

Shortcuts must not conflict with system or browser shortcuts. The shortcut overlay is the source of truth; this list is illustrative.

#### Focus management

- **`critical` modals trap focus** and return focus to the originating element on dismissal.
- **Opening a thread** moves focus to the message list (top-most unread, or bottom of the thread if all read); `Esc` returns focus to the trådlista row that was opened.
- **`j`/`k` in the trådlista** skip past collapsed segment headers but stop on expanded headers, so the user can collapse/expand with `Space` or `Enter` on a focused header.
- **Right-panel widgets** are reachable via a skip-link (Tab-cycle from the trådlista) but not via `j`/`k`.
- **Composer** captures `Enter` for send when focused; `Shift+Enter` for newline. `Esc` from the composer returns focus to the message list.

### User-facing search

The search field in the trådlista is the user-facing entry point. v1 implementation: keyword search over thread titles and message content, scoped by the active filter chips.

This is **not** the same code path as Stina's `recall` tool. They share index data where possible (one keyword index over messages and summaries) but the user-facing search returns navigable results (clickable thread previews) while `recall` returns ranked text snippets for Stina to reason over. Sharing the index avoids duplication; not sharing the result shape avoids forcing one interface to compromise for the other.

v1 keyword search is monolingual against the as-stored content. Cross-language search (a Swedish-set memory matched from an English query, or vice versa) is gated on §03's resolution of cross-locale memory storage and on embedding-backed search.

When semantic search lands (per §03 open question on embeddings), both surfaces benefit — search becomes "did you mean…", `recall` becomes more robust to paraphrased queries.

### Extension UI contract

Extensions can shape the UI in two constrained ways in v1:

1. **Thread rendering hints** — `ExtensionThreadHints` (above) for cards spawned from their triggers. Hints are validated at install time; invalid hints block installation.
2. **Per-extension settings view** — a dedicated UI surface for the extension's own configuration, accessible under ☰ → Extensions → [extension name]. The §06 install dialog also reuses this surface for the post-install welcome view.

**Right-panel widgets** are an existing mechanism, preserved at the code level so existing extensions that ship widgets continue to work unchanged. **However, the extension API does NOT accept new widget registrations in v1.** A v1.x release will land a documented widget contract (sandbox model, lifecycle, observable state, emit-able events) — until then, the surface stays frozen. This honest deferral keeps v1's trust boundary clean (no half-specified widget surface where extensions can do "whatever") and gives us time to design the contract properly after the inbox model has shipped.

Extensions cannot inject content into thread bodies, into the recap, into the activity log, or into the menu under any circumstances. The trust boundary from §02 carries through to the UI: extensions own their cards' *appearance* (within hints) and their settings view; everything else is runtime-rendered from typed schemas.

### First launch and onboarding

A fresh user opens the app for the first time. State: a provider extension is installed (the install ships with at least one default to bootstrap; if not, see "If no provider is configured" below); no other extensions, no threads, no recap.

**Stina starts the conversation.** The runtime creates a welcome thread via `runtime.emitEventInternal` with `trigger: { kind: 'stina', reason: 'manual' }`. The decision turn is invoked with a special onboarding system prompt: *"This is the user's first launch. You don't know anything about them yet. Introduce yourself briefly, ask what they'd like help with, and learn about them through conversation. Suggest setup actions only when they fit naturally."*

Stina composes the first `normal`-visibility message herself — no scripted welcome text in the runtime. A typical first turn might be:

> *"Hej! Jag är Stina. Jag är en assistent som lever på din dator och hjälper dig hålla koll på dagen. För att vi ska kunna börja samarbeta på riktigt behöver jag lära känna dig lite. Vad jobbar du med, och vad är det du oftast skulle vilja ha hjälp med?"*

The thread is surfaced immediately so it's the first thing the user sees. The composer is focused below the message; pressing enter sends the user's reply into the same thread.

**The conversation drives onboarding.** As the user answers, Stina extracts profile facts naturally per §03. She also asks targeted follow-ups when relevant ("vill du att jag ger dig en kort sammanfattning på morgonen?" → confirms the recap time; "vill du att jag håller koll på din mail?" → suggests installing a mail extension). Setup actions appear as inline cards *when Stina raises them in conversation*, not as a wizard.

This means: the same setup decisions get made (recap time, quiet hours, which extensions), but framed by what the user has just shared rather than presented as a checklist of strangers' tasks. Profile facts are accumulated throughout — the user's first ten minutes with Stina populates her memory in a way that pays off forever.

**Skip-all** is always available via a subtle "skip onboarding" link below the composer. Tapping it dismisses the welcome thread (archived) and lands the user on an empty-but-usable inbox. Stina's welcome thread is recoverable from the Archived segment.

**Suggested actions threshold.** Stina's onboarding prompt instructs her to make at most three setup-action suggestions in the first conversation; beyond that the conversation stays free-form. Prevents the welcome from devolving into a checklist anyway.

**The welcome thread doubles as the discoverability anchor.** If the user comes back later and forgets where Inställningar is, the welcome thread links there. If they returned to a thread that was already going somewhere productive, that productive direction is preserved.

#### If no provider is configured

If the install does not ship a default provider (e.g. for builds that don't bundle one, or for advanced installs that disabled it), the welcome flow degrades gracefully:

- The welcome thread still appears, but Stina's first message is replaced with a runtime-rendered message explaining: *"Jag behöver en AI-leverantör för att kunna prata med dig. Välj en så fortsätter vi."*
- Below the message, a single inline action card lets the user pick a provider extension from the registry.
- Once configured, the runtime re-invokes the onboarding decision turn and Stina takes over with the conversational welcome above.

### Empty and error states

Empty states are part of Stina's voice — the user notices them more than they realize, and a flat "no items" sets a flat tone for the whole product. Every empty-state copy line should sound like Stina is in the room, not like a database returned zero rows.

| State | What the user sees |
|-------|-------------------|
| Empty inbox after first launch | The welcome thread (above), full card hero |
| Empty Active segment, populated Quiet/Silently handled | Plain text under the Active header: *"Lugnt just nu — Stina följer med i bakgrunden."* Segment counters below give context. |
| Empty trådlista entirely (post-archive of welcome thread, no events) | Soft hero: *"Börja en ny konversation med Stina så visas den här."* with composer focused. |
| Empty activity log (filtered with no results) | *"Inget att visa med de här filtren."* with a "Rensa filter" affordance |
| Search returns nothing | *"Hittar inget som matchar."* with a hint to try removing filter chips |
| Provider offline / model unavailable | An `extension_status` AppMessage in a Stina-thread (consistent with §04 degraded-mode), plus a subtle banner in the title-bar zone: *"Provider X svarar inte just nu — Stina väntar in den."* |
| Failed thread load (DB read error or schema mismatch) | Inline message in the thread pane: *"Kunde inte öppna den här tråden. Försök igen?"* with a "Försök igen"-knapp. Trådlista entry stays so the user doesn't lose the thread reference. |
| Extension crashed mid-session | Toast notification (auto-dismiss after 8 s) + `extension_status` AppMessage with `status: 'error'` in a Stina-thread |

The pattern across all states: explain in one sentence, offer one action where relevant, never blame the user, never use punctuation that scolds. Where it's natural, frame the empty state as something Stina is doing or waiting for, not as an absence.

### Cross-platform notes

- **Web** and **Electron** share `packages/ui-vue`. Same Vue components, same CSS, same layout. Differences are limited to platform integrations (Electron has native notifications, file system access, deeper menubar; Web uses browser equivalents).
- **TUI/CLI**: deferred. Will be designed once the GUI versions stabilize. The data model and event flow already accommodate it (the inbox is a tree of threads with messages; a TUI naturally maps to a list view + detail view + command line).

The deferred TUI is intentional — UI iteration in v1 will move faster if we don't have to rev three frontends in parallel.

## Implementation checklist

- [ ] Two-column layout (master/detail trådlista on left, extension panel on right) in `packages/ui-vue`; right panel collapsible
- [ ] Responsive breakpoints: ≥ 1024 px full layout, 768–1024 px extension panel collapses by default, < 768 px single column with slide-over panels
- [ ] `☰` main menu with items: Inställningar, Extensions, Aktivitetslogg, Provider, Om
- [ ] Pending state: trådlistan never renders threads before first decision turn completes; dock/title-bar count never increments before completion; in-flight indicator under `☰` shows count when ≥ 1
- [ ] Trådlista with segments: Active, Quiet, Silently handled (collapsed default with "(N since last visit)" counter), Archived
- [ ] "Silently handled" counter: increments on background-stay decisions; resets only on segment expansion; persisted per-app-install; ceiling matches actual segment size
- [ ] Trådlista filters: trigger-kind chips (`mail`/`calendar`/`scheduled`/`user`/`stina`) and state chips (active/quiet/background/archived)
- [ ] Search field at top of trådlista; v1 keyword search (monolingual) over titles + message content; index shared with `recall`
- [ ] Unread state via subtle left-edge accent + bold title; no dot/count per card
- [ ] App-level title-bar / dock-icon shows aggregate unread surfaced-thread count (per platform convention)
- [ ] `ExtensionThreadHints` API for extensions to provide icon / accent / card_style / snippet_field / badge per thread
- [ ] `ExtensionThreadHints` validated against schema at install time; invalid hints block installation; install dialog renders preview
- [ ] Constrained accent palette: sand, olive, rose, sky, plum, graphite, amber — defined as light/dark token pairs in `packages/ui-vue`'s theme; both pass WCAG AA contrast
- [ ] Trådkort renderer respects extension hints; defaults for `user` / `stina` triggers
- [ ] Recap thread renders in-card with height cap (~60vh desktop; snippet-only on `< 768 px`); special card style with `amber` accent and larger title; clicking opens as a normal thread; "Show full recap (N more sections)" affordance when content is clipped
- [ ] Recap thread spawned by runtime at scheduled recap time via `runtime.emitEventInternal` with `trigger: { kind: 'stina', reason: 'recap' }`
- [ ] Recap thread auto-`quiet` after 12 hours; not auto-archived
- [ ] Recap composition contract: structured `RecapPayload` with ordered, typed sections and priority weights (per §07)
- [ ] Thread detail view distinguishes `user` (right-aligned, accent), `stina` (left-aligned, plain), `app` (center-banner with source label and icon)
- [ ] Inline rendering of activity log entries with `thread_id` at their `created_at` position; severity-driven visual weight per §02
- [ ] Trust-boundary marker around any rendered string whose ultimate source is non-Stina untrusted data: `AppContent` field interpolations, `ProfileFact.fact` / `StandingInstruction.rule` text quoted in UI, `EntityRef` snapshots, user content quoted in dream-pass-flag rendering. Stina's own `text` is exempt.
- [ ] Auto-action provenance chip shows full chain for both instruction-bound and free-standing policies; click opens activity log inspector with chain pre-expanded
- [ ] `action_blocked` row renders intent + blocker + chosen alternative (verb badge: Escalated / Skipped / Solved differently); severity inherits from the *intended* tool; "Approve original action now" affordance where applicable
- [ ] Universal input: in-thread replies in that thread; in trådlista with no detail, creates a new `user`-trigger thread
- [ ] Composer accepts input while Stina is mid-turn; queued-message count dot to the left of composer when ≥ 1; tooltip lists queued messages; persists across thread navigation; enqueued in per-thread FIFO per §04
- [ ] Aktivitetslogg view (under ☰): filter row (kind / date / source / severity / tool / extension), entry list, inspector with traceability chain and undo/recreate
- [ ] Dream-pass-origin entries carry persistent dream-pass marker (icon + tooltip) in both the activity log and Inställningar → Minne
- [ ] "Dream pass" filter chip is first-class in aktivitetsloggen
- [ ] Inställningar → Minne: tabs for Viktiga minnen and Faktaminnen only; thread summaries are internal per §03 and not surfaced; provenance shown per entry; edit/delete produce `memory_change` entries
- [ ] Inställningar → Notiser: master toggle, per-trigger-kind toggles, per-extension overrides, quiet-hours window with aggregation, separate failure/degraded-mode toggles
- [ ] Inställningar → Modell: provider for live conversation; separate provider for dream pass (override; defaults to live-conversation provider per §07)
- [ ] Inställningar → Recap: recap time (default 06:30), enable/disable, link to dream-pass quiet-hours (separately configurable per §07)
- [ ] Quiet-hours notification aggregation: one aggregate OS notification at window-end; `notified_at` set per individual thread at the same moment; combined with degraded-mode aggregation if both pending
- [ ] Notification suppression honored by §04 runtime; `notified_at` stays null when suppressed
- [ ] Severity rendering follows the centralized table for inline rows, tool calls, and notifications
- [ ] `critical` per-extension rate limit: ≥ 3 unresolved modals within 60 s collapses to a single "review queue" sheet; no critical silently dropped
- [ ] `critical` notification bypasses user-set suppression but respects platform-level limits (browser permission revoked, OS Focus modes); in-app modal still fires
- [ ] Keyboard navigation per the listed shortcuts (`g s` for Silently handled, not `g b`); `?` shows the overlay; shortcuts must not collide with system/browser defaults
- [ ] Focus management: `critical` modals trap focus; opening a thread moves focus to message list; `Esc` returns focus to trådlista row; `j`/`k` skip collapsed segment headers but stop on expanded ones; right-panel reachable via skip-link, not `j`/`k`; composer `Enter` sends, `Shift+Enter` newlines, `Esc` returns to message list
- [ ] `cmd/ctrl + k` global command palette for search + actions
- [ ] User-facing search and Stina's `recall` share the keyword index but not the result shape
- [ ] Extension UI contract enforced: extensions cannot inject into thread bodies, recap, activity log, or menu
- [ ] Right-panel widgets: existing widget code preserved at code level; no new widget registrations accepted via the extension API in v1; documented contract lands in v1.x
- [ ] Per-extension settings view under ☰ → Extensions → [name]; reused by §06 install dialog as the post-install welcome
- [ ] First-launch flow: welcome thread (`trigger.kind: 'stina', reason: 'manual'`) where Stina starts the conversation; runtime invokes the decision turn with an onboarding system prompt instructing her to introduce herself, ask what the user wants help with, and learn through conversation; setup actions (provider, event-source, recap/quiet-hours) appear inline only when Stina raises them; skip-all available below the composer
- [ ] Onboarding-prompt cap: at most three setup-action suggestions in the first conversation
- [ ] No-provider degraded welcome: runtime-rendered fallback message + single provider-picker action card; re-invokes the conversational welcome once a provider is configured
- [ ] Empty and error states use Stina's voice (warm, present, never scolding); copy lines per the table
- [ ] TUI/CLI explicitly deferred; no v1 work

## Open questions

- **Recap timing default** — 06:30 is a guess; the user can set this at first launch. Should we offer a "morning + evening" option (two recaps a day) for users who want a wind-down summary too? Probably v2.
- **Critical rate-limit threshold tuning** — "≥ 3 within 60 s" is a starting heuristic. Validate with real extension behavior; the threshold may differ per severity-class or per registry-trust level.
- **Right-panel widget contract for v1.x** — explicit work item: define lifecycle, sandbox model, observable state, emit-able events. Open until that spec lands.
- **Right-panel widget reactivity** — once the contract lands, do widgets react to the open thread (People extension showing participants) or stay global? Trade-off: more useful, more re-renders.
- **Pinning threads** — should the user be able to pin a thread to the top regardless of activity? Useful for "ongoing project" threads. Defer to v2 unless trivial.
- **Drag-to-reorder filters / segments** — power-user nicety. Defer.
- **Theming beyond accent palette** — light/dark mode is delivered via token pairs. Custom themes (user-defined accents) is a power-user feature; defer to post-v1.
- **Token-cost aggregate UI for dream pass** — schema in §07 supports it (`dream_pass_run.details.usage`). Skipped for v1; clean post-v1 addition.
- **Extension-supplied icons** — do extensions ship their own icon SVGs or only choose from a registered set? Leaning choose-from-set with a generous default; extensions can request additions to the set via the registry.
- **Extension i18n contract** — extensions provide their own label translations via the manifest, but the manifest schema for translations isn't defined. Either add a translation block to the manifest spec or commit to English-only extension labels in v1.
- **Detailed accessibility audit** — v1 must respect prefers-reduced-motion, meet WCAG AA contrast minimums, and trap focus per spec. Detailed audit (screen reader testing, keyboard-only flows beyond the spec, color-blind safety of accent palette) is a separate work item before v1 ships.
- **Internationalization layer** — user-facing labels (sv/en) defined in §03 must be wired through a locale layer; default detection from system locale.
- **Welcome-thread "detect quiet hours from my activity"** — open implementation question on how quickly the detection becomes confident enough to apply (one week? two? configurable?). Until detection is confident, defaults apply.
- **TUI/CLI mapping** — explicitly deferred; revisit when GUI is stable.
