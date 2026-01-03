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
 * Stores user-configured AI models from provider extensions
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
    /** Whether this is the default model */
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    /** Provider-specific settings overrides stored as JSON */
    settingsOverride: text('settings_override', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    defaultIdx: index('idx_model_configs_default').on(table.isDefault),
    providerIdx: index('idx_model_configs_provider').on(table.providerId),
  })
)

/**
 * App settings table
 * Key-value storage for general application settings
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

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
  },
  (table) => ({
    sortIdx: index('idx_quick_commands_sort').on(table.sortOrder),
  })
)

/**
 * Schema export for Drizzle
 */
export const chatSchema = {
  conversations,
  interactions,
  modelConfigs,
  appSettings,
  quickCommands,
}
