import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { schedulerJobs } from './schema.js'

export type SchedulerJobRow = typeof schedulerJobs.$inferSelect

/**
 * Repository for accessing scheduled jobs data.
 * Provides read and delete operations for the scheduler jobs table.
 */
export class SchedulerRepository {
  constructor(private readonly db: BetterSQLite3Database<Record<string, unknown>>) {}

  /**
   * List all scheduled jobs for a specific user.
   * @param userId The user ID to filter by
   * @returns Array of scheduler job rows
   */
  listByUserId(userId: string): SchedulerJobRow[] {
    return this.db.select().from(schedulerJobs).where(eq(schedulerJobs.userId, userId)).all()
  }

  /**
   * Get a scheduled job by its composite ID for a specific user.
   * @param id The composite job ID (extensionId:jobId)
   * @param userId The user ID to verify ownership
   * @returns The job row if found and owned by the user, null otherwise
   */
  getByIdForUser(id: string, userId: string): SchedulerJobRow | null {
    const result = this.db
      .select()
      .from(schedulerJobs)
      .where(and(eq(schedulerJobs.id, id), eq(schedulerJobs.userId, userId)))
      .get()
    return result ?? null
  }

  /**
   * Delete a scheduled job permanently.
   * @param id The composite job ID (extensionId:jobId)
   * @param userId The user ID to verify ownership
   * @returns true if the job was deleted, false if not found or not owned by user
   */
  delete(id: string, userId: string): boolean {
    const result = this.db
      .delete(schedulerJobs)
      .where(and(eq(schedulerJobs.id, id), eq(schedulerJobs.userId, userId)))
      .run()
    return result.changes > 0
  }

  /**
   * Permanently delete disabled (completed) scheduled jobs for a user that
   * are older than the supplied cutoff. A job's age is measured from
   * `lastRunAt` if present, otherwise `updatedAt` (the time the job was
   * disabled). Enabled jobs are never deleted.
   * @param userId The user whose old jobs should be removed
   * @param beforeIso ISO timestamp; jobs older than this are removed
   * @returns Number of deleted rows
   */
  deleteDisabledBefore(userId: string, beforeIso: string): number {
    const ageColumn = sql`COALESCE(${schedulerJobs.lastRunAt}, ${schedulerJobs.updatedAt})`
    const result = this.db
      .delete(schedulerJobs)
      .where(
        and(
          eq(schedulerJobs.userId, userId),
          eq(schedulerJobs.enabled, false),
          lt(ageColumn, beforeIso)
        )
      )
      .run()
    return result.changes
  }

  /**
   * Permanently delete disabled (completed) legacy scheduled jobs that have no
   * `userId` set and are older than the supplied cutoff. These are left over
   * from earlier versions of the scheduler that did not require a user; they
   * are never re-fired (see SchedulerService.fireJob), so this prevents the
   * table from growing forever.
   * @param beforeIso ISO timestamp; jobs older than this are removed
   * @returns Number of deleted rows
   */
  deleteDisabledLegacyBefore(beforeIso: string): number {
    const ageColumn = sql`COALESCE(${schedulerJobs.lastRunAt}, ${schedulerJobs.updatedAt})`
    const result = this.db
      .delete(schedulerJobs)
      .where(
        and(
          isNull(schedulerJobs.userId),
          eq(schedulerJobs.enabled, false),
          lt(ageColumn, beforeIso)
        )
      )
      .run()
    return result.changes
  }

  /**
   * List the distinct user IDs that currently own at least one scheduled job.
   * Useful for iterating over per-user maintenance tasks (e.g. retention cleanup).
   */
  listUserIds(): string[] {
    const rows = this.db
      .selectDistinct({ userId: schedulerJobs.userId })
      .from(schedulerJobs)
      .all()
    return rows
      .map((row) => row.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  }
}
