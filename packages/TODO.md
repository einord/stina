# Store/DB refactor TODO

- [ ] **Decisions & conventions**
  - [x] Keep DB at `.stina/stina.db` (set in `packages/store/src/database/index.ts`).
  - [ ] Freeze package boundaries: `@stina/store` = DB lifecycle + shared event bus; feature modules (`@stina/chat`, `@stina/todos`, `@stina/memories`, `@stina/kv`) own schema + repositories; `@stina/core` consumes them.
  - [ ] Require docblocks on exported functions/methods (1–2 sentences: purpose + when to use) across new store/chat modules.

- [ ] **Core store (index_new.ts)**
  - [x] Finalize module registration API (e.g. `registerModule({ name, schema, bootstrap })`) so no side-effect imports are needed.
  - [ ] Ensure Drizzle typings flow through the registration API (tables + infer models) and allow indexes/defaults/constraints to be created on first run.
  - [ ] Add a minimal migration runner (ALTER-only) with idempotent steps and a place for module-specific migrations.
  - [ ] Provide cross-process notifications (file watcher or WAL hook) + cache invalidation; expose `onChange` per module.
  - [x] Publish a shared transaction helper (`withTransaction` wrapping Better-SQLite3) that modules can compose.
  - [ ] Swap `index.ts` to `index_new.ts` once chat/todos/memories are migrated; keep a thin compatibility shim until aliases and clients move.

- [ ] **Chat module (`packages/chat`)**
  - [x] Replace old `packages/core/src/chat*` store usage with a typed repository in `packages/chat` (split into schema.ts, repository.ts, events.ts, types.ts, bootstrap.ts to keep responsibilities small).
  - [x] Move ChatManager logic out of `packages/core/src/chat.ts` into `packages/chat` (provider wiring, streaming, aborts, warning propagation) and expose only a small public surface (repository + ChatManager facade + events types).
  - [x] Fix schema: drop `conversationId` unique on interactions; add `conversations` table (id/title/created_at/active/provider metadata) + cascade deletes + useful indexes.
  - [x] Match capabilities of old ChatManager store surface: id generation, startNewConversation/withInteractionContext, append* message helpers (user/assistant/info/instruction/tool), pagination + history flattening, provider/abort/debug fields.
  - [x] Emit chat events consumed by desktop/TUI/CLI; decide on per-table events vs. aggregated snapshots and document the contract.
  - [x] Remove `any` fallbacks from `Infer*Model` outputs (e.g. `content` JSON columns): use typed column helpers or explicit `zod`/type guards so repository methods return strongly typed shapes.
  - [x] Replace `packages/core/src/chat.ts` with imports from `@stina/chat` (or a tiny shim) and delete the legacy file once UIs/providers are switched.

- [ ] **Todos module (`packages/todos`)**
  - [ ] Port `packages/store/src/todos.ts` to module bootstrap + Drizzle schema; keep status enums, comments table, indexes, and typed return values.
  - [ ] Provide change events (reuse store bus) and remove legacy `registerToolSchema`/toolkit dependencies.

- [ ] **Memories module (`packages/memories`)**
  - [ ] Port `packages/store/src/memories.ts` with schema registration, JSON metadata handling, and the `title` migration; add indexes + events.
  - [ ] Keep tool definitions (`packages/core/src/tools/definitions/memories.ts`) type-safe via Drizzle `Infer*Model` exports.

- [ ] **KV / counters**
  - [x] Extract kv/state module with Drizzle schema + tiny API (`get/set`, `increment`, `subscribe`).
  - [x] Let chat own active conversation state; remove legacy counter usage.

- [ ] **Concurrency & reliability**
  - [ ] Document WAL/locking expectations for multi-client setups and ensure notification mechanism is robust under concurrent writes.
  - [ ] Clarify event timing: events fire after transaction commit; reads after writes go through the same bus/cache.

- [ ] **DX / testing**
  - [x] Allow overriding DB path/in-memory mode for tests; add fixture helpers for chat/todos/memories/kv.
  - [ ] Add a dev CLI to reset/clear DB during schema iteration.
  - [ ] Add smoke tests per module covering schema creation + basic CRUD.

- [ ] **Docs & integration**
  - [ ] Document bootstrap/registration + transaction helper in `docs/patterns.md`.
  - [ ] Update path aliases (`apps/*/tsconfig.json`, Vite configs) + imports once `index_new.ts` is live.
  - [ ] Refresh README/AGENTS with the modular store layout and chat module move out of core.

- [ ] **Cleanup**
  - [ ] Remove legacy `packages/store/src/index.ts` and `toolkit.ts` after migration or keep a tiny deprecated shim during rollout.
