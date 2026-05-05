# Implementation Status

> **What this is.** A living snapshot of how far the redesign-2026 implementation has gotten, written so a fresh contributor (or a fresh session of an AI assistant) can pick up cleanly without rereading the conversation that produced it. The spec sections (`01-vision.md` … `09-open-questions.md`) are the *what*; this file is the current *how* and *where*.
>
> **Maintenance.** Update when a phase lands, a convention emerges, or a gotcha bites. Stale notes are worse than none — if you see something that no longer matches reality, fix it in the same change as the code.

---

## Where we are in 30 seconds

- **Spec status**: §01–§08 are all in *Draft* and locked for v1. §09 is a living open-questions list. Three rounds of design-critic + spec-keeper passes landed; remaining open questions are either explicitly v2 or section-local.
- **Implementation phase**: foundation is in place + first user-visible UI slice is up. Specifically: schemas, repos, migrations, dev seeder, threads/messages API, inbox view with timeline (messages + inline activity entries).
- **What does NOT exist yet**: any AI runtime / orchestrator / decision-turn loop. Typing in the inbox creates threads but Stina doesn't respond. Event-triggered threads (mail/calendar) are spec'd but no extension calls `emitEvent` yet.
- **Branch**: all work is on `redesign-2026`. Multiple PRs are NOT being used; one long-lived branch with conventional commits is the working model.

---

## What's been built (chronological)

Each row links the commit hash to the kind of work. Read the commit messages for detail — they are intentionally verbose.

