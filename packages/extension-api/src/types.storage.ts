/**
 * Storage Types
 *
 * Types for the new collection-based document storage API.
 * Provides a MongoDB-inspired but simplified query syntax for extensions.
 */

/**
 * Query syntax for filtering documents in a collection.
 * Supports exact matching and comparison operators.
 *
 * @example
 * // Exact match
 * { status: "active" }
 *
 * @example
 * // Comparison operators
 * { age: { $gt: 18 }, status: { $in: ["active", "pending"] } }
 *
 * @example
 * // String contains (case-insensitive)
 * { name: { $contains: "john" } }
 */
export interface Query {
  [field: string]:
    | unknown                           // Exact match: { status: "active" }
    | { $gt?: unknown }                 // Greater than: { age: { $gt: 18 } }
    | { $gte?: unknown }                // Greater than or equal
    | { $lt?: unknown }                 // Less than
    | { $lte?: unknown }                // Less than or equal
    | { $ne?: unknown }                 // Not equal
    | { $in?: unknown[] }               // In array: { status: { $in: ["active", "pending"] } }
    | { $contains?: string }            // String contains (case-insensitive)
}

/**
 * Optional modifiers for query operations.
 * Allows sorting, pagination, and limiting results.
 */
export interface QueryOptions {
  /**
   * Sort results by one or more fields.
   * @example { createdAt: 'desc', name: 'asc' }
   */
  sort?: { [field: string]: 'asc' | 'desc' }

  /**
   * Maximum number of documents to return.
   */
  limit?: number

  /**
   * Number of documents to skip (for pagination).
   */
  offset?: number
}

/**
 * Storage API for extension-scoped document storage.
 * All operations are automatically scoped to the calling extension.
 * Data is stored as JSON documents in collections.
 */
export interface StorageAPI {
  // Document operations

  /**
   * Store a document in a collection.
   * Creates the document if it doesn't exist, or replaces it if it does.
   *
   * @param collection - The name of the collection
   * @param id - Unique identifier for the document within the collection
   * @param data - The document data to store
   *
   * @example
   * await storage.put('users', 'user-123', { name: 'John', age: 30 })
   */
  put<T extends object>(collection: string, id: string, data: T): Promise<void>

  /**
   * Retrieve a document from a collection by its ID.
   *
   * @param collection - The name of the collection
   * @param id - The document ID to retrieve
   * @returns The document data, or undefined if not found
   *
   * @example
   * const user = await storage.get<User>('users', 'user-123')
   */
  get<T>(collection: string, id: string): Promise<T | undefined>

  /**
   * Delete a document from a collection.
   *
   * @param collection - The name of the collection
   * @param id - The document ID to delete
   * @returns True if the document was deleted, false if it didn't exist
   *
   * @example
   * const wasDeleted = await storage.delete('users', 'user-123')
   */
  delete(collection: string, id: string): Promise<boolean>

  // Query operations

  /**
   * Find documents matching a query.
   *
   * @param collection - The name of the collection
   * @param query - Optional query to filter documents
   * @param options - Optional query modifiers (sort, limit, offset)
   * @returns Array of matching documents
   *
   * @example
   * // Find all active users, sorted by name
   * const users = await storage.find<User>('users',
   *   { status: 'active' },
   *   { sort: { name: 'asc' }, limit: 10 }
   * )
   */
  find<T>(collection: string, query?: Query, options?: QueryOptions): Promise<T[]>

  /**
   * Find a single document matching a query.
   * Returns the first match if multiple documents match.
   *
   * @param collection - The name of the collection
   * @param query - Query to filter documents
   * @returns The first matching document, or undefined if none found
   *
   * @example
   * const user = await storage.findOne<User>('users', { email: 'john@example.com' })
   */
  findOne<T>(collection: string, query: Query): Promise<T | undefined>

  /**
   * Count documents matching a query.
   *
   * @param collection - The name of the collection
   * @param query - Optional query to filter documents
   * @returns The number of matching documents
   *
   * @example
   * const activeCount = await storage.count('users', { status: 'active' })
   */
  count(collection: string, query?: Query): Promise<number>

  // Bulk operations

  /**
   * Store multiple documents in a collection in a single operation.
   * More efficient than multiple individual put calls.
   *
   * @param collection - The name of the collection
   * @param docs - Array of documents with their IDs
   *
   * @example
   * await storage.putMany('users', [
   *   { id: 'user-1', data: { name: 'John' } },
   *   { id: 'user-2', data: { name: 'Jane' } }
   * ])
   */
  putMany<T extends object>(collection: string, docs: Array<{ id: string; data: T }>): Promise<void>

  /**
   * Delete multiple documents matching a query.
   *
   * @param collection - The name of the collection
   * @param query - Query to match documents for deletion
   * @returns The number of documents deleted
   *
   * @example
   * const deleted = await storage.deleteMany('users', { status: 'inactive' })
   */
  deleteMany(collection: string, query: Query): Promise<number>

  // Collection management

  /**
   * Drop an entire collection, deleting all its documents.
   * Use with caution - this operation cannot be undone.
   *
   * @param collection - The name of the collection to drop
   *
   * @example
   * await storage.dropCollection('temp-data')
   */
  dropCollection(collection: string): Promise<void>

  /**
   * List all collections owned by this extension.
   *
   * @returns Array of collection names
   *
   * @example
   * const collections = await storage.listCollections()
   * // ['users', 'settings', 'cache']
   */
  listCollections(): Promise<string[]>
}

/**
 * Secrets API for secure storage of sensitive values.
 * All operations are automatically scoped to the calling extension.
 * Values are encrypted at rest.
 */
export interface SecretsAPI {
  /**
   * Store a secret value.
   * Creates the secret if it doesn't exist, or replaces it if it does.
   *
   * @param key - Unique key for the secret
   * @param value - The secret value to store
   *
   * @example
   * await secrets.set('api-key', 'sk-1234567890')
   */
  set(key: string, value: string): Promise<void>

  /**
   * Retrieve a secret value.
   *
   * @param key - The secret key to retrieve
   * @returns The secret value, or undefined if not found
   *
   * @example
   * const apiKey = await secrets.get('api-key')
   */
  get(key: string): Promise<string | undefined>

  /**
   * Delete a secret.
   *
   * @param key - The secret key to delete
   * @returns True if the secret was deleted, false if it didn't exist
   *
   * @example
   * const wasDeleted = await secrets.delete('api-key')
   */
  delete(key: string): Promise<boolean>

  /**
   * List all secret keys owned by this extension.
   * Only returns the keys, not the secret values.
   *
   * @returns Array of secret keys
   *
   * @example
   * const keys = await secrets.list()
   * // ['api-key', 'webhook-secret']
   */
  list(): Promise<string[]>
}

/**
 * Configuration for a storage collection in the extension manifest.
 * Allows extensions to declare collections and their indexing requirements.
 */
export interface StorageCollectionConfig {
  /**
   * Fields that should be indexed for fast queries.
   * Indexed fields allow efficient filtering and sorting.
   *
   * @example ['status', 'createdAt', 'userId']
   */
  indexes?: string[]
}

/**
 * Storage contributions section in the extension manifest.
 * Declares the collections an extension will use.
 *
 * @example
 * {
 *   collections: {
 *     users: { indexes: ['email', 'status'] },
 *     settings: {}
 *   }
 * }
 */
export interface StorageContributions {
  /**
   * Map of collection names to their configuration.
   */
  collections: {
    [name: string]: StorageCollectionConfig
  }
}
