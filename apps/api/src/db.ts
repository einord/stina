import { getDb, getRawDb, runMigrations, initCoreSchema, getDbPath } from '@stina/adapters-node'
import { getChatMigrationsPath } from '@stina/chat/db'
import type { DB } from '@stina/adapters-node'
import type { Logger } from '@stina/core'

let database: DB | null = null

/**
 * Initialize database with migrations
 */
export function initDatabase(logger: Logger): DB {
  if (database) return database

  const dbPath = getDbPath()
  logger.info('Initializing database', { path: dbPath })

  // Get database connection
  database = getDb(dbPath)
  const rawDb = getRawDb()

  if (!rawDb) {
    throw new Error('Failed to get raw database connection')
  }

  // Initialize core schema
  initCoreSchema(rawDb)

  // Run migrations from all packages
  runMigrations(rawDb, [getChatMigrationsPath()])

  logger.info('Database initialized successfully')

  return database
}

/**
 * Get the database instance (must be initialized first)
 */
export function getDatabase(): DB {
  if (!database) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return database
}
