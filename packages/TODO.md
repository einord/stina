# Store/DB refactor TODO

- [ ] **Decisions**
  - [x] Use `.stina/stina.db` as the DB file (updated in `packages/store/src/database/index.ts`).
  - [ ] Split packages into `@stina/chat`, `@stina/todos`, `@stina/memories`, etc.; keep `@stina/store` narrowly focused on DB/state orchestration.

- [ ] **Core store infrastructure**
  - [ ] Replace the current ad-hoc `initDatabaseTable` + `emit('init')` pattern with an explicit registration API (e.g. `store.registerSchema(name, tableFactory)` or a module bootstrap hook) so modules can declare schemas without relying on import side effects.
  - [ ] Tighten typings around `initDatabaseTable` so Drizzle table types flow through without falling back to `any`, and allow definition of indexes/uniques/defaults/constraints (right now `ensureSqliteTable` ignores Drizzle indexes and only creates tables if missing).
  - [ ] Add a minimal migration story for schema changes (e.g. add columns without dropping tables, run ALTERs once, similar to the old `ensureInteractionSchema` in `packages/store/src/index.ts`).
  - [ ] Re-introduce cross-process change notifications or another reactive mechanism so multiple clients stay in sync (the old store watched the SQLite file and emitted updates; the new store lacks cache + watchers entirely).
  - [ ] Decide on a standard place for shared tables like `kv` (used for counter and active conversation id); either a small `packages/kv` module or part of the core store infra.
  - [ ] Define a formal module bootstrap contract: each module exports `register(store)` (or similar) that registers its schema and returns its repository API; `@stina/store` loads modules in one place instead of depending on side-effect imports.

- [ ] **Chat module (`packages/chat`)**
  - [ ] Fix schema issues: `conversationId` is marked `unique` in `store.ts`, which prevents multiple interactions per conversation; drop the unique constraint and consider a dedicated `conversations` table with metadata (title, created_at, active flag).
  - [ ] Add indexes/foreign key actions (e.g. cascade deletes on `interaction_messages.interactionId`) and defaults for timestamps/booleans so inserts do not require every field.
  - [ ] Mirror the old store capabilities: generate conversation ids, track current conversation id (kv), `startNewConversation`, `withInteractionContext`, `appendMessage`/`appendInfoMessage`/`appendInstructionMessage`, pagination (`getMessagesPage`), counts, and flattened history helpers.
  - [ ] Emit events when chat data changes so desktop/TUI/CLI UIs can subscribe (they currently rely on `store.onInteractions` etc.). Define the contract (per-table events vs. aggregated snapshots).
  - [ ] Align message typings with the old `ChatRole`/`InteractionMessage` shape (provider/debug/aborted fields) or adjust upstream consumers (`packages/core/src/chat.ts`, providers, UI components) to the new types.
  - [ ] Update `packages/core/src/chat.ts` (ChatManager) to depend on the new chat module instead of `@stina/store/index.ts` APIs; ensure streaming/abort flow still works.

- [ ] **Todos module**
  - [ ] Port `packages/store/src/todos.ts` to the new pattern using Drizzle tables registered via the core store. Define enums for status, maintain comment table + indexes, and keep typed return values.
  - [ ] Provide change notifications (today `setTodoChangeListener` triggers store caches) and decide whether the todo module owns its own emitter or feeds a shared store emitter.
  - [ ] Remove reliance on `registerToolSchema` once migrated; delete the old toolkit when no longer needed.

- [ ] **Memories module**
  - [ ] Port `packages/store/src/memories.ts` to Drizzle + module-local schema registration. Preserve JSON metadata handling and the migration that adds the `title` column.
  - [ ] Add indexes and change events similar to todos; make sure the memory tool definitions (`packages/core/src/tools/definitions/memories.ts`) keep type safety via Drizzle `Infer*Model`.

- [ ] **KV / counter / misc state**
  - [ ] Extract the kv table (counter + active conversation id) into its own module with Drizzle schema and a small API: `get/set`, `subscribe`, `increment`.
  - [ ] Decide whether conversation id belongs here or in a `conversations` table; update ChatManager + UIs accordingly.

- [ ] **Transactions & concurrency**
  - [ ] Add a transaction helper around multi-table writes (e.g. chat inserts + kv updates) using Better-SQLite3 transactions so modules can compose atomic operations.
  - [ ] Document WAL/locking expectations for multi-process clients (desktop + tui + cli) and ensure the notification mechanism works reliably under concurrent writes.
  - [ ] Provide a `withTransaction(db, fn)` helper that hands a Drizzle/B-SQLite transaction to module code; clarify that read-after-write caches/events should fire after commit.

- [ ] **DX / testing**
  - [ ] Allow overriding DB path (or in-memory mode) via env/config for tests and fixtures so module smoke tests do not touch the real `~/.stina/stina.db`.
  - [ ] Provide small fixture/seeding helpers for chat/todos/memories to keep tests deterministic.
  - [ ] Add a dev script/CLI to reset or clear the DB when iterating on schema changes.

- [ ] **Error handling / logging**
  - [ ] Standardize error boundaries and logging: decide whether modules throw typed errors vs return Result objects, and route DB errors through a shared logger.

- [ ] **Architecture / patterns**
  - [ ] Keep modules self-contained (schema + repository-style API) and let `@stina/store` only own DB lifecycle + shared event bus. Decide if you want a thin “registry” that modules register with at startup (bootstrap hook) instead of relying on side-effect imports.
  - [ ] Use per-module repositories (e.g. `chatRepository`, `todoRepository`) that expose typed methods and events; avoid static singletons where possible to ease testing.
  - [ ] Document patterns in `docs/patterns.md` (bootstrap/register-schema + transaction helper) and align implementations to it.

- [ ] **Client integration + surfacing**
  - [ ] Update path aliases (`apps/desktop/vite*.config.ts`, `apps/desktop/tsconfig.json`, `apps/cli/index.ts`, `apps/tui/index.ts`) to point at the new entrypoints once `index_new.ts` replaces `index.ts`.
  - [ ] Adjust UI components (`apps/desktop/src/views/ChatView*.vue`, chat bubbles) and tools to consume the new chat/todo/memory APIs/events.
  - [ ] Refresh README/AGENTS to describe the new modular store layout and the Drizzle-based schema registration workflow.

- [ ] **Cleanup / follow-ups**
  - [ ] Remove legacy `packages/store/src/index.ts` and `toolkit.ts` after modules are migrated, or keep a thin compatibility shim during the transition with deprecation notices.
  - [ ] Add smoke tests for each module (chat/todos/memories/kv) that exercise schema creation against a temporary DB and verify typed queries.
