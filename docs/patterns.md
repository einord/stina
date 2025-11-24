# Store module patterns

## Module bootstrap

Each module exports a `register(store)` (name optional) that:
- Registers its schema via a store API (e.g. `store.registerModule({ name, schema, bootstrap })`).
- Returns a typed repository API bound to those tables and the store event bus.
- Avoids side-effect imports; `@stina/store` (or an app entrypoint) calls `register` once at startup.

Example (pseudo):

```ts
// packages/chat/register.ts
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type ChatRepo = ReturnType<typeof register>;

export function register(store: Store) {
  const tables = store.registerSchema('chat', () => {
    const interactions = sqliteTable('interactions', {
      id: integer().primaryKey({ autoIncrement: true }),
      conversationId: integer().notNull(),
      createdAt: integer({ mode: 'timestamp' }).notNull().default(Math.floor(Date.now() / 1000)),
      aborted: integer({ mode: 'boolean' }).notNull().default(false),
    });
    const interactionMessages = sqliteTable('interaction_messages', {
      id: integer().primaryKey({ autoIncrement: true }),
      interactionId: integer().references(() => interactions.id, { onDelete: 'cascade' }).notNull(),
      role: text({ enum: ['user', 'assistant', 'info', 'tool', 'instructions', 'error', 'debug'] }).notNull(),
      content: text({ mode: 'json' }).notNull(),
      ts: integer({ mode: 'timestamp' }).notNull(),
    });
    return { interactions, interactionMessages };
  });

  type Interaction = InferSelectModel<typeof tables.interactions>;
  type NewInteraction = InferInsertModel<typeof tables.interactions>;

  async function addInteraction(data: NewInteraction) {
    await store.db.insert(tables.interactions).values(data);
    store.emit('chat:changed');
  }

  return {
    addInteraction,
    getInteractions: async () => store.db.select().from(tables.interactions),
  } satisfies {
    addInteraction: (data: NewInteraction) => Promise<void>;
    getInteractions: () => Promise<Interaction[]>;
  };
}
```

## Transactions

Expose a helper that wraps Better-SQLite3/Drizzle transactions and defers events until commit:

```ts
// store
async function withTransaction<T>(fn: (tx: DrizzleDatabase) => Promise<T>): Promise<T> {
  const tx = db.transaction(fn);
  return tx();
}

// chat usage
await store.withTransaction(async (tx) => {
  await tx.insert(tables.interactions).values(...);
  await kvRepo(tx).set('current_conversation', id);
});
// after commit, emit events: store.emit('chat:changed');
```

Guidelines:
- Emit change events after commit, not mid-transaction. Use `store.emitChange(module, payload)` after successful writes.
- Let repos accept either `db` or `tx` so callers can compose operations atomically.
- For tests, allow an in-memory DB/override path and run `register` + repos against it.
- Use `store.on('external-change')` to invalidate caches when another process writes to the DB.
