import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
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
    /** User ID for multi-user support (required) */
    userId: text('user_id').notNull(),
  },
  (table) => ({
    activeIdx: index('idx_conversations_active').on(table.active, table.createdAt),
    createdIdx: index('idx_conversations_created').on(table.createdAt),
    userIdx: index('idx_conversations_user').on(table.userId),
    userActiveIdx: index('idx_conversations_user_active').on(table.userId, table.active, table.createdAt),
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
    /** Whether this interaction encountered an error */
    error: integer('error', { mode: 'boolean' }).notNull().default(false),
    /** Error message if the interaction failed */
    errorMessage: text('error_message'),
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
 * Model configurations table
 * Stores globally configured AI models from provider extensions.
 * Admin manages model configs; user's default model choice is stored in user_settings.
 */
export const modelConfigs = sqliteTable(
  'model_configs',
  {
    id: text('id').primaryKey(),
    /** User-defined display name */
    name: text('name').notNull(),
    /** Provider ID (e.g., "ollama") */
    providerId: text('provider_id').notNull(),
    /** Extension ID that provides this provider (e.g., "ollama-provider") */
    providerExtensionId: text('provider_extension_id').notNull(),
    /** Model ID within the provider (e.g., "llama3.2:8b") */
    modelId: text('model_id').notNull(),
    /** Provider-specific settings overrides stored as JSON */
    settingsOverride: text('settings_override', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    providerIdx: index('idx_model_configs_provider').on(table.providerId),
  })
)

/**
 * User settings table
 * Key-value storage for per-user application settings
 */
export const userSettings = sqliteTable(
  'user_settings',
  {
    key: text('key').notNull(),
    value: text('value', { mode: 'json' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    /** User ID for multi-user support (required) */
    userId: text('user_id').notNull(),
  },
  (table) => ({
    keyUserIdx: index('idx_user_settings_key_user').on(table.key, table.userId),
    userIdx: index('idx_user_settings_user').on(table.userId),
  })
)

/**
 * Quick commands table
 * User-defined shortcuts for common AI prompts
 */
export const quickCommands = sqliteTable(
  'quick_commands',
  {
    id: text('id').primaryKey(),
    /** Icon name (from Hugeicons) */
    icon: text('icon').notNull(),
    /** Command text/prompt to send */
    command: text('command').notNull(),
    /** Sort order for display */
    sortOrder: integer('sort_order').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    /** User ID for multi-user support (required) */
    userId: text('user_id').notNull(),
  },
  (table) => ({
    sortIdx: index('idx_quick_commands_sort').on(table.sortOrder),
    userIdx: index('idx_quick_commands_user').on(table.userId),
  })
)

/**
 * Schema export for Drizzle
 */
export const chatSchema = {
  conversations,
  interactions,
  modelConfigs,
  userSettings,
  quickCommands,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- chat DB is initialized in adapters-node with a different schema object.
export type ChatDb = BetterSQLite3Database<any>
