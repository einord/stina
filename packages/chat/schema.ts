import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { chatRoles } from './constants.js';

export const conversationsTable = sqliteTable(
  'chat_conversations',
  {
    id: text().primaryKey(),
    title: text(),
    createdAt: integer({ mode: 'number' }).notNull(),
    updatedAt: integer({ mode: 'number' }).notNull(),
    active: integer({ mode: 'boolean' }).notNull().default(false),
    provider: text(),
    aiModel: text(),
  },
  (table) => ({
    activeIdx: index('idx_conversations_active').on(table.active, table.updatedAt),
  }),
);

export const interactionsTable = sqliteTable(
  'chat_interactions',
  {
    id: text().primaryKey(),
    conversationId: text()
      .notNull()
      .references(() => conversationsTable.id, { onDelete: 'cascade' }),
    createdAt: integer({ mode: 'number' }).notNull(),
    aborted: integer({ mode: 'boolean' }).notNull().default(false),
    provider: text(),
    aiModel: text(),
  },
  (table) => ({
    conversationIdx: index('idx_interactions_conversation').on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);

export const interactionMessagesTable = sqliteTable(
  'chat_interaction_messages',
  {
    id: text().primaryKey(),
    interactionId: text()
      .notNull()
      .references(() => interactionsTable.id, { onDelete: 'cascade' }),
    conversationId: text().notNull(),
    role: text({ enum: chatRoles }).notNull(),
    content: text().notNull(),
    ts: integer({ mode: 'number' }).notNull(),
    provider: text(),
    aborted: integer({ mode: 'boolean' }).notNull().default(false),
    metadata: text(),
  },
  (table) => ({
    interactionIdx: index('idx_interaction_messages_interaction').on(
      table.interactionId,
      table.ts,
    ),
    conversationIdx: index('idx_interaction_messages_conversation').on(
      table.conversationId,
      table.ts,
    ),
  }),
);

export const chatTables = {
  conversationsTable,
  interactionsTable,
  interactionMessagesTable,
};

export type ChatTables = typeof chatTables;
