# Stina Architecture

This document describes the Stina codebase as it is *today*. Stina is a local-first AI assistant that runs on the user's machine, keeps data local, and connects to AI providers (Ollama, OpenAI, …) through extensions. It ships as multiple frontends — a Vue web app, an Electron desktop app, and a CLI/TUI — all backed by the same TypeScript packages in a pnpm monorepo.

The architecture is in the middle of a redesign (`redesign-2026`). The legacy single-thread chat surface still exists and is described here verbatim. The new redesign-2026 packages (`@stina/threads`, `@stina/memory`, `@stina/autonomy`) live alongside it and are described here too. Both worlds compile, run, and ship in the same binaries until §08 retires the legacy surface.

The canonical specs for the redesign live in [`docs/redesign-2026/`](./redesign-2026). This doc points at them rather than reproducing them. For "what is built right now and where to find it", see [`docs/redesign-2026/IMPLEMENTATION-STATUS.md`](./redesign-2026/IMPLEMENTATION-STATUS.md).

## Table of Contents

- [Top-level overview](#top-level-overview)
- [Layer diagram](#layer-diagram)
- [Mental model: three actors](#mental-model-three-actors)
- [Data model summary](#data-model-summary)
- [Lifecycle of a triggered thread](#lifecycle-of-a-triggered-thread)
- [Severity scale](#severity-scale)
- [Concurrency model](#concurrency-model)
- [Persistence](#persistence)
- [Extensions](#extensions)
- [Streaming and the ApiClient pattern](#streaming-and-the-apiclient-pattern)
- [Implementation status](#implementation-status)

---

## Top-level overview

- **Local-first.** All user data — chat, threads, memory, settings, extension data — lives in a SQLite database on the user's machine. There is no Stina-owned server-side store.
- **Multi-frontend.** The same shared logic backs three frontends: `apps/web` (Vue 3 + Vite), `apps/electron` (Electron main + renderer), and `apps/tui` (Commander CLI). `apps/api` (Fastify) is the HTTP backend for the web app.
- **TypeScript monorepo.** pnpm workspaces, a single tsconfig base, ESM throughout (`.js` extension in imports). Packages are layered — see below — and apps are thin wrappers that wire packages together.
- **Two environment layers.** Browser code (Vue + the `@stina/ui-vue` package) cannot import Node.js code; Node.js code (everything else) cannot import Vue. Apps live on whichever side they need.
- **Extensions.** AI providers and feature add-ons (mail, people, work, …) load as sandboxed extensions in worker threads. The host enforces a permission system; extensions speak only over a well-defined IPC.

Ports during development: API `3001`, Web dev server `3002`, Electron renderer dev server `3003`.

---

## Layer diagram

The package stack as of today, including the redesign-2026 packages. Top depends on bottom; siblings at the same level do not depend on each other (with one documented exception for `chat ↔ threads/memory/autonomy`, see below).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser Layer                                   │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         packages/ui-vue                                │  │
│  │              (Shared Vue Components, Theme, ApiClient)                 │  │
│  └─────────────────────────┬───────────────────────┬─────────────────────┘  │
│                            │                       │                         │
│                            ▼                       ▼                         │
│                     ┌────────────┐          ┌─────────────┐                  │
│                     │  apps/web  │          │  Electron   │                  │
│                     │   (Vue)    │          │  Renderer   │                  │
│                     └──────┬─────┘          └──────┬──────┘                  │
│                            │                       │                         │
└────────────────────────────┼───────────────────────┼─────────────────────────┘
                             │ HTTP                  │ IPC
                             ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Node.js Layer                                   │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────────────────┐    │
│  │  apps/api   │  │  apps/tui   │  │      apps/electron (main)         │    │
│  │  (Fastify)  │  │   (CLI)     │  │          (Node.js)                │    │
│  └──────┬──────┘  └──────┬──────┘  └────────────────┬──────────────────┘    │
│         └────────────────┼────────────────────────────┘                      │
│                          ▼                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          packages/chat                                │   │
│  │       (legacy single-thread orchestrator; consumes the stack         │   │
│  │        below going forward, cannot be reached *into* from below)      │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │   packages/autonomy   (depends on threads + memory)                   │   │
│  │   packages/memory     (depends on threads)                            │   │
│  │   packages/threads    (foundation of redesign-2026)                   │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │   packages/extension-host, packages/adapters-node                     │   │
│  │   packages/auth, packages/builtin-tools, packages/scheduler           │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          packages/core                                │   │
│  │             (Pure TypeScript: business logic, interfaces,            │   │
│  │              redesign-2026 type definitions)                          │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         packages/shared                               │   │
│  │                          (DTOs, types)                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

The exact import rules (canonical in [AGENTS.md](../AGENTS.md) §"Package Layer Rules"):

| Package | Environment | Can Import | Cannot Import |
|---------|-------------|------------|---------------|
| `packages/core` | Pure TypeScript | shared, i18n | Node.js APIs, Vue, browser APIs |
| `packages/threads` | Node.js | shared, core, Node.js APIs | Vue, browser APIs, chat |
| `packages/memory` | Node.js | shared, core, threads, Node.js APIs | Vue, browser APIs, chat |
| `packages/autonomy` | Node.js | shared, core, threads, memory, Node.js APIs | Vue, browser APIs, chat |
| `packages/chat` | Node.js | shared, core, i18n, threads, memory, autonomy, Node.js APIs | Vue, browser APIs |
| `packages/ui-vue` | Browser | shared, core (types only), Vue | Node.js APIs |
| `packages/adapters-node` | Node.js | shared, core, Node.js APIs | Vue, browser APIs |

The redesign-2026 stack (`threads → memory → autonomy`) sits *under* `chat`. `chat` may consume it; the new packages may not import `chat`. Inverting that layer would couple the new packages to the legacy world we're trying to replace. See [§08 Migration §"Package decomposition"](./redesign-2026/08-migration.md).

---

## Mental model: three actors

The single biggest shift in the redesign is replacing "user ↔ assistant in one thread" with three actors across many threads. From [§01 Vision §"Mental model: three actors"](./redesign-2026/01-vision.md#mental-model-three-actors):

| Actor | Role |
|-------|------|
| **app** | Neutral, factual events from the system or extensions ("New mail from Peter") |
| **stina** | The agent — judges, decides, acts, sometimes stays silent |
| **user** | The human — initiates threads, replies, gives instructions |

The flow for triggered events is:

```
event → app speaks → stina decides → (silence | user gets notified)
```

**Stina is always the decider.** The app never speaks to the user directly; it speaks to Stina, who chooses whether to escalate. This is the inversion compared to the legacy chat: today an extension that wanted to tell the user something had to insert a chat message; in the new world it emits a typed event into a fresh thread, and Stina is the one who chooses to surface or silence.

For user-initiated work the order is the obvious one: user → stina → user. The legacy `@stina/chat` package only knows that flow; the new packages know all three.

The principles that fall out of this model — silence as a valid action, transparency over magic, progressive autonomy, deterministic safety floors — are spelled out in [§01 §"Core principles"](./redesign-2026/01-vision.md#core-principles).

---

## Data model summary

The redesign introduces two first-class concepts and a typed memory layer. Full schema in [§02 Data Model](./redesign-2026/02-data-model.md).

- **`Thread`** — a self-contained conversation with a `trigger` (user / mail / calendar / scheduled / stina), a `status` (`active | quiet | archived`), and monotonic `surfaced_at` / `notified_at` audit timestamps. Many threads coexist; the inbox is a list of them. See [§02 §"Thread"](./redesign-2026/02-data-model.md#thread).
- **`Message`** — a discriminated union over three authors: `UserMessage`, `StinaMessage`, `AppMessage`. Each message carries `visibility: 'normal' | 'silent'` so Stina's internal reasoning can live in the thread without surfacing in the default UI. See [§02 §"Message"](./redesign-2026/02-data-model.md#message).
- **`AppContent`** — the trust boundary. `AppMessage.content` is a typed payload (`{ kind: 'mail', from, subject, snippet, mail_id }`, `{ kind: 'calendar', … }`, …), never free text from an external source. The runtime renders these into the model context inside an explicit untrusted-data wrapper so prompt-injection attacks via mail subjects or calendar titles can't rewrite Stina's instructions. This is a structural decision, not a runtime convention. See [§02 §"Why `AppContent` is structured, not free text"](./redesign-2026/02-data-model.md#message).
- **Memory** — three typed shapes that live alongside (not inside) chat history: `StandingInstruction` (active rules with scope and validity), `ProfileFact` (stable facts retrieved on demand), `ThreadSummary` (1-3 sentences generated by the dream pass when a thread goes quiet). See [§02 §"Memory"](./redesign-2026/02-data-model.md#memory).
- **`AutoPolicy`** — per-context permission to invoke a `high`-severity tool automatically. Always bound by scope, always logged, never created silently in non-user-triggered threads. `critical`-severity tools cannot be auto-policied at all. See [§02 §"Auto-policy"](./redesign-2026/02-data-model.md#auto-policy).
- **`ActivityLogEntry`** — the unified audit log. Every silenced event, every auto-action, every memory change, every dream-pass run, every migration step. Inline-rendered in its thread at `created_at` position; also surfaced in recap and settings. Default retention 365 days. See [§02 §"Activity log entry"](./redesign-2026/02-data-model.md#activity-log-entry).

The legacy chat data model (single conversation, messages with `role: 'user' | 'assistant'`) still exists in `@stina/chat`. The new packages do not migrate it in place; that is §08's responsibility.

> **Convention**: redesign-2026 types in `@stina/core` are *already* the over-the-wire shape (snake_case fields, unix-ms numeric timestamps, JSON-serializable). There is no parallel DTO hierarchy. See [IMPLEMENTATION-STATUS §"No separate DTO layer"](./redesign-2026/IMPLEMENTATION-STATUS.md#no-separate-dto-layer-for-redesign-2026-types).

---

## Lifecycle of a triggered thread

When an extension emits an event (or a scheduled job fires, or the runtime itself spawns an internal thread), the lifecycle is:

```
emitEvent(input)
   │
   ▼
Thread created (status=active, surfaced_at=null, notified_at=null,
                invisible to all UI surfaces until first turn finishes)
   │
   ▼
AppMessage written (typed AppContent, source=extension)
   │
   ▼
Stina's decision turn runs
   │   inputs: active standing instructions
   │           profile facts matching trigger entities
   │           trigger payload (in untrusted-data wrapper)
   │           tool manifests with severity
   │
   ▼
Closing action (exactly one is mandatory)
   ├── normal Stina message  ───► thread surfaces, notification fires
   ├── silent reasoning + 'event_silenced' log entry  ───► thread stays background
   └── 'action_blocked' (collision handling: escalate / skip / solve differently)
```

Key invariants:

- **One event = one thread.** No coalescing in v1.
- **Pending first turn is invisible.** The thread exists as a data record from the moment `emitEvent` resolves, but no UI surface (inbox, background filter, search) shows it until the first decision turn completes — successfully or by failure-mode framing. This avoids races between Stina's reasoning and a user reply.
- **Surfacing is monotonic.** Once `surfaced_at` is set it cannot be cleared. `notified_at` is independent and may differ from `surfaced_at` when a per-extension or per-trigger-kind notification rule suppresses the notification, or when degraded mode aggregates several failures behind one notification.
- **Failure mode is explicit.** A model error, malformed output, or normalization tripwire surfaces the thread with a `system`-kind framing message and an `event_handled` log entry with `details.failure: true`. The runtime does not auto-retry — the user re-engaging the thread is the retry signal. A cascade of failures (≥5 same-class errors in 60s) flips the runtime into **degraded mode**, which aggregates notifications until the next successful turn.

Full details in [§04 Event Flow](./redesign-2026/04-event-flow.md).

---

## Severity scale

Every tool declares a single `severity` in its manifest. The same field drives both UI rendering and the approval flow — there is no separate "lock" or "visibility" attribute, deliberately, so the two dimensions cannot drift out of sync.

| Level | UI rendering | Approval behavior |
|-------|--------------|-------------------|
| `low` | Barely visible (collapsed grey row) | Always executes silently |
| `medium` | Visible but unobtrusive | Always executes; appears in thread |
| `high` | Prominently rendered with accent | Auto-executes if a matching `AutoPolicy` exists; otherwise asks (or escalates per §06 collision handling) |
| `critical` | Blocking modal | Always asks; **can never be auto-policied** |

The user can override an extension-declared severity *upward* via the per-extension settings view (mark a `medium` tool as `critical`). They cannot lower it below what the extension declared. v1 trusts the extension's declaration; future hardening (a Stina-core severity floor, a `risk_class` enum) is deferred but the schema does not preclude it.

When a standing instruction wants Stina to act in a non-user-triggered thread but the action's severity exceeds what's authorized, Stina must explicitly choose between **Escalate** (surface and ask), **Skip** (log `'action_blocked'`, take no action), or **Solve differently** (use a lower-severity alternative — save draft instead of send, schedule for later, mark-as-read instead of reply). Silent failure is forbidden; the chosen alternative is recorded.

Full table, install-time consent flow, policy creation and revocation, and severity-change cascades are in [§06 Autonomy](./redesign-2026/06-autonomy.md).

---

## Concurrency model

Three concurrency primitives, designed to be boring in the common case:

- **Per-thread FIFO queue.** Each thread has at most one in-flight Stina turn at a time. Incoming events targeting the same thread, user replies, follow-up app messages — all enqueued. The head is processed; on completion, the next item runs. Failures pause the queue without dropping items.
- **Cross-thread worker pool.** Different threads run independently up to a configurable pool size (defaults sized for local model throughput). This is where "Stina seems to be doing several things at once" comes from.
- **Memory single-writer.** All writes to standing instructions, profile facts, thread summaries, and auto-policies serialize through a single writer regardless of which thread requested them. This avoids cross-thread races on shared memory state.
- **Append-only crash-safe activity log.** Entries are written *before* the action completes. A crash mid-action leaves a "started" entry that the recovery path can reconcile.
- **Drizzle better-sqlite3 transactions are sync.** `db.transaction(callback)` accepts a sync callback only — returning a promise throws. Inside the callback `.run()` / `.all()` / `.get()` are sync. This is a load-bearing property of the persistence layer; `ThreadRepository.appendMessage` is the canonical example.

Full details in [§04 §"Concurrency model"](./redesign-2026/04-event-flow.md#concurrency-model-per-thread-fifo-queue); the memory-layer single-writer rule is owned by [§03 Memory](./redesign-2026/03-memory.md).

---

## Persistence

- **Engine.** SQLite via `better-sqlite3`, accessed through Drizzle ORM. Single database file per user; path is configurable through `DB_PATH`.
- **Connection management.** `@stina/adapters-node` owns the connection (`getDb`, `closeDb`). Every Node.js app initializes the database on startup and registers the migration paths for every package that ships migrations.
- **Per-package migrations.** Each package that owns persistent state owns its migrations under `src/db/migrations/NNNN_*.sql`. The redesign-2026 packages (`@stina/threads`, `@stina/memory`, `@stina/autonomy`) follow the same pattern as `@stina/chat` and `@stina/scheduler` before them.
- **Migration runner.** `runMigrations(db, migrationsPaths[])` in [`packages/adapters-node/src/db/migrate.ts`](../packages/adapters-node/src/db/migrate.ts). It scans each path, applies any `*.sql` file not already in the `_migrations` table, and inserts the applied entry under the name `<package>/<file>`. The package portion is derived from the path. All migrations across all packages are sorted by their full name before applying so order is deterministic.
- **App wiring.** Three apps register migration paths: `apps/api`, `apps/electron` (main), and `apps/tui`. When a new package adds migrations, all three must be updated. See [IMPLEMENTATION-STATUS §"When migrations land"](./redesign-2026/IMPLEMENTATION-STATUS.md#when-migrations-land).
- **Drizzle schema mirrors SQL.** Each package keeps a `schema.ts` Drizzle definition alongside the SQL migration. Tests apply the package's *own SQL migrations* against an in-memory SQLite, which means schema drift between SQL and Drizzle surfaces immediately.
- **`splitting: false` is required.** Any package that ships migrations must set `splitting: false` in its `tsup.config.ts`. With chunk splitting on, tsup hoists the `getXxxMigrationsPath()` helper into a shared chunk under `dist/`, breaking the `import.meta.url`-based path resolution. Symptom: app boots, migrations runner silently skips paths that "don't exist", new tables never appear. See [IMPLEMENTATION-STATUS §"`tsup.config.ts` MUST set `splitting: false`"](./redesign-2026/IMPLEMENTATION-STATUS.md#tsupconfigts-must-set-splitting-false-for-any-package-that-ships-migrations).

---

## Extensions

The existing extension system survives unchanged. Extensions still:

- Declare a `manifest.json` with permissions and contributions
- Build to a single bundle and load into a sandboxed worker thread
- Speak only over the IPC defined by `@stina/extension-api` against the host in `@stina/extension-host`
- Register providers (`AIProvider`), tools, actions, scheduler jobs, etc. against typed permissions

What's *spec'd* for the redesign but **not yet wired**:

- **`emitEvent(input)`** — the capability that lets an extension spawn an event-triggered thread. Schema and lifecycle in [§04 §"Extension API: `emitEvent`"](./redesign-2026/04-event-flow.md#extension-api-emitevent). No extension calls it yet.
- **`registerRecallProvider`** — the capability that lets an extension answer recall queries about its own data. Spec'd in [§02 §"Recall API"](./redesign-2026/02-data-model.md#recall-api) and [§08](./redesign-2026/08-migration.md). Not implemented.
- **`ExtensionThreadHints`** — install-time declarations of card icon / accent / style per trigger kind. Spec'd in [§05](./redesign-2026/05-ui-ux.md) and [§06](./redesign-2026/06-autonomy.md). Schema is ready; install-dialog validation and runtime resolution are not.
- **`severity` on tool manifests** — every tool will declare one of `low | medium | high | critical`. Today's tools predate the field. Spec'd in [§02 §"Tool severity"](./redesign-2026/02-data-model.md#tool-severity).

The migration path from today's chat-message-based interaction model to the event-flow model is described in [§08 Migration](./redesign-2026/08-migration.md). During the migration window both surfaces coexist.

---

## Streaming and the ApiClient pattern

These two patterns predate the redesign and are unchanged. They're load-bearing — every frontend feature touches one or both.

**ApiClient.** `@stina/ui-vue` defines an `ApiClient` interface that abstracts the transport. The web app implements it over HTTP (`fetch` against `apps/api`); the Electron renderer implements it over IPC against the Electron main process. Vue components depend on the interface and never know which transport they're on. Same components, two transports, no fork.

**Streaming.** Chat responses stream as a sequence of typed events (`token`, `thinking`, `tool_call`, `tool_result`, `complete`, `error`, `state_change`). The web path streams over Server-Sent Events through `apps/api`; Electron and TUI run `ChatOrchestrator` directly and forward events via IPC or stdout. The platform-neutral orchestrator lives in `@stina/chat`.

The redesign-2026 inbox uses the same `ApiClient` interface. New routes (`GET /threads`, `GET /threads/:id`, `GET /threads/:id/messages`, `POST /threads`, `POST /threads/:id/messages`, `GET /threads/:id/activity`) are wired in `apps/api`, and the Electron IPC bridge mirrors them in `apps/electron/src/main/ipc.ts` so the renderer's IPC client works against the same data the web app sees. When an actual decision-turn loop lands behind these routes, it will reuse the SSE streaming path that the legacy chat already uses.

---

## Implementation status

This document describes the architecture's *shape*. For **what is actually wired vs. spec'd today** — phase-by-phase commit log, conventions that emerged during implementation, gotchas, and the natural-next-steps menu — see:

> [`docs/redesign-2026/IMPLEMENTATION-STATUS.md`](./redesign-2026/IMPLEMENTATION-STATUS.md)

In short, as of this writing: schemas / repositories / migrations / dev seeder / threads + messages API / inbox view with inline activity entries are all in. The decision-turn loop (Stina actually responding) is the next big runtime piece; no AI runtime exists in the redesign-2026 stack yet, and no extension calls `emitEvent` yet. Typing in the inbox creates threads, but Stina doesn't reply.

The legacy `@stina/chat` package and its single-thread world are still the production chat surface. They will be retired by §08's migration once the redesign reaches feature parity; until then both worlds compile, run, and ship together.

For "where do I look when I'm working on X?" the table at the bottom of IMPLEMENTATION-STATUS is the answer.
