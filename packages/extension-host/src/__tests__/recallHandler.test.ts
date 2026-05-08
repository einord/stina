/**
 * Unit tests for RecallHandler and RecallProviderRegistry integration
 *
 * Covers:
 * - Permission denied path
 * - Happy path: register adds to registry
 * - Unregister removes from registry
 * - Re-register replaces (registry size stays at 1)
 * - Query proxy: when registry queries, sendRecallQueryRequest is called
 * - Auto-unregister on extension unload
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecallHandler } from '../ExtensionHost.handlers.recall.js'
import { RecallProviderRegistry } from '@stina/memory'
import type { HandlerContext } from '../ExtensionHost.handlers.js'
import type { RequestMethod } from '@stina/extension-api'
import { PermissionChecker } from '../PermissionChecker.js'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeContext(permissions: string[]): HandlerContext {
  const checker = new PermissionChecker(permissions as import('@stina/extension-api').Permission[])
  return {
    extensionId: 'test-ext',
    extension: {
      id: 'test-ext',
      manifest: {
        id: 'test-ext',
        name: 'Test',
        version: '0.0.1',
        main: 'index.js',
        description: 'Test extension',
        permissions: permissions as import('@stina/extension-api').Permission[],
        author: { name: 'Test' },
        license: 'MIT',
        platforms: ['web'],
      },
      status: 'active',
      permissionChecker: checker,
      settings: {},
      registeredProviders: new Map(),
      registeredTools: new Map(),
      registeredActions: new Map(),
    },
    options: {
      storagePath: '/tmp/test',
    },
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('RecallHandler', () => {
  let registry: RecallProviderRegistry
  let sendRecallQueryRequest: ReturnType<typeof vi.fn>
  let handler: RecallHandler

  beforeEach(() => {
    registry = new RecallProviderRegistry()
    sendRecallQueryRequest = vi.fn().mockResolvedValue([])
    handler = new RecallHandler(registry, sendRecallQueryRequest)
  })

  it('throws when extension lacks recall.register permission', async () => {
    const ctx = makeContext(['tools.register'])
    await expect(handler.handle(ctx, 'recall.registerProvider' as RequestMethod, {})).rejects.toThrow(
      /recall.register/
    )
    expect(registry.size()).toBe(0)
  })

  it('registers a provider entry in the registry', async () => {
    const ctx = makeContext(['recall.register'])
    await handler.handle(ctx, 'recall.registerProvider' as RequestMethod, {})
    expect(registry.has('test-ext')).toBe(true)
    expect(registry.size()).toBe(1)
  })

  it('unregisters a provider from the registry', async () => {
    const ctx = makeContext(['recall.register'])
    await handler.handle(ctx, 'recall.registerProvider' as RequestMethod, {})
    expect(registry.size()).toBe(1)
    await handler.handle(ctx, 'recall.unregisterProvider' as RequestMethod, { generation: 1 })
    expect(registry.size()).toBe(0)
  })

  it('re-register replaces prior handler (registry size stays at 1)', async () => {
    const ctx = makeContext(['recall.register'])
    await handler.handle(ctx, 'recall.registerProvider' as RequestMethod, {})
    await handler.handle(ctx, 'recall.registerProvider' as RequestMethod, {})
    expect(registry.size()).toBe(1)
  })

  it('proxy handler calls sendRecallQueryRequest with the right extension id', async () => {
    const ctx = makeContext(['recall.register'])
    await handler.handle(ctx, 'recall.registerProvider' as RequestMethod, {})

    const query = { query: 'test query' }
    await registry.query(query)

    expect(sendRecallQueryRequest).toHaveBeenCalledWith('test-ext', query)
  })

  it('proxy handler forwards result from sendRecallQueryRequest', async () => {
    const ctx = makeContext(['recall.register'])
    const canned = [
      { source: 'extension' as const, source_detail: 'test-ext', content: 'hello', ref_id: 'r1', score: 1 },
    ]
    sendRecallQueryRequest.mockResolvedValue(canned)

    await handler.handle(ctx, 'recall.registerProvider' as RequestMethod, {})

    const results = await registry.query({ query: 'hello' })
    expect(results).toEqual(canned)
  })

  it('unregister on extension unload: registry.unregister removes the entry', () => {
    // Simulates the defensive cleanup done in ExtensionHost.unloadExtension
    registry.register('test-ext', async () => [])
    expect(registry.has('test-ext')).toBe(true)
    registry.unregister('test-ext')
    expect(registry.has('test-ext')).toBe(false)
  })
})
