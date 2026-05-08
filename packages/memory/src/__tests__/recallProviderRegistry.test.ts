import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RecallProviderRegistry } from '../recall/RecallProviderRegistry.js'
import type { RecallResult } from '@stina/core'

describe('RecallProviderRegistry', () => {
  let registry: RecallProviderRegistry

  beforeEach(() => {
    registry = new RecallProviderRegistry()
  })

  it('registers and unregisters providers', () => {
    registry.register('ext-a', async () => [])
    expect(registry.has('ext-a')).toBe(true)
    expect(registry.size()).toBe(1)
    registry.unregister('ext-a')
    expect(registry.has('ext-a')).toBe(false)
  })

  it('runs all providers in parallel and merges by score', async () => {
    registry.register('ext-a', async () => [
      { source: 'extension', source_detail: 'ext-a', content: 'a-low', ref_id: 'a1', score: 0.3 },
      { source: 'extension', source_detail: 'ext-a', content: 'a-high', ref_id: 'a2', score: 0.9 },
    ])
    registry.register('ext-b', async () => [
      { source: 'extension', source_detail: 'ext-b', content: 'b-mid', ref_id: 'b1', score: 0.6 },
    ])

    const results = await registry.query({ query: 'test' })
    expect(results.map((r) => r.content)).toEqual(['a-high', 'b-mid', 'a-low'])
  })

  it('truncates to limit after merging', async () => {
    registry.register('ext-a', async () => [
      { source: 'extension', source_detail: 'ext-a', content: 'x1', ref_id: '1', score: 0.9 },
      { source: 'extension', source_detail: 'ext-a', content: 'x2', ref_id: '2', score: 0.8 },
      { source: 'extension', source_detail: 'ext-a', content: 'x3', ref_id: '3', score: 0.7 },
    ])

    const results = await registry.query({ query: 'q', limit: 2 })
    expect(results.map((r) => r.ref_id)).toEqual(['1', '2'])
  })

  it('skips failing providers and reports via onError', async () => {
    registry.register('ext-bad', async () => {
      throw new Error('boom')
    })
    registry.register('ext-good', async () => [
      { source: 'extension', source_detail: 'ext-good', content: 'ok', ref_id: 'g1', score: 0.5 },
    ])

    const onError = vi.fn()
    const results = await registry.query({ query: 'q' }, { onError })

    expect(results.map((r) => r.ref_id)).toEqual(['g1'])
    expect(onError).toHaveBeenCalledWith('ext-bad', expect.any(Error))
  })

  it('re-registering with the same id replaces the prior handler', async () => {
    registry.register('ext-a', async (): Promise<RecallResult[]> => [
      { source: 'extension', source_detail: 'ext-a', content: 'old', ref_id: 'o', score: 1 },
    ])
    registry.register('ext-a', async (): Promise<RecallResult[]> => [
      { source: 'extension', source_detail: 'ext-a', content: 'new', ref_id: 'n', score: 1 },
    ])

    const results = await registry.query({ query: 'q' })
    expect(results.map((r) => r.content)).toEqual(['new'])
  })
})
