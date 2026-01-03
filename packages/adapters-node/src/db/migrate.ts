import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { AppError, ErrorCode } from '@stina/core'

/**
 * Run all pending migrations from multiple folders
 */
export function runMigrations(db: Database.Database, migrationsPaths: string[]): void {
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

  // Collect all migrations from all paths
  const allMigrations: Array<{ name: string; path: string }> = []

  for (const migrationsPath of migrationsPaths) {
    if (!fs.existsSync(migrationsPath)) {
      continue // Skip if folder doesn't exist
    }

    // Extract module name from path (e.g., 'chat' from '.../chat/db/migrations')
    const pathParts = migrationsPath.split(path.sep)
    const packagesIndex = pathParts.lastIndexOf('packages')
    const moduleName = packagesIndex >= 0 ? pathParts[packagesIndex + 1] : 'core'

    const files = fs
      .readdirSync(migrationsPath)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const migrationName = `${moduleName}/${file}`
      allMigrations.push({
        name: migrationName,
        path: path.join(migrationsPath, file),
      })
    }
  }

  // Sort all migrations by name (ensures consistent order across modules)
  allMigrations.sort((a, b) => a.name.localeCompare(b.name))

  // Apply pending migrations
  for (const migration of allMigrations) {
    if (applied.has(migration.name)) {
      continue
    }

    const sql = fs.readFileSync(migration.path, 'utf-8')

    try {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        migration.name,
        new Date().toISOString()
      )
    } catch (error) {
      throw new AppError(
        ErrorCode.DB_MIGRATION_FAILED,
        `Failed to apply migration: ${migration.name}`,
        { migration: migration.name },
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
