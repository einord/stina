/**
 * PermissionChecker Tests
 *
 * Tests for extension permission validation, including security checks.
 */

import { describe, it, expect } from 'vitest'
import { PermissionChecker } from './PermissionChecker.js'
import type { ExtensionManifest } from '@stina/extension-api'

describe('PermissionChecker', () => {
  describe('validateCollectionAccess', () => {
    it('should allow access to declared collections', () => {
      const manifest: ExtensionManifest = {
        id: 'test-ext',
        version: '1.0.0',
        name: 'Test Extension',
        description: 'A test extension',
        author: { name: 'Test Author' },
        main: 'index.js',
        engines: { stina: '>=0.5.0' },
        permissions: ['storage.collections'],
        contributes: {
          storage: {
            collections: {
              users: { indexes: ['name'] },
              tasks: {},
            },
          },
        },
      }

      const checker = new PermissionChecker({
        permissions: manifest.permissions ?? [],
        storageContributions: manifest.contributes?.storage,
      })
      const result = checker.validateCollectionAccess('test-ext', 'users')
      expect(result.allowed).toBe(true)
    })

    it('should deny access to undeclared collections', () => {
      const manifest: ExtensionManifest = {
        id: 'test-ext',
        version: '1.0.0',
        name: 'Test Extension',
        description: 'A test extension',
        author: { name: 'Test Author' },
        main: 'index.js',
        engines: { stina: '>=0.5.0' },
        permissions: ['storage.collections'],
        contributes: {
          storage: {
            collections: {
              users: {},
            },
          },
        },
      }

      const checker = new PermissionChecker({
        permissions: manifest.permissions ?? [],
        storageContributions: manifest.contributes?.storage,
      })
      const result = checker.validateCollectionAccess('test-ext', 'tasks')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('not declared')
    })

    it('should deny access when no collections are declared', () => {
      const manifest: ExtensionManifest = {
        id: 'test-ext',
        version: '1.0.0',
        name: 'Test Extension',
        description: 'A test extension',
        author: { name: 'Test Author' },
        main: 'index.js',
        engines: { stina: '>=0.5.0' },
        permissions: ['storage.collections'],
      }

      const checker = new PermissionChecker({
        permissions: manifest.permissions ?? [],
      })
      const result = checker.validateCollectionAccess('test-ext', 'users')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('No storage collections declared')
    })

    it('should prevent unrestricted collection access without declarations', () => {
      const manifest: ExtensionManifest = {
        id: 'malicious-ext',
        version: '1.0.0',
        name: 'Malicious Extension',
        description: 'A malicious extension',
        author: { name: 'Bad Actor' },
        main: 'index.js',
        engines: { stina: '>=0.5.0' },
        permissions: ['storage.collections'],
        // No contributes.storage.collections declared
      }

      const checker = new PermissionChecker({
        permissions: manifest.permissions ?? [],
      })

      // Should deny access to any collection
      expect(checker.validateCollectionAccess('malicious-ext', 'users').allowed).toBe(false)
      expect(checker.validateCollectionAccess('malicious-ext', 'passwords').allowed).toBe(false)
      expect(checker.validateCollectionAccess('malicious-ext', 'secrets').allowed).toBe(false)
    })
  })

  describe('checkStorageCollectionsAccess', () => {
    it('should allow access when permission is granted', () => {
      const checker = new PermissionChecker(['storage.collections'])
      const result = checker.checkStorageCollectionsAccess()
      expect(result.allowed).toBe(true)
    })

    it('should deny access when permission is not granted', () => {
      const checker = new PermissionChecker([])
      const result = checker.checkStorageCollectionsAccess()
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('storage.collections')
    })
  })

  describe('checkSecretsAccess', () => {
    it('should allow access when permission is granted', () => {
      const checker = new PermissionChecker(['secrets.manage'])
      const result = checker.checkSecretsAccess()
      expect(result.allowed).toBe(true)
    })

    it('should deny access when permission is not granted', () => {
      const checker = new PermissionChecker([])
      const result = checker.checkSecretsAccess()
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('secrets.manage')
    })
  })

  describe('Security scenarios', () => {
    it('should prevent malicious collection names', () => {
      const checker = new PermissionChecker({
        permissions: ['storage.collections'],
        storageContributions: {
          collections: {
            users: {},
          },
        },
      })

      // Even if declared, invalid collection names should be caught at validation
      // This test just ensures the permission check doesn't bypass security
      const result = checker.validateCollectionAccess('test-ext', '../../../secrets')
      expect(result.allowed).toBe(false)
    })
  })
})
