import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

export type DB = BetterSQLite3Database<typeof schema>

let db: DB | null = null
let rawDb: Database.Database | null = null
let currentDbPath: string | null = null

/**
 * Get or create a database connection
 */
export function getDb(dbPath: string): DB {
  if (db) {
    if (dbPath !== currentDbPath) {
      throw new Error(
        `Database already initialized with path "${currentDbPath}". Cannot reinitialize with "${dbPath}".`
      )
    }
    return db
  }
  rawDb = new Database(dbPath)
  rawDb.pragma('journal_mode = WAL')
  db = drizzle(rawDb, { schema })
  currentDbPath = dbPath
  return db
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (rawDb) {
    rawDb.close()
    rawDb = null
    db = null
    currentDbPath = null
  }
}

/**
 * Get raw database for migrations
 */
export function getRawDb(): Database.Database | null {
  return rawDb
}
