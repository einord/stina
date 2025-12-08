import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const peopleTable = sqliteTable(
  'people',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    normalizedName: text().notNull(),
    description: text(),
    metadata: text(),
    createdAt: integer({ mode: 'number' }).notNull(),
    updatedAt: integer({ mode: 'number' }).notNull(),
  },
  (table) => ({
    normalizedNameIdx: index('idx_people_normalized_name').on(table.normalizedName),
  }),
);

export const peopleTables = {
  peopleTable,
};

export type PeopleTables = typeof peopleTables;
