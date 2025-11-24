import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const memoriesTable = sqliteTable(
  'memories',
  {
    id: text().primaryKey(),
    title: text().notNull().default(''),
    content: text().notNull(),
    metadata: text(),
    source: text(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    createdIdx: index('idx_memories_created').on(table.createdAt),
  }),
);

export const memoryTables = { memoriesTable };
export type MemoryTables = typeof memoryTables;
