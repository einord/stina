import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type {
  ThreadStatus,
  ThreadTrigger,
  EntityRef,
  MessageVisibility,
  AppContent,
  Attachment,
  ToolCall,
  ToolResult,
} from '@stina/core'

/**
 * Threads table — see docs/redesign-2026/02-data-model.md §Thread.
 *
 * `trigger` is stored as JSON; the discriminator is the `kind` field.
 * `linked_entities` is a JSON array of EntityRef (with snapshot field).
 */
export const threads = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    trigger: text('trigger', { mode: 'json' }).notNull().$type<ThreadTrigger>(),
    status: text('status').notNull().$type<ThreadStatus>(),
    /** unix ms when the first decision turn completed. NULL = pending, invisible in GET /threads (spec §04 gate). */
    firstTurnCompletedAt: integer('first_turn_completed_at'),
    /** unix ms when Stina first addressed the user. NULL = background. */
    surfacedAt: integer('surfaced_at'),
    /** unix ms when a user-facing notification fired. May differ from surfacedAt. */
    notifiedAt: integer('notified_at'),
    title: text('title').notNull(),
    summary: text('summary'),
    linkedEntities: text('linked_entities', { mode: 'json' })
      .notNull()
      .default('[]')
      .$type<EntityRef[]>(),
    createdAt: integer('created_at').notNull(),
    lastActivityAt: integer('last_activity_at').notNull(),
  },
  (table) => ({
    statusActivityIdx: index('idx_threads_status_last_activity').on(table.status, table.lastActivityAt),
    surfacedIdx: index('idx_threads_surfaced_at').on(table.surfacedAt),
  })
)

/**
 * Messages table — see docs/redesign-2026/02-data-model.md §Message.
 *
 * `author` is the discriminator. Content shape depends on author and is
 * stored as JSON. App-authored messages also carry `source` for the trust
 * boundary.
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    author: text('author').notNull().$type<'user' | 'stina' | 'app'>(),
    visibility: text('visibility').notNull().$type<MessageVisibility>().default('normal'),
    /** Set on app-authored messages: { extension_id, component? }; null otherwise. */
    source: text('source', { mode: 'json' }).$type<{ extension_id: string; component?: string }>(),
    /**
     * Content shape depends on `author`:
     *   user: { text, attachments? }
     *   stina: { text?, tool_calls?, tool_results? }
     *   app: AppContent (typed by `kind` discriminator)
     */
    content: text('content', { mode: 'json' })
      .notNull()
      .$type<
        | { text: string; attachments?: Attachment[] }
        | { text?: string; tool_calls?: ToolCall[]; tool_results?: ToolResult[] }
        | AppContent
      >(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    threadCreatedIdx: index('idx_messages_thread_created').on(table.threadId, table.createdAt),
    threadVisibilityIdx: index('idx_messages_thread_visibility').on(
      table.threadId,
      table.visibility,
      table.createdAt
    ),
  })
)

/**
 * Aggregate schema object for typed Drizzle clients.
 */
export const threadsSchema = { threads, messages }

export type ThreadsDb = BetterSQLite3Database<typeof threadsSchema>