| Commit | Phase | What landed |
|--------|-------|-------------|
| `e868db4` … `44c9716` | Spec | Nine sections, three critic+keeper rounds, final audit. ~5500 lines of spec. |
| `7f12d04` | Phase 1 | Scaffolds for `@stina/threads` `@stina/memory` `@stina/autonomy` + shared types in `@stina/core`. SQL migrations land. |
| `83a77dd` | Phase 2a | `@stina/threads`: Drizzle schema, `ThreadRepository`, 17 tests. State-machine validation, monotonic surfacing, auto-revive on activity. |
| `75f72c1` | Phase 2b/2c/3 | `@stina/memory` + `@stina/autonomy`: schemas, repos with §07 hard-rule guards, recall provider registry, activity log. Migrations wired into apps/electron, apps/api, apps/tui. |
| `d017017` … `e93523a` | Phase A (testing) | `@stina/test-fixtures`: factories, three scenarios (`fresh-install`, `typical-morning`, `vacation-mode-active`), seed CLI. 25 tests. |
| `9fbad63` | Phase 4a | `apps/api`: `GET /threads`, `GET /threads/:id`, `GET /threads/:id/messages`, `POST /threads`, `POST /threads/:id/messages`. 19 route tests with stubbed auth. |
| `5d55628` | Phase 4b | `@stina/ui-vue`: `useThreads` composable, `InboxView` + four sub-components, "Inkorgen" navigation entry. Web-only (Electron IPC stubbed). |
| `90707a2` | Phase 4b polish | Activity log entries inline-rendered in thread timeline with severity-driven visual weight. New `GET /threads/:id/activity` endpoint. |
| `77e519c` | Phase 4c | Cross-thread activity log view: `GET /activity` with kind/severity/date filters, `ApiClient.activityLog`, Electron IPC mirror, `ActivityLogView` with chip filters and inspector pane, "Aktivitetslogg" entry in `MainNavigation`. |
| `a2ee75d` | Phase 4d polish | Recap-thread special rendering — amber accent, larger title, briefing-in-card per §05. |
| `b7315d9` | Phase 4d cross-platform | Electron IPC bridge so the desktop app consumes the same threads/messages/activity routes as web. |
| `57c6b82` | Phase 4d docs | `docs/architecture.md` rewritten around the new package layer + three-actor model. |
| `8ddda35` | Phase 5a | `@stina/orchestrator` package + canned-stub decision turn. POST /threads and POST /threads/:id/messages now run a synchronous decision turn that appends a `'stina'`-author reply. Producer is swappable via `threadRoutes` options for the future provider integration. |
| `5153cc8` | Phase 5b | §03 thread-start memory injection. `MemoryContextLoader` reads active standing instructions + profile facts matching `linked_entities` and folds them into `DecisionTurnContext.memory`. Default `DefaultMemoryContextLoader` is wired into `threadRoutes`; the canned stub reports the loaded count so memory is observable end-to-end. Loader is swappable via `threadRoutes` options. |
| `ee58e3a` | Phase 5c | `ProviderProducer` factory in `@stina/orchestrator` — drains a `ChatStreamDispatcher` (sync-wrap), assembles a system prompt from `DecisionTurnContext.memory`, maps the Stina message timeline into role-based `ChatMessage[]` (with §02 trust-boundary wrapper for app-author messages). |
| `2803f7d` | Phase 5d | apps/api wiring closes the loop end-to-end. `threadRoutes` now accepts a `getDecisionTurnProducer(userId)` factory; `server.ts` builds one that looks up the user's default model config (`UserSettingsRepository.getDefaultModelConfigId` → `ModelConfigRepository.get`), confirms the provider extension is currently registered, and dispatches via `ExtensionHost.chat()`. Falls back to the canned stub when extensions are off, no default config is set, or the configured provider isn't loaded — onboarding paths stay usable. |
| `e531784` | Phase 6a | SSE streaming server-side. `runDecisionTurn` accepts an `onStreamEvent` listener; both producers forward `content_delta` events through it, the orchestrator follows up with `message_appended` + `done` (or `error`). Two new endpoints — `POST /threads/stream` and `POST /threads/:id/messages/stream` — hijack the response and emit those events as `data: <json>\n\n` lines. The non-streaming endpoints are unchanged so existing UI keeps working until 6b lands. |
| `7092a6d` | Phase 6b | Streaming end-to-end through both transports + UI. `@stina/api-client` exposes `streamCreate` / `streamAppendMessage` (web: fetch + a small SSE parser; Electron: per-call requestId + `threads-stream-event` IPC channel; remote: inherits the web path). Electron IPC `threads-create` and `threads-append-message` now also run the decision turn — fixing a pre-existing gap where the Electron inbox never produced a Stina reply. `useThreads` switched both flows to streaming with a reactive `streamingDraft`; `InboxView.ThreadDetail` renders the in-flight reply as a placeholder card with a typing indicator (when no chunks arrived yet) or live text + blinking cursor (once chunks start flowing). |
| _next_ | Phase 7a | Agentic tool loop in `createProviderProducer`. New `tools` + `executeTool` options activate the loop: each `tool_start` is collected, executed via the supplied function, and the result is appended as a `role: 'tool'` message before re-dispatching. Capped at `maxIterations` (default 10). New `tool_start` / `tool_end` events extend `TurnStreamEvent` and `ThreadStreamEvent`, propagating through SSE + IPC unchanged. apps/api + apps/electron wire the host's `getAllToolDefinitions()` and `executeToolCrossExtension()` (both promoted from `protected` to public). UI streaming card lists tool calls with a spinning ⚙ during run, ✓ on done, ✕ on error. **No severity gate yet** — high/critical tools execute the same as low/medium. |

**Test count**: 395 tests pass (391 + 4 agentic-loop tests covering happy-path tool execution + result propagation, maxIterations cap, executor-throws → tool_end with `error: true`, and `tools` forwarded on every dispatch). **Typecheck**: clean across all packages and apps.

---

## Architecture in code

The package layer rules from `AGENTS.md` plus the new redesign-2026 packages form this stack (top depends on bottom):

```
apps/{web,electron,api,tui}
        │
        ▼
@stina/chat  ← still owns the legacy single-thread world
        │
        ▼  (chat ALSO depends on the new packages going forward)
@stina/orchestrator  (depends on threads + memory + autonomy)
        │
        ▼
@stina/autonomy  (depends on threads + memory)
        │
        ▼
@stina/memory    (depends on threads)
        │
        ▼
@stina/threads
        │
        ▼
@stina/core      ← types only, no runtime
```

The redesign-2026 packages **cannot import from `@stina/chat`** — that would invert the layer.

The new packages each follow the same skeleton:

```
packages/<name>/
├── package.json           workspace deps + Drizzle + nanoid
├── tsconfig.json          extends ../../tsconfig.base.json
├── tsup.config.ts         ESM+CJS, splitting:false, copies migrations to dist
└── src/
    ├── index.ts           barrel
    ├── db/
    │   ├── index.ts       schema + repo exports + getXxxMigrationsPath()
    │   ├── schema.ts      Drizzle table definitions matching the SQL
    │   ├── repository(ies).ts
    │   └── migrations/
    │       └── NNNN_*.sql
    └── __tests__/
        └── *.test.ts      vitest, in-memory SQLite, applies the package's own migrations
```

