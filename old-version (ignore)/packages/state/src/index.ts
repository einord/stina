import { eq } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import store from '@stina/store/index_new';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

const stateTable = sqliteTable('state', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: integer({ mode: 'number' }).notNull(),
});

type StateRow = typeof stateTable.$inferSelect;

/**
 * Lightweight state repository for shared key/value flags and counters.
 * Modules can use this for small bits of process-shared state.
 */
class StateRepository {
  constructor(private readonly db = store.getDatabase()) {}

  /** Returns the value for the given key, or undefined if missing. */
  async get(key: string): Promise<string | undefined> {
    const row = await this.db.select().from(stateTable).where(eq(stateTable.key, key)).limit(1);
    return row[0]?.value;
  }

  /** Sets a value for the given key. */
  async set(key: string, value: string): Promise<void> {
    const now = Date.now();
    await this.db
      .insert(stateTable)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: stateTable.key,
        set: { value, updatedAt: now },
      });
    store.emitChange('state', { kind: 'state', key });
  }

  /** Increments a numeric value (creates it if missing). */
  async increment(key: string, by = 1): Promise<number> {
    const current = Number((await this.get(key)) ?? 0);
    const next = current + by;
    await this.set(key, String(next));
    return next;
  }

  /** Subscribes to state change events. */
  onChange(listener: (payload: { kind: 'state'; key: string }) => void): () => void {
    return store.onChange('state', (payload) => listener((payload as { kind: 'state'; key: string }) ?? { kind: 'state', key: '' }));
  }
}

let repo: StateRepository | null = null;

/**
 * Returns the shared state repository, wiring schema + change bus on first access.
 * Use for small cross-process flags and counters.
 */
export function getStateRepository(): StateRepository {
  if (!repo) {
    store.registerModule({
      name: 'state',
      schema: () =>
        ({ stateTable } as unknown as Record<string, SQLiteTableWithColumns<TableConfig>>),
      bootstrap: () => new StateRepository(),
    });
    repo = new StateRepository();
  }
  return repo;
}

export { stateTable };
export type { StateRow };
