import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { ActivityLogEntry, ActivityLogKind, ToolSeverity } from '@stina/core'
import { activityLogEntries, type AutonomyDb } from '../schema.js'

const NON_TOOL_DEFAULT_SEVERITY: ToolSeverity = 'low'

export interface AppendEntryInput {
  kind: ActivityLogKind
  /**
   * Severity. Defaults per §02:
   * - For tool-driven kinds (auto_action, action_blocked, memory_change tied
   *   to a tool), the caller must pass the underlying tool's severity.
   * - For non-tool kinds (event_silenced, dream_pass_*, settings_migration,
   *   migration_completed, thread_created, event_handled-without-tool),
   *   omit and the writer defaults to 'low'.
   */
  severity?: ToolSeverity
  thread_id?: string | null
  summary: string
  details?: Record<string, unknown>
  retention_days?: number
}

export interface ListEntriesOptions {
  thread_id?: string | null
  kind?: ActivityLogKind | ActivityLogKind[]
  /** Only entries newer than this. */
  after?: number
  /** Only entries older than this. */
  before?: number
  limit?: number
}

/**
 * Append-only writer for the activity log. Every autonomous decision Stina
 * makes (or the runtime makes on her behalf) flows through this repository,
 * including silenced events, auto-actions, action_blocked entries, memory
 * changes, and dream-pass artifacts.
 *
 * The default retention is 365 days (per §02 §Activity log entry); the
 * `cleanup` method runs once a day from the runtime to prune past-retention
 * entries.
 */
export class ActivityLogRepository {
  constructor(private db: AutonomyDb) {}

  async append(input: AppendEntryInput): Promise<ActivityLogEntry> {
    const now = Date.now()
    const row = {
      id: nanoid(),
      kind: input.kind,
      severity: input.severity ?? NON_TOOL_DEFAULT_SEVERITY,
      threadId: input.thread_id ?? null,
      summary: input.summary,
      details: input.details ?? {},
      createdAt: now,
      retentionDays: input.retention_days ?? 365,
    }
    await this.db.insert(activityLogEntries).values(row)
    return rowToEntry(row)
  }

  async getById(id: string): Promise<ActivityLogEntry | null> {
    const rows = await this.db
      .select()
      .from(activityLogEntries)
      .where(eq(activityLogEntries.id, id))
      .limit(1)
    return rows[0] ? rowToEntry(rows[0]) : null
  }

  async list(options: ListEntriesOptions = {}): Promise<ActivityLogEntry[]> {
    const conditions = []
    if (options.thread_id !== undefined) {
      if (options.thread_id === null) {
        conditions.push(sql`${activityLogEntries.threadId} IS NULL`)
      } else {
        conditions.push(eq(activityLogEntries.threadId, options.thread_id))
      }
    }
    if (options.kind) {
      const kinds = Array.isArray(options.kind) ? options.kind : [options.kind]
      if (kinds.length === 1) {
        conditions.push(eq(activityLogEntries.kind, kinds[0]!))
      } else {
        conditions.push(
          sql`${activityLogEntries.kind} IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})`
        )
      }
    }
    if (options.after !== undefined) {
      conditions.push(sql`${activityLogEntries.createdAt} > ${options.after}`)
    }
    if (options.before !== undefined) {
      conditions.push(sql`${activityLogEntries.createdAt} < ${options.before}`)
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const query = this.db
      .select()
      .from(activityLogEntries)
      .where(where)
      .orderBy(desc(activityLogEntries.createdAt))

    const rows = options.limit ? await query.limit(options.limit) : await query
    return rows.map(rowToEntry)
  }

  /**
   * Inline-rendering helper (per §05): list entries for a given thread in
   * chronological order, suitable for interleaving with messages.
   */
  async listForThreadInline(threadId: string): Promise<ActivityLogEntry[]> {
    const rows = await this.db
      .select()
      .from(activityLogEntries)
      .where(eq(activityLogEntries.threadId, threadId))
      .orderBy(activityLogEntries.createdAt)
    return rows.map(rowToEntry)
  }

  /**
   * Daily cleanup. Removes entries whose `created_at + retention_days_ms`
   * is before `now`. Returns the count of deleted rows.
   */
  async cleanup(now: number = Date.now()): Promise<number> {
    const oneDayMs = 24 * 60 * 60 * 1000
    const result = await this.db
      .delete(activityLogEntries)
      .where(lt(sql`${activityLogEntries.createdAt} + (${activityLogEntries.retentionDays} * ${oneDayMs})`, now))
    return result.changes ?? 0
  }
}

interface EntryRow {
  id: string
  kind: ActivityLogKind
  severity: ToolSeverity
  threadId: string | null
  summary: string
  details: Record<string, unknown>
  createdAt: number
  retentionDays: number
}

function rowToEntry(row: EntryRow): ActivityLogEntry {
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    thread_id: row.threadId,
    summary: row.summary,
    details: row.details,
    created_at: row.createdAt,
    retention_days: row.retentionDays,
  }
}