Tests apply the package's *own SQL migrations* against an in-memory DB — that way schema drift between SQL and Drizzle would surface immediately.

---

## Conventions that aren't in the spec but matter

These emerged during implementation and are now load-bearing:

### `tsup.config.ts` MUST set `splitting: false` for any package that ships migrations

If chunk splitting is on, tsup hoists `getXxxMigrationsPath()` into a shared chunk at `dist/chunk-*.js`, breaking the `import.meta.url`-based path resolution because the chunk lives at `dist/`, not `dist/db/`. Symptom: app boots, migrations runner silently skips paths that "don't exist", new tables never appear. Mirrors how `@stina/chat` keeps its function inlined.

### No separate DTO layer for redesign-2026 types

The `@stina/core` types (`Thread`, `Message`, `ThreadTrigger`, `AppContent`, …) are *already* the over-the-wire shape: snake_case fields, unix-ms timestamps as numbers, JSON-serializable. The frontend already imports from `@stina/core`. Don't add an `*-dto.ts` parallel hierarchy — extra busywork with two types to keep in sync. If we later need different serialization (e.g. ISO strings), add mappers, not new types.

### Use `resetDatabaseForTests()` in route tests

`closeDb()` from `@stina/adapters-node` resets the connection-layer singleton, but the `appDatabase.ts` layer has its *own* cached `database` variable that survives. Without resetting it, the second test's `initDatabase` returns a Drizzle wrapper around a closed handle — symptom: `"The database connection is not open"`. Pair `closeDb()` and `resetDatabaseForTests()` in `beforeEach`/`afterEach` of any test that swaps DB files.

### Auth stubbing in route tests

Routes use `requireAuth` from `@stina/auth`. Stubbing the real auth service is heavy — the `requireAuth` preHandler only inspects `request.isAuthenticated` and `request.user`, so the standard test pattern is:

```ts
app.decorateRequest('isAuthenticated', false)
app.decorateRequest('user', null)
app.addHook('onRequest', async (request) => {
  ;(request as any).isAuthenticated = true
  ;(request as any).user = { id: 'test-user', role: 'user' }
})
```

See `apps/api/src/routes/__tests__/threads.test.ts` for the canonical example.

### Foreign keys in test SQL

If your migration's `CREATE TABLE` references another package's table (`memory` references `threads(id)`), an in-memory test that only loads *your* package's migrations errors with `"no such table"` at create time — even if FK enforcement is off. Two patterns work:

- **Stub the referenced table**: `sqlite.exec('CREATE TABLE threads (id TEXT PRIMARY KEY)')` before applying memory migrations. See `packages/memory/src/__tests__/memoryRepositories.test.ts`.
- **Apply all packages' migrations together** (the integration pattern). See `packages/test-fixtures/src/__tests__/seed.test.ts`.

### `better-sqlite3` rebuild gotcha

`pnpm install` runs Electron's `postinstall` which rebuilds `better-sqlite3` against Electron's Node ABI. After a fresh install your tests will fail with `NODE_MODULE_VERSION` mismatch. Fix:

```sh
pushd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 \
  && npx --yes prebuild-install && popd
```

Worth automating in `dev-tools/` if it keeps happening.

### Drizzle better-sqlite3 transactions are SYNC

`db.transaction(callback)` accepts a sync callback only — returning a Promise throws `"Transaction function cannot return a promise"`. Inside the callback use `.run()`, `.all()`, `.get()` synchronously, even on `.values()` / `.set()`. See `ThreadRepository.appendMessage` for the working pattern.

### Commit subject must not be PascalCase

Commitlint config rejects subjects like `feat: InboxView landed` because of the capital I. Use lowercase: `feat: inbox view landed`. Body copy is unrestricted.

### `pnpm dev:seed` exit codes

`0` = help / success, `2` = usage error (unknown scenario), `1` = runtime error. Don't let pnpm flag help-mode as a script failure — that creates noise around CLI usage (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`).

---

## Driving the next step (`/redesign-step` skill)

