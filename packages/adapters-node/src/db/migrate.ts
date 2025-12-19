import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { AppError, ErrorCode } from '@stina/core'

/**
 * Run all pending migrations from a folder
 */
export function runMigrations(db: Database.Database, migrationsPath: string): void {
  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  // Get already applied migrations
  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name)
  )

  // Read migration files
  if (!fs.existsSync(migrationsPath)) {
    return // No migrations folder yet
  }

  const files = fs
    .readdirSync(migrationsPath)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  // Apply pending migrations
  for (const file of files) {
    if (applied.has(file)) {
      continue
    }

    const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf-8')

    try {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString()
      )
    } catch (error) {
      throw new AppError(
        ErrorCode.DB_MIGRATION_FAILED,
        `Failed to apply migration: ${file}`,
        { file },
        error instanceof Error ? error : undefined
      )
    }
  }
}

/**
 * Create core tables
 */
export function initCoreSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}
