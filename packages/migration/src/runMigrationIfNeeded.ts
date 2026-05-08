import fs from 'node:fs'
import Database from 'better-sqlite3'
import { BackupWriter } from './BackupWriter.js'
import { MigrationInterruptedError } from './MigrationInterruptedError.js'
import { MigrationRunner } from './MigrationRunner.js'
import { ensureSchemaVersionsTable, hasSchemaVersion, recordSchemaVersion } from './schemaVersions.js'

export interface RunMigrationOptions {
  /** Absolute path to the backups directory. Created if missing. */
  backupDir: string
  /** Absolute path to the migration-in-progress marker file. */
  markerPath: string
  /**
   * Per-app source version string, e.g. 'v0.36.0' for Electron or 'v0.5.0'
   * for API/TUI. Used in the backup filename and migration marker.
   */
  sourceVersion: string
  /** Optional logger. Defaults to no-op if not provided. */
  logger?: {
    info(msg: string, meta?: unknown): void
    warn(msg: string, meta?: unknown): void
  }
}

/**
 * Runs the §08 legacy-chat data migration if needed.
 *
 * Sequence:
 * 1. If the marker file already exists, throw MigrationInterruptedError.
 * 2. Ensure schema_versions table exists.
 * 3. If chat@1.0.0 is already recorded, skip silently (already migrated).
 * 4. If no chat_conversations table exists, record chat@1.0.0 and return.
 * 5. If chat_conversations is empty, record chat@1.0.0 and return.
 * 6. Write a backup via BackupWriter (throws on failure — aborts migration).
 * 7. Run MigrationRunner to migrate legacy threads.
 *
 * Idempotent: steps 3 and 4/5 guarantee a second call is always a no-op.
 * All operations are synchronous.
 */
export function runMigrationIfNeeded(db: Database.Database, options: RunMigrationOptions): void {
  const { backupDir, markerPath, sourceVersion, logger } = options

  // Step 1: Crash recovery — stale marker means previous run was interrupted.
  if (fs.existsSync(markerPath)) {
    throw new MigrationInterruptedError(markerPath)
  }

  // Step 2: Ensure schema_versions table exists.
  ensureSchemaVersionsTable(db)

  // Step 3: Already migrated — skip.
  if (hasSchemaVersion(db, 'chat', '1.0.0')) {
    logger?.info('§08 migration: chat@1.0.0 already recorded, skipping')
    return
  }

  // Step 4: Check for legacy table presence.
  const tableRow = db
    .prepare(`SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='chat_conversations'`)
    .get() as { n: number }

  if (tableRow.n === 0) {
    logger?.info('§08 migration: no legacy chat_conversations table, recording chat@1.0.0')
    recordSchemaVersion(db, 'chat', '1.0.0')
    return
  }

  // Step 5: Check for legacy row count.
  const rowRow = db.prepare('SELECT COUNT(*) as n FROM chat_conversations').get() as { n: number }

  if (rowRow.n === 0) {
    logger?.info('§08 migration: chat_conversations is empty, recording chat@1.0.0')
    recordSchemaVersion(db, 'chat', '1.0.0')
    return
  }

  // Step 6: Legacy data found — take backup before migrating.
  logger?.info(`§08 migration: found ${rowRow.n} conversation(s), running legacy-thread migration`)

  const backupWriter = new BackupWriter(db, { backupDir, sourceVersion })
  const backupResult = backupWriter.write()
  logger?.info('§08 migration: backup written', { backupPath: backupResult.backupPath })

  // Step 7: Run the migration (pass backupPath so it appears in the marker).
  const runner = new MigrationRunner(db, { markerPath, sourceVersion, backupPath: backupResult.backupPath })
  const result = runner.run()
  logger?.info('§08 migration: complete', {
    threadCount: result.threadCount,
    migratedMessageCount: result.migratedMessageCount,
    skippedMessageCount: result.skippedMessageCount,
  })
}
