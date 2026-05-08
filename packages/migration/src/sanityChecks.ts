import type Database from 'better-sqlite3'
import type { ChatMigratorStats } from './ChatMigrator.js'

/**
 * Runs post-migration sanity checks before committing the transaction.
 * Throws an Error with a descriptive message if any check fails.
 *
 * All checks are scoped to the thread IDs produced by this migration run so
 * that pre-existing threads and messages (from prior redesign-2026 activity)
 * do not cause false positives.
 */
export function runSanityChecks(
  db: Database.Database,
  stats: ChatMigratorStats
): void {
  checkRowCountParity(db, stats)
  checkFkIntegrity(db)
  checkAllArchived(db, stats)
}


/**
 * Verifies that the number of messages whose thread_id was produced by this
 * migration equals stats.migratedMessageCount.
 *
 * Scoped to stats.threadIds so pre-existing messages do not affect the count.
 */
function checkRowCountParity(db: Database.Database, stats: ChatMigratorStats): void {
  if (stats.threadIds.length === 0) {
    // Nothing was migrated — no messages to verify.
    return
  }
  const placeholders = stats.threadIds.map(() => '?').join(', ')
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM messages WHERE thread_id IN (${placeholders})`)
    .get(...stats.threadIds) as { cnt: number }
  const actual = row.cnt
  if (actual !== stats.migratedMessageCount) {
    throw new Error(
      `Sanity check failed: row-count parity. ` +
        `Expected ${stats.migratedMessageCount} messages for migrated threads, found ${actual}.`
    )
  }
}

/**
 * Verifies that every message in the table references a valid thread via thread_id.
 * Not scoped — checks all messages regardless of origin.
 */
export function checkFkIntegrity(db: Database.Database): void {
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM messages m
       LEFT JOIN threads t ON m.thread_id = t.id
       WHERE t.id IS NULL`
    )
    .get() as { cnt: number }
  if (row.cnt !== 0) {
    throw new Error(
      `Sanity check failed: FK integrity. ` +
        `${row.cnt} message(s) reference non-existent thread_id.`
    )
  }
}

/**
 * Verifies that all threads inserted by this migration have status = 'archived'.
 *
 * Scoped to stats.threadIds so pre-existing active/quiet threads do not cause
 * false positives.
 */
export function checkAllArchived(db: Database.Database, stats: ChatMigratorStats): void {
  if (stats.threadIds.length === 0) {
    return
  }
  const placeholders = stats.threadIds.map(() => '?').join(', ')
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM threads WHERE id IN (${placeholders}) AND status != 'archived'`
    )
    .get(...stats.threadIds) as { cnt: number }
  if (row.cnt !== 0) {
    throw new Error(
      `Sanity check failed: all-archived. ` +
        `${row.cnt} migrated thread(s) have status != 'archived'.`
    )
  }
}