For any meaningful chunk of new work, invoke the project skill at `.claude/skills/redesign-step.md`. It scripts a four-role team — project lead (you), critic (challenges the brief before code), implementer (writes the code), reviewer (compares output against the spec) — with explicit quality gates that fresh sessions otherwise tend to skip. Use it for any step that adds a schema, route, UI surface, or orchestrator wiring. Skip it only for pure cosmetics.

Trigger phrases the skill recognizes: `/redesign-step`, "kör nästa redesign-steg", "fortsätt på redesign-2026", "next redesign step". You can pass an explicit task ("ExtensionThreadHints wiring") or leave it open and let the skill propose from this doc's "Natural next steps".

## Dev workflow

### Visual exploration with seeded data (no AI required)

```sh
DB_PATH=/tmp/stina-demo.db pnpm dev:seed typical-morning --fresh
DB_PATH=/tmp/stina-demo.db STINA_MASTER_SECRET=dev pnpm dev:web
# open http://localhost:3002, log in, click "Inkorgen"
```

Three scenarios are registered: `fresh-install`, `typical-morning`, `vacation-mode-active`. Add new ones in `packages/test-fixtures/src/scenarios/`.

### Tests

```sh
pnpm test                    # full suite, currently 334 tests
pnpm test packages/threads   # path filter
pnpm typecheck               # global typecheck
```

### When migrations land

Each package owns numbered SQL migrations under `src/db/migrations/`. The runner in `@stina/adapters-node` picks them up via `getXxxMigrationsPath()` exports. Apps must register the new package's path in their `initDatabase({ migrations: […] })` call — three apps to update: `apps/api`, `apps/electron`, `apps/tui`.

---

## Natural next steps

Rough effort labels: **S** = single sitting, **M** = multi-sitting, **L** = multi-day.

### Polish track (visual / UX)

