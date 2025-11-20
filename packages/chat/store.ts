import { integer, text } from 'drizzle-orm/sqlite-core';

import store from '../store/src/index_new.js';

import {
  ErrorInteractionMessageType,
  InfoInteractionMessageType,
  InteractionMessageType,
  ToolInteractionMessageType,
  assistantInteractionMessagesType,
  interactionMessageTypes,
  userInteractionMessagesType,
} from './types.js';

// Init database tables
export const interactionsTable = store.initDatabaseTable('interactions', {
  id: integer().primaryKey(),
  conversationId: integer().notNull().unique(),
  createdAt: integer({ mode: 'timestamp' }).notNull(),
  modifiedAt: integer({ mode: 'timestamp' }).notNull(),
  aborted: integer({ mode: 'boolean' }).notNull(),
  provider: text(),
  aiModel: text(),
});

export const interactionMessagesTable = store.initDatabaseTable('interaction_messages', {
  id: integer().primaryKey(),
  interactionId: integer()
    .notNull()
    .references(() => interactionsTable.id),
  role: text({ enum: interactionMessageTypes }).notNull(),
  content: text({ mode: 'json' })
    .notNull()
    .$type<
      | userInteractionMessagesType
      | assistantInteractionMessagesType
      | InteractionMessageType
      | InfoInteractionMessageType
      | ToolInteractionMessageType
      | ErrorInteractionMessageType
    >(),
  ts: integer({ mode: 'timestamp' }).notNull(),
});
