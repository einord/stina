/**
 * Secrets Manager
 *
 * Manages encrypted storage of sensitive data for extensions.
 * Uses a shared database with extension_id + optional user_id scoping.
 */

import type { SecretsAPI } from '@stina/extension-api'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

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
 * Configuration for secrets manager
 */
export interface SecretsManagerConfig {
  /** Path to the secrets.sqlite file */
  databasePath: string
  /** Encryption key (should be derived from a master secret) */
  encryptionKey: Buffer
  /** Function to open/create SQLite database */
  openDatabase: (path: string) => SqliteDatabase
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/** Pattern for valid secret key names: alphanumeric, underscore, hyphen, dot */
const VALID_KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/

/**
 * Validates that a secret key has a valid format.
 *
 * @param key - The key to validate
 * @throws Error if key is empty or contains invalid characters
 */
function validateSecretKey(key: string): void {
  if (!key || key.length === 0) {
    throw new Error('Secret key cannot be empty')
  }
  if (!VALID_KEY_PATTERN.test(key)) {
    throw new Error('Secret key contains invalid characters. Only alphanumeric, underscore, hyphen, and dot are allowed.')
  }
}

/**
 * Encrypts a string value
 */
function encrypt(value: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  const authTag = cipher.getAuthTag()

  // Format: iv (16) + authTag (16) + encrypted data
  return Buffer.concat([iv, authTag, encrypted])
}

/**
 * Decrypts a buffer to string
 */
function decrypt(data: Buffer, key: Buffer): string {
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted) + decipher.final('utf8')
}

/**
 * Derives an encryption key from a master secret
 */
export function deriveEncryptionKey(masterSecret: string, salt: Buffer = Buffer.from('stina-secrets')): Buffer {
  return scryptSync(masterSecret, salt, 32)
}

/** Sentinel value for null user_id (SQLite doesn't handle NULL in UNIQUE constraints well) */
const NULL_USER_SENTINEL = ''

/**
 * Manages secrets for all extensions
 */
export class SecretsManager {
  private db: SqliteDatabase
  private readonly encryptionKey: Buffer
  private initialized = false

  constructor(config: SecretsManagerConfig) {
    this.db = config.openDatabase(config.databasePath)
    this.encryptionKey = config.encryptionKey
  }

  /**
   * Normalizes user_id to handle null values consistently for SQLite UNIQUE constraints
   */
  private normalizeUserId(userId: string | null): string {
    return userId ?? NULL_USER_SENTINEL
  }

  /**
   * Ensures the secrets table exists
   */
  private ensureInitialized(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        extension_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '',
        key TEXT NOT NULL,
        value BLOB NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (extension_id, user_id, key)
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_secrets_extension
      ON secrets(extension_id)
    `)

    this.initialized = true
  }

  /**
   * Creates a scoped SecretsAPI for a specific extension and optional user
   */
  createScopedAPI(extensionId: string, userId?: string): SecretsAPI {
    return new ScopedSecretsAPI(this, extensionId, userId)
  }

  /**
   * Set a secret value
   */
  async set(extensionId: string, userId: string | null, key: string, value: string): Promise<void> {
    validateSecretKey(key)
    this.ensureInitialized()

    const encrypted = encrypt(value, this.encryptionKey)
    const normalizedUserId = this.normalizeUserId(userId)

    this.db
      .prepare(
        `
      INSERT INTO secrets (extension_id, user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(extension_id, user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `
      )
      .run(extensionId, normalizedUserId, key, encrypted)
  }

  /**
   * Get a secret value
   */
  async get(extensionId: string, userId: string | null, key: string): Promise<string | undefined> {
    validateSecretKey(key)
    this.ensureInitialized()

    const normalizedUserId = this.normalizeUserId(userId)

    const row = this.db
      .prepare(
        `
      SELECT value FROM secrets
      WHERE extension_id = ? AND user_id = ? AND key = ?
    `
      )
      .get(extensionId, normalizedUserId, key) as { value: Buffer } | undefined

    if (!row) return undefined

    return decrypt(row.value, this.encryptionKey)
  }

  /**
   * Delete a secret
   */
  async delete(extensionId: string, userId: string | null, key: string): Promise<boolean> {
    validateSecretKey(key)
    this.ensureInitialized()

    const normalizedUserId = this.normalizeUserId(userId)

    const result = this.db
      .prepare(
        `
      DELETE FROM secrets
      WHERE extension_id = ? AND user_id = ? AND key = ?
    `
      )
      .run(extensionId, normalizedUserId, key)

    return result.changes > 0
  }

  /**
   * List all secret keys for an extension/user
   */
  async list(extensionId: string, userId: string | null): Promise<string[]> {
    this.ensureInitialized()

    const normalizedUserId = this.normalizeUserId(userId)

    const rows = this.db
      .prepare(
        `
      SELECT key FROM secrets
      WHERE extension_id = ? AND user_id = ?
      ORDER BY key
    `
      )
      .all(extensionId, normalizedUserId) as Array<{ key: string }>

    return rows.map((row) => row.key)
  }

  /**
   * Delete all secrets for an extension
   */
  async deleteAllForExtension(extensionId: string): Promise<void> {
    this.ensureInitialized()

    this.db.prepare(`DELETE FROM secrets WHERE extension_id = ?`).run(extensionId)
  }

  /**
   * Close the database connection.
   * 
   * Note: The database instance is provided externally via the openDatabase callback,
   * so cleanup should be handled by the caller who owns the database instance.
   * 
   * @remarks
   * This is a no-op since the SecretsManager doesn't own the database instance.
   * The application should close the database when shutting down.
   */
  close(): void {
    // Database cleanup will be handled by the caller
  }
}

/**
 * Scoped secrets API for a specific extension/user.
 * Provides a simplified interface for storing and retrieving encrypted secrets.
 */
class ScopedSecretsAPI implements SecretsAPI {
  constructor(
    private manager: SecretsManager,
    private extensionId: string,
    private userId: string | undefined
  ) {}

  /**
   * Stores an encrypted secret value.
   *
   * @param key - The secret key (alphanumeric, underscore, hyphen, dot only)
   * @param value - The secret value to encrypt and store
   * @throws Error if key is empty or contains invalid characters
   */
  async set(key: string, value: string): Promise<void> {
    await this.manager.set(this.extensionId, this.userId ?? null, key, value)
  }

  /**
   * Retrieves and decrypts a secret value.
   *
   * @param key - The secret key to retrieve
   * @returns The decrypted secret value, or undefined if not found
   * @throws Error if key is empty or contains invalid characters
   */
  async get(key: string): Promise<string | undefined> {
    return this.manager.get(this.extensionId, this.userId ?? null, key)
  }

  /**
   * Deletes a secret.
   *
   * @param key - The secret key to delete
   * @returns True if a secret was deleted, false if not found
   * @throws Error if key is empty or contains invalid characters
   */
  async delete(key: string): Promise<boolean> {
    return this.manager.delete(this.extensionId, this.userId ?? null, key)
  }

  /**
   * Lists all secret keys for this extension/user scope.
   *
   * @returns Array of secret key names (values are not returned)
   */
  async list(): Promise<string[]> {
    return this.manager.list(this.extensionId, this.userId ?? null)
  }
}

/**
 * Factory function to create secrets manager
 */
export function createSecretsManager(config: SecretsManagerConfig): SecretsManager {
  return new SecretsManager(config)
}
