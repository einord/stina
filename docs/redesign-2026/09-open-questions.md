# 09 — Open Questions

Cross-cutting questions that don't fit a single section, plus a running list of decisions we've deferred.

Section-local questions live in the "Open questions" section of each individual file.

## Cross-cutting

- **Success metrics.** What does "the redesign worked" look like? Candidates: fewer interruptions per day, faster time-to-first-action on incoming events, number of auto-policies created, qualitative user-reported focus. Need a primary metric before implementation.
- **Telemetry for success metrics**: §08 already specifies opt-in beta-channel migration telemetry (Inställningar → Telemetri). The remaining open question is whether we want a *separate* runtime telemetry channel for ongoing success-metric data (interruption counts, auto-policy adoption, etc.), or whether qualitative user feedback is enough.

**Resolved (recorded elsewhere):**
- ~~**Documentation surface**~~ — both: developer docs at `/docs` (existing structure expanded) and user docs at `stina.app` (new section). See "Documentation deliverables" below for the per-target checklist.
- ~~**Tutorial / onboarding**~~ — §05's revised first-launch is **conversational onboarding led by Stina herself**: she introduces herself, asks what the user wants help with, and learns about them through dialogue. Setup actions appear inline when Stina raises them in conversation, capped at three. No additional video/walkthrough/tour on top in v1; we trust the conversation + the design's self-explanatory shape. Revisit only if real-user feedback says the welcome conversation isn't enough.

## Deferred decisions

These are intentional defers — we agreed to think about them after v1 ships.

- **Cost-per-event optimization** (two-tier triage with cheap classifier). Phase 2.
- **Thread grouping / projects**. Wait until thread sprawl is observed, then design.
- **Cross-thread reference clickability** in UI. Decided to handle in recap for now.
- **Multi-user / shared threads**. Out of scope for redesign.

## Documentation deliverables

Two target audiences, two deliverables, both required before v1 release.

### Developer documentation — `/docs/`

The existing `docs/` structure (`architecture.md`, `guides/`, `patterns/`) expands. Required updates:

- **`docs/architecture.md`** — rewritten to reflect the new package layer (`packages/threads`, `packages/memory`, `packages/autonomy` alongside `core` and `chat`); the three-actor message model; severity scale; lifecycle (event → decision turn → surfacing); concurrency model.
- **`docs/redesign-2026/`** — these design specs stay as historical design rationale and are linked from `architecture.md`. They are the *why*; the new architecture page is the *what is now true*.
- **New guides under `docs/guides/`**:
  - `adding-an-event-source-extension.md` — `emitEvent`, typed `AppContent`, severity declaration, redactor, `ExtensionThreadHints`
  - `adding-a-recall-provider.md` — `registerRecallProvider`, scope, ranking
  - `adding-a-tool-with-severity.md` — manifest, redactor, lock-level semantics
  - `writing-a-migration.md` — per-package migration pattern, the runner contract, dry-run testing
- **Updated patterns under `docs/patterns/`**:
  - `signal-flow.md` — updated for the inbox model (was previously single-thread)
  - `chat-session-manager.md` — repurposed or replaced (the single-session concept is gone)
  - New `inbox-render.md` — how trådkort + thread detail + activity log entries compose
  - New `memory-extraction.md` — the prompt-driven model, conflict resolution, recall flow
- **`AGENTS.md`** — package layer rules table updated with the three new packages.

### User documentation — `stina.app`

The current site is a single landing page. v1 adds a `/docs/` subsection with user-facing explanations, written warmly with screenshots. Required pages:

- **What is Stina?** — refreshed for the inbox model (replaces or rewrites the existing landing copy)
- **Inkorgen** — what threads are, how they appear, what segments mean (Active / Quiet / Silently handled / Archived), how to read a trådkort
- **Recap** — what the morning recap covers, how to configure timing and quiet hours, what the flags and suggestions mean
- **Stinas minne** — the two memory types in user-friendly language, how to view and edit them, what dream pass does at night
- **Autonomi och förtroende** — the severity scale in plain language, auto-policies, how to grant and revoke
- **Tillägg** — what extensions are, how to install, severity at install time, the registry
- **Säkerhet och din data** — local-first, what's stored where, backups, what telemetry exists (and how to turn it off)
- **Uppgradera från v0.x** — the migration story for existing users; backup, what changes, how to roll back if needed (mirrors the §08 user-facing guidance)

Tone: warm, present-tense, screenshots over diagrams where possible. The voice should match Stina's own — calm, accessible, never patronising.

### When the doc work happens

The doc work happens **alongside the implementation phases**, not as a final block:

- A package being implemented → its developer guide is drafted in the same iteration
- A user-facing surface (recap, inkorg, autonomi) being built → its user-doc page is drafted from the v1 working copy
- v1 release blocked until all required pages above are at a "ready for users" quality bar

Maintainers own this; not a community contribution to chase. A short doc-coverage checklist gates the v1 release.

## Process

- **When does the spec freeze?** We should pick a moment to declare "design is locked, implementation begins" — otherwise the spec keeps drifting and nothing ships.
- **Review checkpoints**: do we run a critique pass on the full spec before any code, after data model is implemented, or both?
