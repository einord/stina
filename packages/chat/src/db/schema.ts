import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Message, InformationMessage } from '../types/message.js'

/**
 * Conversations table
 * Each conversation contains multiple interactions
 */
export const conversations = sqliteTable(
  'chat_conversations',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata', { mode: 'json' }),
  },
  (table) => ({
    activeIdx: index('idx_conversations_active').on(table.active, table.createdAt),
    createdIdx: index('idx_conversations_created').on(table.createdAt),
  })
)

/**
 * Interactions table
 * Each interaction represents one user input + AI response cycle
 */
export const interactions = sqliteTable(
  'chat_interactions',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    aborted: integer('aborted', { mode: 'boolean' }).notNull().default(false),
    // Messages stored as JSON array (hybrid approach)
    messages: text('messages', { mode: 'json' }).notNull().$type<Message[]>(),
    // Information messages stored separately (always shown first in UI)
    informationMessages: text('information_messages', { mode: 'json' }).$type<
      InformationMessage[]
    >(),
    metadata: text('metadata', { mode: 'json' }),
  },
  (table) => ({
    conversationIdx: index('idx_interactions_conversation').on(
      table.conversationId,
      table.createdAt
    ),
  })
)

/**
 * Schema export for Drizzle
 */
export const chatSchema = {
  conversations,
  interactions,
}
