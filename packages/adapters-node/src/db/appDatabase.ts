import type { Logger } from '@stina/core'
import { getDbPath } from '../paths.js'
import { getDb, getRawDb, type DB } from './connection.js'
import { initCoreSchema, runMigrations } from './migrate.js'

export interface DatabaseInitOptions {
  logger: Logger
  dbPath?: string
  migrations?: string[]
}

let database: DB | null = null

/**
 * Initialize database with migrations.
 */
export function initDatabase(options: DatabaseInitOptions): DB {
  if (database) return database

  const dbPath = options.dbPath ?? getDbPath()
  options.logger.info('Initializing database', { path: dbPath })

  database = getDb(dbPath)
  const rawDb = getRawDb()

  if (!rawDb) {
    throw new Error('Failed to get raw database connection')
  }

  initCoreSchema(rawDb)
  runMigrations(rawDb, options.migrations ?? [])

  options.logger.info('Database initialized successfully')

  return database
}

/**
 * Get the database instance (must be initialized first).
 */
export function getDatabase(): DB {
  if (!database) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return database
}
