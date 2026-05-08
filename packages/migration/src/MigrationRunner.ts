import fs from 'node:fs'
import Database from 'better-sqlite3'
import { ChatMigrator } from './ChatMigrator.js'
import { ensureSchemaVersionsTable, hasSchemaVersion, recordSchemaVersion } from './schemaVersions.js'
import { runSanityChecks } from './sanityChecks.js'

export interface MigrationRunnerOptions {
  /** Absolute path to write the migration-in-progress JSON marker file. */
  markerPath: string
  /**
   * Source version string (e.g. 'v0.36.0'). Passed by each app at startup
   * and embedded in the marker file for crash-recovery diagnostics.
   * Defaults to 'v0.x' when called without wiring (tests / manual invocations).
   */
  sourceVersion?: string
  /**
   * Absolute path of the backup file written before this run (optional).
   * When provided, embedded in the marker so crash-recovery dialogs can
   * identify which backup to restore from.
   */
  backupPath?: string
}

export interface MigrationResult {
  threadCount: number
  migratedMessageCount: number
  skippedMessageCount: number
}

interface MarkerFile {
  started_at: number
  phase: string
  last_completed_package: string | null
  backup_path: string | null
  source_version: string
  target_version: string
}

/**
 * Orchestrates the legacy-chat data migration inside a single SQLite
 * BEGIN IMMEDIATE transaction.
 *
 * Stale-marker recovery: if schema_versions already contains chat@1.0.0 when
 * run() is called, the migration completed successfully in a previous run but
 * the process crashed between COMMIT and the marker-file unlink. In this case,
 * run() removes the marker and returns zeros without re-running the migration.
 */
export class MigrationRunner {
  private readonly db: Database.Database
  private readonly markerPath: string
  private readonly sourceVersion: string
  private readonly backupPath: string | null

  constructor(db: Database.Database, options: MigrationRunnerOptions) {
    this.db = db
    this.markerPath = options.markerPath
    this.sourceVersion = options.sourceVersion ?? 'v0.x'
    this.backupPath = options.backupPath ?? null
  }

  /**
   * Runs the migration sequence:
   * 1. Writes a structured marker file.
   * 2. Ensures schema_versions table exists.
   * 3. Opens BEGIN IMMEDIATE transaction.
   * 4. Runs ChatMigrator.
   * 5. Records chat@1.0.0 in schema_versions.
   * 6. Runs sanity checks (rolls back + leaves marker on failure).
   * 7. COMMITs.
   * 8. Removes the marker file.
   *
   * Stale-marker recovery: if chat@1.0.0 is already recorded, removes the
   * marker and returns zeros immediately (migration already complete).
   */
  run(): MigrationResult {
    // Ensure schema_versions table exists so we can query it.
    ensureSchemaVersionsTable(this.db)

    // Stale-marker recovery: migration was already committed.
    if (hasSchemaVersion(this.db, 'chat', '1.0.0')) {
      if (fs.existsSync(this.markerPath)) {
        fs.unlinkSync(this.markerPath)
      }
      return { threadCount: 0, migratedMessageCount: 0, skippedMessageCount: 0 }
    }

    // Write initial marker.
    const marker: MarkerFile = {
      started_at: Date.now(),
      phase: 'starting',
      last_completed_package: null,
      backup_path: this.backupPath,
      source_version: this.sourceVersion,
      target_version: 'v1.0.0',
    }
    this.writeMarker(marker)

    // Begin transaction.
    this.db.exec('BEGIN IMMEDIATE')

    try {
      // Update marker: entering chat package migration.
      marker.phase = 'package:chat'
      this.writeMarker(marker)

      // Run chat migration.
      const migrator = new ChatMigrator(this.db)
      const chatStats = migrator.migrate()

      // Record schema version inside the same transaction.
      recordSchemaVersion(this.db, 'chat', '1.0.0')

      // Update marker: entering sanity checks.
      marker.last_completed_package = 'chat'
      marker.phase = 'sanity-checks'
      this.writeMarker(marker)

      // Run sanity checks — throws on failure.
      try {
        runSanityChecks(this.db, chatStats)
      } catch (sanityError) {
        this.db.exec('ROLLBACK')
        // Leave marker file in place so crash recovery can surface it.
        throw sanityError
      }

      // Commit.
      this.db.exec('COMMIT')

      // Remove marker on clean commit.
      if (fs.existsSync(this.markerPath)) {
        fs.unlinkSync(this.markerPath)
      }

      return {
        threadCount: chatStats.threadCount,
        migratedMessageCount: chatStats.migratedMessageCount,
        skippedMessageCount: chatStats.skippedMessageCount,
      }
    } catch (err) {
      // If we haven't already rolled back (sanity check path does it explicitly),
      // roll back here. SQLite will error if we try to rollback after a commit,
      // but in the sanity-check throw path we already rolled back before re-throwing.
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // Already committed or already rolled back — ignore.
      }
      throw err
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private writeMarker(marker: MarkerFile): void {
    fs.writeFileSync(this.markerPath, JSON.stringify(marker, null, 2), 'utf-8')
  }
}
