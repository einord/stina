import type Database from 'better-sqlite3'

/**
 * Ensures the schema_versions table exists.
 *
 * Note: schema_versions coexists with the existing _migrations table.
 * _migrations tracks per-file SQL migrations (low-level DDL).
 * schema_versions tracks per-package data migration completion (high-level).
 * They serve different purposes and are not merged.
 */
export function ensureSchemaVersionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      package TEXT NOT NULL,
      version TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      PRIMARY KEY (package, version)
    )
  `)
}

/**
 * Records that the given package/version migration has been applied.
 * Must be called inside an open transaction — does NOT manage its own transaction.
 */
export function recordSchemaVersion(
  db: Database.Database,
  pkg: string,
  version: string
): void {
  db.prepare(
    'INSERT OR REPLACE INTO schema_versions (package, version, applied_at) VALUES (?, ?, ?)'
  ).run(pkg, version, Date.now())
}

/**
 * Returns true if the given package/version has already been recorded
 * in schema_versions.
 */
export function hasSchemaVersion(
  db: Database.Database,
  pkg: string,
  version: string
): boolean {
  const row = db
    .prepare('SELECT 1 FROM schema_versions WHERE package = ? AND version = ?')
    .get(pkg, version)
  return row !== undefined
}
