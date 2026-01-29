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
import { parseQuery, buildSelectQuery, sanitizeCollectionName } from '@stina/extension-host/storage/QueryParser'

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
 * Creates storage callbacks for NodeExtensionHost
 */
export function createStorageExecutor(config: StorageExecutorConfig) {
  const databases = new Map<string, Database.Database>()
  const initializedCollections = new Map<string, Set<string>>()

  function getOrCreateDb(extensionId: string, userId?: string): Database.Database {
    const key = userId ? `${extensionId}:user:${userId}` : extensionId

    if (databases.has(key)) {
      return databases.get(key)!
    }

    // Build path
    const extensionPath = join(config.extensionsPath, extensionId)
    let dbPath: string

    if (userId) {
      const userStoragePath = join(extensionPath, 'user-storage')
      if (!existsSync(userStoragePath)) {
        mkdirSync(userStoragePath, { recursive: true })
      }
      dbPath = join(userStoragePath, `${userId}.sqlite`)
    } else {
      if (!existsSync(extensionPath)) {
        mkdirSync(extensionPath, { recursive: true })
      }
      dbPath = join(extensionPath, 'storage.sqlite')
    }

    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    databases.set(key, db)

    return db
  }

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
      const indexName = `idx_${safeName}_${field.replace(/\./g, '_')}`
      db.exec(`
        CREATE INDEX IF NOT EXISTS ${indexName}
        ON ${tableName}(json_extract(data, '$.${field}'))
      `)
    }

    initialized.add(collection)
    return tableName
  }

  return {
    // Extension-scoped operations
    async put(extensionId: string, collection: string, id: string, data: object): Promise<void> {
      const db = getOrCreateDb(extensionId)
      const tableName = ensureCollection(db, extensionId, collection, extensionId)
      const json = JSON.stringify(data)

      db.prepare(`
        INSERT INTO ${tableName} (id, data, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          updated_at = datetime('now')
      `).run(id, json)
    },

    async get(extensionId: string, collection: string, id: string): Promise<unknown> {
      const db = getOrCreateDb(extensionId)
      const tableName = ensureCollection(db, extensionId, collection, extensionId)

      const row = db.prepare(`SELECT data FROM ${tableName} WHERE id = ?`).get(id) as { data: string } | undefined
      return row ? JSON.parse(row.data) : undefined
    },

    async delete(extensionId: string, collection: string, id: string): Promise<boolean> {
      const db = getOrCreateDb(extensionId)
      const tableName = ensureCollection(db, extensionId, collection, extensionId)

      const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id)
      return result.changes > 0
    },

    async find(extensionId: string, collection: string, query?: Query, options?: QueryOptions): Promise<unknown[]> {
      const db = getOrCreateDb(extensionId)
      const tableName = ensureCollection(db, extensionId, collection, extensionId)

      const parsed = parseQuery(query, options)
      const sql = buildSelectQuery(tableName, parsed, false)

      const rows = db.prepare(sql).all(...parsed.params) as Array<{ data: string }>
      return rows.map(row => JSON.parse(row.data))
    },

    async findOne(extensionId: string, collection: string, query: Query): Promise<unknown> {
      const results = await this.find(extensionId, collection, query, { limit: 1 })
      return results[0]
    },

    async count(extensionId: string, collection: string, query?: Query): Promise<number> {
      const db = getOrCreateDb(extensionId)
      const tableName = ensureCollection(db, extensionId, collection, extensionId)

      const parsed = parseQuery(query)
      const sql = buildSelectQuery(tableName, parsed, true)

      const row = db.prepare(sql).get(...parsed.params) as { count: number }
      return row.count
    },

    async putMany(extensionId: string, collection: string, docs: Array<{ id: string; data: object }>): Promise<void> {
      const db = getOrCreateDb(extensionId)
      const tableName = ensureCollection(db, extensionId, collection, extensionId)

      const stmt = db.prepare(`
        INSERT INTO ${tableName} (id, data, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          updated_at = datetime('now')
      `)

      const transaction = db.transaction((docs: Array<{ id: string; data: object }>) => {
        for (const doc of docs) {
          stmt.run(doc.id, JSON.stringify(doc.data))
        }
      })

      transaction(docs)
    },

    async deleteMany(extensionId: string, collection: string, query: Query): Promise<number> {
      const db = getOrCreateDb(extensionId)
      const tableName = ensureCollection(db, extensionId, collection, extensionId)

      const parsed = parseQuery(query)
      const sql = `DELETE FROM ${tableName} WHERE ${parsed.whereClause}`

      const result = db.prepare(sql).run(...parsed.params)
      return result.changes
    },

    async dropCollection(extensionId: string, collection: string): Promise<void> {
      const db = getOrCreateDb(extensionId)
      const tableName = `doc_${sanitizeCollectionName(collection)}`

      db.exec(`DROP TABLE IF EXISTS ${tableName}`)
      initializedCollections.get(extensionId)?.delete(collection)
    },

    async listCollections(extensionId: string): Promise<string[]> {
      return Object.keys(config.extensionCollections.get(extensionId) ?? {})
    },

    // User-scoped operations (same pattern but with userId)
    async putForUser(extensionId: string, userId: string, collection: string, id: string, data: object): Promise<void> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = ensureCollection(db, extensionId, collection, dbKey)
      const json = JSON.stringify(data)

      db.prepare(`
        INSERT INTO ${tableName} (id, data, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          updated_at = datetime('now')
      `).run(id, json)
    },

    async getForUser(extensionId: string, userId: string, collection: string, id: string): Promise<unknown> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = ensureCollection(db, extensionId, collection, dbKey)

      const row = db.prepare(`SELECT data FROM ${tableName} WHERE id = ?`).get(id) as { data: string } | undefined
      return row ? JSON.parse(row.data) : undefined
    },

    async deleteForUser(extensionId: string, userId: string, collection: string, id: string): Promise<boolean> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = ensureCollection(db, extensionId, collection, dbKey)

      const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id)
      return result.changes > 0
    },

    async findForUser(extensionId: string, userId: string, collection: string, query?: Query, options?: QueryOptions): Promise<unknown[]> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = ensureCollection(db, extensionId, collection, dbKey)

      const parsed = parseQuery(query, options)
      const sql = buildSelectQuery(tableName, parsed, false)

      const rows = db.prepare(sql).all(...parsed.params) as Array<{ data: string }>
      return rows.map(row => JSON.parse(row.data))
    },

    async findOneForUser(extensionId: string, userId: string, collection: string, query: Query): Promise<unknown> {
      const results = await this.findForUser(extensionId, userId, collection, query, { limit: 1 })
      return results[0]
    },

    async countForUser(extensionId: string, userId: string, collection: string, query?: Query): Promise<number> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = ensureCollection(db, extensionId, collection, dbKey)

      const parsed = parseQuery(query)
      const sql = buildSelectQuery(tableName, parsed, true)

      const row = db.prepare(sql).get(...parsed.params) as { count: number }
      return row.count
    },

    async putManyForUser(extensionId: string, userId: string, collection: string, docs: Array<{ id: string; data: object }>): Promise<void> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = ensureCollection(db, extensionId, collection, dbKey)

      const stmt = db.prepare(`
        INSERT INTO ${tableName} (id, data, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          updated_at = datetime('now')
      `)

      const transaction = db.transaction((docs: Array<{ id: string; data: object }>) => {
        for (const doc of docs) {
          stmt.run(doc.id, JSON.stringify(doc.data))
        }
      })

      transaction(docs)
    },

    async deleteManyForUser(extensionId: string, userId: string, collection: string, query: Query): Promise<number> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = ensureCollection(db, extensionId, collection, dbKey)

      const parsed = parseQuery(query)
      const sql = `DELETE FROM ${tableName} WHERE ${parsed.whereClause}`

      const result = db.prepare(sql).run(...parsed.params)
      return result.changes
    },

    async dropCollectionForUser(extensionId: string, userId: string, collection: string): Promise<void> {
      const db = getOrCreateDb(extensionId, userId)
      const dbKey = `${extensionId}:user:${userId}`
      const tableName = `doc_${sanitizeCollectionName(collection)}`

      db.exec(`DROP TABLE IF EXISTS ${tableName}`)
      initializedCollections.get(dbKey)?.delete(collection)
    },

    async listCollectionsForUser(extensionId: string, _userId: string): Promise<string[]> {
      // User-scoped storage uses same collections as extension
      return Object.keys(config.extensionCollections.get(extensionId) ?? {})
    },

    /**
     * Close all database connections
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
