import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ActivityLogKind, PolicyScope, ToolSeverity } from '@stina/core'

/**
 * Auto-policies table — see docs/redesign-2026/02-data-model.md §Auto-policy
 * and §06.
 *
 * mode is always 'inform' in v1; reserved for future extensions per §02.
 * The §02 auto-policy creation guard is enforced at the runtime layer (a
 * policy cannot be created from inside a non-user-triggered thread without
 * an interactive user approval); this table only stores the resulting
 * records.
 */
export const autoPolicies = sqliteTable(
  'auto_policies',
  {
    id: text('id').primaryKey(),
    toolId: text('tool_id').notNull(),
    scope: text('scope', { mode: 'json' }).notNull().$type<PolicyScope>(),
    mode: text('mode').notNull().$type<'inform'>().default('inform'),
    createdAt: integer('created_at').notNull(),
    sourceThreadId: text('source_thread_id'),
    approvalCount: integer('approval_count').notNull().default(0),
    /** 0 = user-initiated; 1 = Stina-suggested-and-accepted (per §06). */
    createdBySuggestion: integer('created_by_suggestion', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => ({
    toolIdx: index('idx_auto_policies_tool').on(table.toolId),
  })
)

/**
 * Activity log entries table — see docs/redesign-2026/02-data-model.md
 * §Activity log entry. Append-only audit record; surfaces inline in the
 * thread (when thread_id is set), in recap, and in the activity-log
 * inspector under the menu.
 */
export const activityLogEntries = sqliteTable(
  'activity_log_entries',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull().$type<ActivityLogKind>(),
    severity: text('severity').notNull().$type<ToolSeverity>().default('low'),
    threadId: text('thread_id'),
    summary: text('summary').notNull(),
    details: text('details', { mode: 'json' }).notNull().default('{}').$type<Record<string, unknown>>(),
    createdAt: integer('created_at').notNull(),
    retentionDays: integer('retention_days').notNull().default(365),
  },
  (table) => ({
    threadCreatedIdx: index('idx_activity_log_thread_created').on(table.threadId, table.createdAt),
    kindCreatedIdx: index('idx_activity_log_kind_created').on(table.kind, table.createdAt),
    createdIdx: index('idx_activity_log_created').on(table.createdAt),
  })
)

/**
 * Persistent snapshot of the last-seen severity for each (extension, tool)
 * pair. See docs/redesign-2026/06-autonomy.md §Severity-change cascade and
 * packages/autonomy/src/db/repositories/ToolSeveritySnapshotRepository.ts.
 *
 * The snapshot stores RESOLVED severity (undefined → 'medium'), matching the
 * producer's `?? 'medium'` gate semantics. Callers pre-resolve before
 * calling `compare`.
 */
export const toolSeveritySnapshots = sqliteTable(
  'tool_severity_snapshots',
  {
    extensionId: text('extension_id').notNull(),
    toolId: text('tool_id').notNull(),
    severity: text('severity').notNull().$type<ToolSeverity>(),
    lastSeenAt: integer('last_seen_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.extensionId, table.toolId] }),
  })
)

export const autonomySchema = { autoPolicies, activityLogEntries, toolSeveritySnapshots }

export type AutonomyDb = BetterSQLite3Database<typeof autonomySchema>
