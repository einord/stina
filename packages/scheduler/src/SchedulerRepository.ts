import { and, eq } from 'drizzle-orm'
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
}
