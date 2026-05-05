import type Database from 'better-sqlite3'
import type { ChatMigratorStats } from './ChatMigrator.js'

/**
 * Runs post-migration sanity checks before committing the transaction.
 * Throws an Error with a descriptive message if any check fails.
 *
 * All checks are scoped to the full tables. See individual check comments for
 * future-improvement notes where the scoping assumption matters.
 */
export function runSanityChecks(
  db: Database.Database,
  stats: ChatMigratorStats
): void {
  checkRowCountParity(db, stats)
  checkFkIntegrity(db)
  checkAllArchived(db)
}


/**
 * Verifies that the number of rows in messages equals the migrated message count.
 *
 * Assumes messages table is empty at migration start. If other migrators have
 * run before, scope this check to IDs from ChatMigrator (future improvement).
 */
function checkRowCountParity(db: Database.Database, stats: ChatMigratorStats): void {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM messages').get() as { cnt: number }
  const actual = row.cnt
  if (actual !== stats.migratedMessageCount) {
    throw new Error(
      `Sanity check failed: row-count parity. ` +
        `Expected ${stats.migratedMessageCount} messages, found ${actual}.`
    )
  }
}

/**
 * Verifies that every message references a valid thread via thread_id.
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
 * Verifies that all threads have status = 'archived'.
 *
 * Assumes threads table is empty at migration start. If other migrators have
 * run before, scope this check to IDs from ChatMigrator (future improvement).
 */
export function checkAllArchived(db: Database.Database): void {
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM threads WHERE status != 'archived'`)
    .get() as { cnt: number }
  if (row.cnt !== 0) {
    throw new Error(
      `Sanity check failed: all-archived. ` +
        `${row.cnt} thread(s) have status != 'archived'.`
    )
  }
}
