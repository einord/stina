/**
 * SecretsManager Tests
 *
 * Tests for encrypted secrets storage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SecretsManager, deriveEncryptionKey } from './SecretsManager.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'

describe('SecretsManager', () => {
  let tempDir: string
  let secretsManager: SecretsManager

  beforeEach(() => {
    // Create a temporary directory for test databases
    tempDir = mkdtempSync(join(tmpdir(), 'stina-secrets-test-'))
    const dbPath = join(tempDir, 'secrets.sqlite')

    secretsManager = new SecretsManager({
      databasePath: dbPath,
      encryptionKey: deriveEncryptionKey('test-master-secret'),
      openDatabase: (path) => {
        const db = new Database(path)
        db.pragma('journal_mode = WAL')
        return db
      },
    })
  })

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('Extension-scoped secrets', () => {
    it('should set and get a secret', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'secret-value-123')
      const value = await secretsManager.get('ext-1', null, 'api-key')
      expect(value).toBe('secret-value-123')
    })

    it('should return undefined for non-existent secrets', async () => {
      const value = await secretsManager.get('ext-1', null, 'non-existent')
      expect(value).toBeUndefined()
    })

    it('should update existing secrets', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'old-value')
      await secretsManager.set('ext-1', null, 'api-key', 'new-value')
      const value = await secretsManager.get('ext-1', null, 'api-key')
      expect(value).toBe('new-value')
    })

    it('should delete secrets', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'secret-value')
      const deleted = await secretsManager.delete('ext-1', null, 'api-key')
      expect(deleted).toBe(true)

      const value = await secretsManager.get('ext-1', null, 'api-key')
      expect(value).toBeUndefined()
    })

    it('should return false when deleting non-existent secret', async () => {
      const deleted = await secretsManager.delete('ext-1', null, 'non-existent')
      expect(deleted).toBe(false)
    })

    it('should list all secrets for an extension', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'value1')
      await secretsManager.set('ext-1', null, 'db-password', 'value2')
      await secretsManager.set('ext-1', null, 'oauth-token', 'value3')

      const keys = await secretsManager.list('ext-1', null)
      expect(keys).toContain('api-key')
      expect(keys).toContain('db-password')
      expect(keys).toContain('oauth-token')
      expect(keys).toHaveLength(3)
    })

    it('should isolate secrets between extensions', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'ext1-secret')
      await secretsManager.set('ext-2', null, 'api-key', 'ext2-secret')

      const value1 = await secretsManager.get('ext-1', null, 'api-key')
      const value2 = await secretsManager.get('ext-2', null, 'api-key')

      expect(value1).toBe('ext1-secret')
      expect(value2).toBe('ext2-secret')
    })
  })

  describe('User-scoped secrets', () => {
    it('should set and get user-scoped secrets', async () => {
      await secretsManager.set('ext-1', 'user-1', 'api-key', 'user1-secret')
      const value = await secretsManager.get('ext-1', 'user-1', 'api-key')
      expect(value).toBe('user1-secret')
    })

    it('should isolate secrets between users', async () => {
      await secretsManager.set('ext-1', 'user-1', 'api-key', 'user1-secret')
      await secretsManager.set('ext-1', 'user-2', 'api-key', 'user2-secret')

      const value1 = await secretsManager.get('ext-1', 'user-1', 'api-key')
      const value2 = await secretsManager.get('ext-1', 'user-2', 'api-key')

      expect(value1).toBe('user1-secret')
      expect(value2).toBe('user2-secret')
    })

    it('should isolate extension-scoped from user-scoped secrets', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'extension-secret')
      await secretsManager.set('ext-1', 'user-1', 'api-key', 'user-secret')

      const extValue = await secretsManager.get('ext-1', null, 'api-key')
      const userValue = await secretsManager.get('ext-1', 'user-1', 'api-key')

      expect(extValue).toBe('extension-secret')
      expect(userValue).toBe('user-secret')
    })

    it('should list only user-scoped secrets', async () => {
      await secretsManager.set('ext-1', null, 'ext-key', 'ext-value')
      await secretsManager.set('ext-1', 'user-1', 'user-key-1', 'value1')
      await secretsManager.set('ext-1', 'user-1', 'user-key-2', 'value2')

      const userKeys = await secretsManager.list('ext-1', 'user-1')
      expect(userKeys).toContain('user-key-1')
      expect(userKeys).toContain('user-key-2')
      expect(userKeys).not.toContain('ext-key')
    })
  })

  describe('Encryption', () => {
    it('should encrypt secrets (not stored as plaintext)', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'my-secret-123')

      // Access the database directly to verify encryption
      const db = new Database(join(tempDir, 'secrets.sqlite'))
      const row = db
        .prepare('SELECT value FROM secrets WHERE extension_id = ? AND key = ?')
        .get('ext-1', 'api-key') as { value: Buffer } | undefined

      expect(row).toBeDefined()
      // Value should be encrypted (not plaintext)
      const valueStr = row!.value.toString('utf8')
      expect(valueStr).not.toContain('my-secret-123')
      db.close()
    })

    it('should use different encryption keys for different master secrets', async () => {
      const manager1 = new SecretsManager({
        databasePath: join(tempDir, 'secrets1.sqlite'),
        encryptionKey: deriveEncryptionKey('secret-1'),
        openDatabase: (path) => new Database(path),
      })

      const manager2 = new SecretsManager({
        databasePath: join(tempDir, 'secrets2.sqlite'),
        encryptionKey: deriveEncryptionKey('secret-2'),
        openDatabase: (path) => new Database(path),
      })

      await manager1.set('ext-1', null, 'key', 'value')
      await manager2.set('ext-1', null, 'key', 'value')

      // Read raw values from databases
      const db1 = new Database(join(tempDir, 'secrets1.sqlite'))
      const db2 = new Database(join(tempDir, 'secrets2.sqlite'))

      const row1 = db1.prepare('SELECT value FROM secrets').get() as { value: Buffer }
      const row2 = db2.prepare('SELECT value FROM secrets').get() as { value: Buffer }

      // Encrypted values should be different
      expect(Buffer.compare(row1.value, row2.value)).not.toBe(0)

      db1.close()
      db2.close()
    })

    it('should fail to decrypt with wrong key', async () => {
      await secretsManager.set('ext-1', null, 'api-key', 'secret-value')

      // Create a new manager with different encryption key
      const wrongKeyManager = new SecretsManager({
        databasePath: join(tempDir, 'secrets.sqlite'),
        encryptionKey: deriveEncryptionKey('wrong-master-secret'),
        openDatabase: (path) => new Database(path),
      })

      // Should throw or return corrupted data when decrypting with wrong key
      await expect(wrongKeyManager.get('ext-1', null, 'api-key')).rejects.toThrow()
    })
  })

  describe('deleteAllForExtension', () => {
    it('should delete all secrets for an extension', async () => {
      await secretsManager.set('ext-1', null, 'key1', 'value1')
      await secretsManager.set('ext-1', null, 'key2', 'value2')
      await secretsManager.set('ext-1', 'user-1', 'key3', 'value3')
      await secretsManager.set('ext-2', null, 'key4', 'value4')

      await secretsManager.deleteAllForExtension('ext-1')

      const ext1Keys = await secretsManager.list('ext-1', null)
      const ext1UserKeys = await secretsManager.list('ext-1', 'user-1')
      const ext2Keys = await secretsManager.list('ext-2', null)

      expect(ext1Keys).toHaveLength(0)
      expect(ext1UserKeys).toHaveLength(0)
      expect(ext2Keys).toHaveLength(1)
    })
  })

  describe('deriveEncryptionKey', () => {
    it('should derive consistent keys from same master secret', () => {
      const key1 = deriveEncryptionKey('master-secret')
      const key2 = deriveEncryptionKey('master-secret')
      expect(Buffer.compare(key1, key2)).toBe(0)
    })

    it('should derive different keys from different master secrets', () => {
      const key1 = deriveEncryptionKey('master-secret-1')
      const key2 = deriveEncryptionKey('master-secret-2')
      expect(Buffer.compare(key1, key2)).not.toBe(0)
    })

    it('should derive 32-byte keys', () => {
      const key = deriveEncryptionKey('master-secret')
      expect(key.length).toBe(32)
    })
  })
})
