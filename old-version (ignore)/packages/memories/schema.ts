import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const memoriesTable = sqliteTable(
  'memories',
  {
    id: text().primaryKey(),
    title: text().notNull().default(''),
    content: text().notNull(),
    metadata: text(),
    source: text(),
    tags: text(),
    validUntil: integer('valid_until', { mode: 'number' }),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    createdIdx: index('idx_memories_created').on(table.createdAt),
  }),
);

export const memoryTables = { memoriesTable };
export type MemoryTables = typeof memoryTables;
