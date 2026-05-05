import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export interface BackupWriterOptions {
  /** Directory where the backup file will be written. Created if missing. */
  backupDir: string
  /**
   * Source version string including the leading 'v', e.g. 'v0.36.0'.
   * The 'v' is part of the filename template; the version arg supplies it.
   */
  sourceVersion: string
}

export interface BackupResult {
  /** Absolute path of the written backup file. */
  backupPath: string
}

/**
 * Writes a pre-migration SQLite snapshot of the database using VACUUM INTO.
 *
 * Contract: This is a "pre-data-migration" backup. By the time BackupWriter
 * runs, the DDL schema migrations (creating threads, memory, autonomy tables)
 * have already fired. The backup therefore represents a state where the
 * redesign-2026 schema tables exist but are empty, and the legacy
 * chat_conversations data is intact. Restoring from this backup returns the
 * user to a state where the data migration has not yet run.
 *
 * WAL note: The DB is in WAL mode but no other connection holds it open at
 * startup, so VACUUM INTO produces a consistent snapshot. The resulting file
 * is a non-WAL SQLite database.
 *
 * Throws on failure — callers must abort migration if write() throws.
 */
export class BackupWriter {
  private readonly db: Database.Database
  private readonly options: BackupWriterOptions

  constructor(db: Database.Database, options: BackupWriterOptions) {
    this.db = db
    this.options = options
  }

  /**
   * Writes a backup file synchronously and returns the path.
   * Throws on any failure — callers must abort migration.
   */
  write(): BackupResult {
    const { backupDir, sourceVersion } = this.options

    // Strip leading 'v' from the version for the filename segment.
    // The 'v' in 'from-v' is part of the filename template.
    const versionSegment = sourceVersion.startsWith('v') ? sourceVersion.slice(1) : sourceVersion
    const timestamp = Date.now()
    const filename = `pre-redesign-2026-from-v${versionSegment}-${timestamp}.stina-backup`
    const backupPath = path.join(backupDir, filename)

    // Assert no embedded null bytes — SQLite rejects them in paths.
    if (backupPath.includes('\0')) {
      throw new Error(`Backup path contains null bytes: ${backupPath}`)
    }

    // Ensure backup directory exists.
    fs.mkdirSync(backupDir, { recursive: true })

    // Escape single quotes in the path for the SQL string literal.
    const escapedPath = backupPath.replace(/'/g, "''")
    this.db.exec(`VACUUM INTO '${escapedPath}'`)

    return { backupPath }
  }
}
