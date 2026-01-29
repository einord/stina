/**
 * Extension Storage Manager
 *
 * Manages SQLite-based document storage for extensions.
 * Each extension gets its own database file.
 */

import type { Query, QueryOptions, StorageAPI } from '@stina/extension-api'
import { parseQuery, buildSelectQuery, sanitizeCollectionName, validateFieldPath } from './QueryParser.js'

/**
 * SQLite database interface (to be injected)
 */
export interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
}

export interface SqliteStatement {
  run(...params: unknown[]): { changes: number }
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

/**
 * Configuration for the storage manager
 */
export interface StorageManagerConfig {
  /** Path to the storage.sqlite file */
  databasePath: string
  /** Collection configurations from manifest */
  collections: Record<string, { indexes?: string[] }>
  /** Function to open/create SQLite database */
  openDatabase: (path: string) => SqliteDatabase
}

/**
 * Manages storage for a single extension
 */
export class ExtensionStorageManager implements StorageAPI {
  private db: SqliteDatabase
  private readonly collections: Set<string>
  private readonly indexes: Map<string, string[]>
  private initializedCollections = new Set<string>()

  constructor(config: StorageManagerConfig) {
    this.db = config.openDatabase(config.databasePath)
    this.collections = new Set(Object.keys(config.collections))
    this.indexes = new Map(
      Object.entries(config.collections).map(([name, cfg]) => [name, cfg.indexes ?? []])
    )
  }

  /**
   * Ensures a collection table exists with proper indexes
   */
  private ensureCollection(collection: string): string {
    const safeName = sanitizeCollectionName(collection)
    const tableName = `doc_${safeName}`

    if (this.initializedCollections.has(collection)) {
      return tableName
    }

    // Create table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        data JSON NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Create indexes for declared fields
    const indexFields = this.indexes.get(collection) ?? []
    for (const field of indexFields) {
      // Validate field path to prevent SQL injection
      validateFieldPath(field)
      const indexName = `idx_${safeName}_${field.replace(/\./g, '_')}`
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS ${indexName}
        ON ${tableName}(json_extract(data, '$.${field}'))
      `)
    }

    this.initializedCollections.add(collection)
    return tableName
  }

  /**
   * Validates that a collection is declared in manifest
   */
  private validateCollection(collection: string): void {
    if (!this.collections.has(collection)) {
      throw new Error(
        `Collection "${collection}" not declared in manifest. ` +
          `Declared collections: ${Array.from(this.collections).join(', ')}`
      )
    }
  }

  async put<T extends object>(collection: string, id: string, data: T): Promise<void> {
    this.validateCollection(collection)
    const tableName = this.ensureCollection(collection)
    const json = JSON.stringify(data)

    this.db
      .prepare(
        `
      INSERT INTO ${tableName} (id, data, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = datetime('now')
    `
      )
      .run(id, json)
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    this.validateCollection(collection)
    const tableName = this.ensureCollection(collection)

    const row = this.db.prepare(`SELECT data FROM ${tableName} WHERE id = ?`).get(id) as
      | { data: string }
      | undefined
    if (!row) return undefined

    return JSON.parse(row.data) as T
  }

  async delete(collection: string, id: string): Promise<boolean> {
    this.validateCollection(collection)
    const tableName = this.ensureCollection(collection)

    const result = this.db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id)
    return result.changes > 0
  }

  async find<T>(collection: string, query?: Query, options?: QueryOptions): Promise<T[]> {
    this.validateCollection(collection)
    const tableName = this.ensureCollection(collection)

    const parsed = parseQuery(query, options)
    const sql = buildSelectQuery(tableName, parsed, false)

    const rows = this.db.prepare(sql).all(...parsed.params) as Array<{ data: string }>
    return rows.map((row) => JSON.parse(row.data) as T)
  }

  async findOne<T>(collection: string, query: Query): Promise<T | undefined> {
    const results = await this.find<T>(collection, query, { limit: 1 })
    return results[0]
  }

  async count(collection: string, query?: Query): Promise<number> {
    this.validateCollection(collection)
    const tableName = this.ensureCollection(collection)

    const parsed = parseQuery(query)
    const sql = buildSelectQuery(tableName, parsed, true)

    const row = this.db.prepare(sql).get(...parsed.params) as { count: number }
    return row.count
  }

  async putMany<T extends object>(
    collection: string,
    docs: Array<{ id: string; data: T }>
  ): Promise<void> {
    this.validateCollection(collection)
    const tableName = this.ensureCollection(collection)

    const stmt = this.db.prepare(`
      INSERT INTO ${tableName} (id, data, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = datetime('now')
    `)

    // Use transaction to ensure atomicity
    this.db.exec('BEGIN TRANSACTION')
    try {
      for (const doc of docs) {
        stmt.run(doc.id, JSON.stringify(doc.data))
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  async deleteMany(collection: string, query: Query): Promise<number> {
    this.validateCollection(collection)
    const tableName = this.ensureCollection(collection)

    const parsed = parseQuery(query)
    const sql = `DELETE FROM ${tableName} WHERE ${parsed.whereClause}`

    const result = this.db.prepare(sql).run(...parsed.params)
    return result.changes
  }

  async dropCollection(collection: string): Promise<void> {
    this.validateCollection(collection)
    const tableName = `doc_${sanitizeCollectionName(collection)}`

    this.db.exec(`DROP TABLE IF EXISTS ${tableName}`)
    this.initializedCollections.delete(collection)
  }

  async listCollections(): Promise<string[]> {
    return Array.from(this.collections)
  }

  /**
   * Close the database connection
   */
  close(): void {
    // Database cleanup will be handled by the caller
  }
}

/**
 * Factory function to create storage manager for an extension
 */
export function createExtensionStorageManager(
  config: StorageManagerConfig
): ExtensionStorageManager {
  return new ExtensionStorageManager(config)
}
