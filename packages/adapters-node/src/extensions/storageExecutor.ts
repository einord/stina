/**
 * Storage Executor
 *
 * Factory functions for creating storage executors that can be used by NodeExtensionHost.
 * Uses better-sqlite3 for database operations.
 */

import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import type { Query, QueryOptions } from '@stina/extension-api'
import { parseQuery, buildSelectQuery, sanitizeCollectionName, validateFieldPath } from '@stina/extension-host/storage/QueryParser'

/**
 * Configuration for the storage executor
 */
export interface StorageExecutorConfig {
  /** Base path for extension storage (e.g., ~/.stina/extensions) */
  extensionsPath: string
  /** Collections config from manifest, keyed by extension ID */
  extensionCollections: Map<string, Record<string, { indexes?: string[] }>>
}

/**
 * Internal context for database operations
 */
interface DbContext {
  db: Database.Database
  dbKey: string
}

/**
 * Creates storage callbacks for NodeExtensionHost
 */
export function createStorageExecutor(config: StorageExecutorConfig) {
  const databases = new Map<string, Database.Database>()
  const initializedCollections = new Map<string, Set<string>>()

  /**
   * Gets or creates a database connection for the given extension/user
   */
  function getOrCreateDb(extensionId: string, userId?: string): Database.Database {
    const key = userId ? `${extensionId}:user:${userId}` : extensionId

    if (databases.has(key)) {
      return databases.get(key)!
    }

    // Build path — store data under _data/ to separate from extension code files
    const dataPath = join(config.extensionsPath, '_data', extensionId)
    let dbPath: string

    if (userId) {
      const userStoragePath = join(dataPath, 'user-storage')
      if (!existsSync(userStoragePath)) {
        mkdirSync(userStoragePath, { recursive: true })
      }
      dbPath = join(userStoragePath, `${userId}.sqlite`)
    } else {
      if (!existsSync(dataPath)) {
        mkdirSync(dataPath, { recursive: true })
      }
      dbPath = join(dataPath, 'storage.sqlite')
    }

    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    databases.set(key, db)

    return db
  }

  /**
   * Gets database context for extension-scoped or user-scoped operations
   */
  function getDbContext(extensionId: string, userId?: string): DbContext {
    const db = getOrCreateDb(extensionId, userId)
    const dbKey = userId ? `${extensionId}:user:${userId}` : extensionId
    return { db, dbKey }
  }

  /**
   * Ensures a collection table exists with proper indexes
   */
  function ensureCollection(db: Database.Database, extensionId: string, collection: string, dbKey: string): string {
    let initialized = initializedCollections.get(dbKey)
    if (!initialized) {
      initialized = new Set()
      initializedCollections.set(dbKey, initialized)
    }

    const safeName = sanitizeCollectionName(collection)
    const tableName = `doc_${safeName}`

    if (initialized.has(collection)) {
      return tableName
    }

    // Create table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        data JSON NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Create indexes from manifest config
    const collectionConfig = config.extensionCollections.get(extensionId)?.[collection]
    const indexFields = collectionConfig?.indexes ?? []

    for (const field of indexFields) {
      // Validate field path to prevent SQL injection
      validateFieldPath(field)
      const indexName = `idx_${safeName}_${field.replace(/\./g, '_')}`
      db.exec(`
        CREATE INDEX IF NOT EXISTS ${indexName}
        ON ${tableName}(json_extract(data, '$.${field}'))
      `)
    }

    initialized.add(collection)
    return tableName
  }

  // ============================================================================
  // Private helper functions for common operations
  // ============================================================================

  /**
   * Helper function for put operations
   */
  function doPut(ctx: DbContext, extensionId: string, collection: string, id: string, data: object): void {
    const tableName = ensureCollection(ctx.db, extensionId, collection, ctx.dbKey)
    const json = JSON.stringify(data)

    ctx.db.prepare(`
      INSERT INTO ${tableName} (id, data, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = datetime('now')
    `).run(id, json)
  }

  /**
   * Helper function for get operations
   */
  function doGet(ctx: DbContext, extensionId: string, collection: string, id: string): unknown {
    const tableName = ensureCollection(ctx.db, extensionId, collection, ctx.dbKey)

    const row = ctx.db.prepare(`SELECT data FROM ${tableName} WHERE id = ?`).get(id) as { data: string } | undefined
    if (!row) return undefined
    try {
      return JSON.parse(row.data)
    } catch (error) {
      throw new Error(`Failed to parse stored data for id "${id}" in collection "${collection}": ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Helper function for delete operations
   */
  function doDelete(ctx: DbContext, extensionId: string, collection: string, id: string): boolean {
    const tableName = ensureCollection(ctx.db, extensionId, collection, ctx.dbKey)

    const result = ctx.db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id)
    return result.changes > 0
  }

  /**
   * Helper function for find operations
   */
  function doFind(ctx: DbContext, extensionId: string, collection: string, query?: Query, options?: QueryOptions): unknown[] {
    const tableName = ensureCollection(ctx.db, extensionId, collection, ctx.dbKey)

    const parsed = parseQuery(query, options)
    const sql = buildSelectQuery(tableName, parsed, false)

    const rows = ctx.db.prepare(sql).all(...parsed.params) as Array<{ id: string; data: string }>
    return rows.map((row, index) => {
      try {
        const doc = JSON.parse(row.data)
        return { ...doc, _id: row.id }
      } catch (error) {
        throw new Error(`Failed to parse stored data at index ${index} in collection "${collection}": ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    })
  }

  /**
   * Helper function for count operations
   */
  function doCount(ctx: DbContext, extensionId: string, collection: string, query?: Query): number {
    const tableName = ensureCollection(ctx.db, extensionId, collection, ctx.dbKey)

    const parsed = parseQuery(query)
    const sql = buildSelectQuery(tableName, parsed, true)

    const row = ctx.db.prepare(sql).get(...parsed.params) as { count: number }
    return row.count
  }

  /**
   * Helper function for putMany operations
   */
  function doPutMany(ctx: DbContext, extensionId: string, collection: string, docs: Array<{ id: string; data: object }>): void {
    const tableName = ensureCollection(ctx.db, extensionId, collection, ctx.dbKey)

    const stmt = ctx.db.prepare(`
      INSERT INTO ${tableName} (id, data, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = datetime('now')
    `)

    const transaction = ctx.db.transaction((docs: Array<{ id: string; data: object }>) => {
      for (const doc of docs) {
        stmt.run(doc.id, JSON.stringify(doc.data))
      }
    })

    transaction(docs)
  }

  /**
   * Helper function for deleteMany operations
   */
  function doDeleteMany(ctx: DbContext, extensionId: string, collection: string, query: Query): number {
    const tableName = ensureCollection(ctx.db, extensionId, collection, ctx.dbKey)

    const parsed = parseQuery(query)
    const sql = `DELETE FROM ${tableName} WHERE ${parsed.whereClause}`

    const result = ctx.db.prepare(sql).run(...parsed.params)
    return result.changes
  }

  /**
   * Helper function for dropCollection operations
   */
  function doDropCollection(ctx: DbContext, collection: string): void {
    const tableName = `doc_${sanitizeCollectionName(collection)}`

    ctx.db.exec(`DROP TABLE IF EXISTS ${tableName}`)
    initializedCollections.get(ctx.dbKey)?.delete(collection)
  }

  /**
   * Helper function for listCollections operations
   */
  function doListCollections(extensionId: string): string[] {
    return Object.keys(config.extensionCollections.get(extensionId) ?? {})
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    // Extension-scoped operations
    async put(extensionId: string, collection: string, id: string, data: object): Promise<void> {
      const ctx = getDbContext(extensionId)
      doPut(ctx, extensionId, collection, id, data)
    },

    async get(extensionId: string, collection: string, id: string): Promise<unknown> {
      const ctx = getDbContext(extensionId)
      return doGet(ctx, extensionId, collection, id)
    },

    async delete(extensionId: string, collection: string, id: string): Promise<boolean> {
      const ctx = getDbContext(extensionId)
      return doDelete(ctx, extensionId, collection, id)
    },

    async find(extensionId: string, collection: string, query?: Query, options?: QueryOptions): Promise<unknown[]> {
      const ctx = getDbContext(extensionId)
      return doFind(ctx, extensionId, collection, query, options)
    },

    async findOne(extensionId: string, collection: string, query: Query): Promise<unknown> {
      const results = await this.find(extensionId, collection, query, { limit: 1 })
      return results[0]
    },

    async count(extensionId: string, collection: string, query?: Query): Promise<number> {
      const ctx = getDbContext(extensionId)
      return doCount(ctx, extensionId, collection, query)
    },

    async putMany(extensionId: string, collection: string, docs: Array<{ id: string; data: object }>): Promise<void> {
      const ctx = getDbContext(extensionId)
      doPutMany(ctx, extensionId, collection, docs)
    },

    async deleteMany(extensionId: string, collection: string, query: Query): Promise<number> {
      const ctx = getDbContext(extensionId)
      return doDeleteMany(ctx, extensionId, collection, query)
    },

    async dropCollection(extensionId: string, collection: string): Promise<void> {
      const ctx = getDbContext(extensionId)
      doDropCollection(ctx, collection)
    },

    async listCollections(extensionId: string): Promise<string[]> {
      return doListCollections(extensionId)
    },

    // User-scoped operations
    async putForUser(extensionId: string, userId: string, collection: string, id: string, data: object): Promise<void> {
      const ctx = getDbContext(extensionId, userId)
      doPut(ctx, extensionId, collection, id, data)
    },

    async getForUser(extensionId: string, userId: string, collection: string, id: string): Promise<unknown> {
      const ctx = getDbContext(extensionId, userId)
      return doGet(ctx, extensionId, collection, id)
    },

    async deleteForUser(extensionId: string, userId: string, collection: string, id: string): Promise<boolean> {
      const ctx = getDbContext(extensionId, userId)
      return doDelete(ctx, extensionId, collection, id)
    },

    async findForUser(extensionId: string, userId: string, collection: string, query?: Query, options?: QueryOptions): Promise<unknown[]> {
      const ctx = getDbContext(extensionId, userId)
      return doFind(ctx, extensionId, collection, query, options)
    },

    async findOneForUser(extensionId: string, userId: string, collection: string, query: Query): Promise<unknown> {
      const results = await this.findForUser(extensionId, userId, collection, query, { limit: 1 })
      return results[0]
    },

    async countForUser(extensionId: string, userId: string, collection: string, query?: Query): Promise<number> {
      const ctx = getDbContext(extensionId, userId)
      return doCount(ctx, extensionId, collection, query)
    },

    async putManyForUser(extensionId: string, userId: string, collection: string, docs: Array<{ id: string; data: object }>): Promise<void> {
      const ctx = getDbContext(extensionId, userId)
      doPutMany(ctx, extensionId, collection, docs)
    },

    async deleteManyForUser(extensionId: string, userId: string, collection: string, query: Query): Promise<number> {
      const ctx = getDbContext(extensionId, userId)
      return doDeleteMany(ctx, extensionId, collection, query)
    },

    async dropCollectionForUser(extensionId: string, userId: string, collection: string): Promise<void> {
      const ctx = getDbContext(extensionId, userId)
      doDropCollection(ctx, collection)
    },

    async listCollectionsForUser(extensionId: string, _userId: string): Promise<string[]> {
      // User-scoped storage uses same collections as extension
      return doListCollections(extensionId)
    },

    /**
     * Close all database connections and cleanup resources.
     *
     * This method should be called when shutting down the extension host to ensure:
     * - All database connections are properly closed
     * - WAL files are checkpointed
     * - File handles are released
     *
     * @example
     * ```typescript
     * // During application shutdown
     * process.on('SIGTERM', () => {
     *   storageExecutor.close()
     *   process.exit(0)
     * })
     * ```
     *
     * @remarks
     * After calling close(), any further storage operations will require
     * reopening database connections automatically.
     */
    close(): void {
      for (const db of databases.values()) {
        db.close()
      }
      databases.clear()
      initializedCollections.clear()
    },
  }
}