1. ~~**Recap-thread special rendering**~~ — landed in `a2ee75d`; the recap-trigger thread now renders with the §05 amber accent + larger title + briefing-in-card.
2. **Severity rendering on tool calls** [S] — when `StinaMessage.content.tool_calls` are present, render them with the §05 severity table. No tools fire from the UI yet so nothing shows.
3. **`ExtensionThreadHints` wiring** [M] — extensions can declare card icon/accent/style at install time per §05/§06. Schema is ready; needs install-dialog validation and runtime resolution.
4. ~~**Activity log under ☰**~~ — landed as `ActivityLogView`; v1 ships with kind / severity / dream-pass / auto-action filter chips and a JSON-payload inspector. Tool / extension filter chips and date-range UX deferred (the API supports `after`/`before` so it's a UX iteration). The ☰ menu doesn't exist yet — for v1 the entry sits next to "Inkorgen" in `MainNavigation`.

### Runtime track (closing the loop)

5. ~~**Stub Stina echo loop**~~ — landed; `@stina/orchestrator` ships the synchronous decision-turn entry point with a swappable `DecisionTurnProducer`. The v1 stub appends a canned acknowledgement after every user-authored post to a thread. SSE streaming is intentionally NOT wired yet — sub-millisecond stub latency doesn't justify it; that part lands with item 6 when real model latency shows up.
6. ~~**Real Stina with provider**~~ — landed in Phases 5b–6b. `DecisionTurnContext.memory` carries active standing instructions + linked-entity profile facts (5b); `createProviderProducer` assembles a system prompt + role-based `ChatMessage[]` and drains a `ChatStreamDispatcher` (5c); apps/api wiring resolves the user's default model config and dispatches via `ExtensionHost.chat()`, with safe fallback to the canned stub when no model is configured (5d); SSE streaming is wired server-side via `POST /threads/stream` and `POST /threads/:id/messages/stream` endpoints (6a); UI now consumes the stream end-to-end through both web (fetch + SSE) and Electron (IPC `threads-stream-event`) transports, with a placeholder Stina card that renders the live reply (6b). **Loose end remaining**: tool calls (`tool_start` / `tool_end`) are still ignored — routing them through the §06 severity gate is item 7.
7. **Tool call routing with severity gate** [M] — agentic execution itself landed in Phase 7a (loop, fan-out per tool_start, result fed back). The severity gate part is what's still open: §06 collision handling (severity check, auto-policy lookup, escalate / skip / solve-differently) and `auto_action` / `action_blocked` activity log entries. Today the producer trusts every tool the host exposes — fine for `low` / `medium` but a gap for `high` / `critical`.
8. **Event-triggered threads from extensions** [L] — `emitEvent` in the extension API, runtime spawns thread, runs decision turn. The mail extension is the obvious first event source.

### Cross-platform / migration track

9. ~~**Electron IPC bridge for threads**~~ — landed in `b7315d9`; both web and electron consume the same threads / messages / activity routes via their respective transports.
10. **§08 migration runner** [M] — pre-migration backup, structured progress marker, sanity checks, the legacy-thread split heuristic. Needed before v1 ships.
11. **Playwright suite (Phase B)** [M] — the `@stina/test-fixtures` seed pattern is ready to drive deterministic UI tests; harness needs to be set up.

### Documentation track

12. ~~**`docs/architecture.md` rewrite**~~ — landed in `57c6b82`; rewritten around the new package layer, three-actor model, and lifecycle diagram.
13. **Developer guides** [M] — `adding-an-event-source-extension.md`, `adding-a-recall-provider.md`, `adding-a-tool-with-severity.md`, `writing-a-migration.md` per §09's "Documentation deliverables".
14. **`stina.app` user docs** [L] — the public-facing user docs subsite per §09. Owned by maintainers; not a code task.

---

## Specific gotchas worth remembering

- **The `app` author trust boundary is structural.** `AppMessage.content` is `AppContent` (typed kind), not free text. Don't introduce a `string`-content escape hatch — that re-opens the prompt-injection vector §02 closed.
- **`mark*` helpers are monotonic.** `markSurfaced` and `markNotified` both no-op on second call. The intent is "set if not set"; do not refactor to "always update".
- **Dream-pass-origin mutations must use the guarded methods.** `mutateAsDreamPass` and `deleteAsDreamPass` exist in the memory repos for a reason — they enforce the §07 hard rule. Calling raw `update()` from a dream-pass code path bypasses the guard silently.
- **The `auto_action` activity-log kind requires policy + tool traceability.** Don't reuse it for "Stina did a thing" generally; that breaks recap rendering and audit semantics. If you need a different shape, add a new kind to the union in `@stina/core/autonomy/types.ts`.
- **Migrations use the existing `_migrations` table.** Each migration is named `<package>/<file>` (the runner derives the package name from the path). The `<package>` portion is part of the dedup key — never rename a package without thinking about whether old migrations need a compatibility shim.

---

## Where to look for things

| You want | Look in |
|----------|---------|
| Schema definition | `packages/<pkg>/src/db/schema.ts` |
| SQL migrations | `packages/<pkg>/src/db/migrations/*.sql` |
| Repository / runtime logic | `packages/<pkg>/src/db/repositories/` |
| Decision-turn orchestration | `packages/orchestrator/src/runDecisionTurn.ts` |
| Decision-turn producers (swappable) | `packages/orchestrator/src/producers/` |
| Thread-start memory loading (§03) | `packages/orchestrator/src/memory/MemoryContextLoader.ts` |
| Provider wiring (per-user model config) | `apps/api/src/redesignProvider.ts` |
| Shared types | `packages/core/src/<domain>/types.ts` |
| API routes | `apps/api/src/routes/threads.ts` (and friends) |
| API client | `packages/api-client/src/{types,client}.ts` |
| Vue components | `packages/ui-vue/src/components/views/InboxView.*` |
| State management for inbox | `packages/ui-vue/src/composables/useThreads.ts` |
| Test fixtures / scenarios | `packages/test-fixtures/src/scenarios/` |
| Seed CLI | `packages/test-fixtures/scripts/seed-dev-db.ts` |
| Specs (canonical) | `docs/redesign-2026/0X-*.md` |

---

## How to verify the world is healthy

```sh
pnpm typecheck && pnpm test
```

Should print 395 tests passed, no typecheck errors. If either fails, that's the regression to fix before doing anything else.

A quick smoke test that the app actually boots and migrations land:

```sh
DB_PATH=/tmp/stina-smoke.db pnpm dev:seed typical-morning --fresh
sqlite3 /tmp/stina-smoke.db "SELECT COUNT(*) FROM threads"   # → 7
sqlite3 /tmp/stina-smoke.db ".tables"                         # all redesign-2026 tables present
```

If migrations fail to apply (no new tables), check that the new package's `tsup.config.ts` has `splitting: false`. That's the most common breakage.
