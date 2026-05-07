/**
 * Worker-side recall API — disposable generation guard.
 *
 * The brief mandates: re-registering a provider must invalidate prior
 * Disposables, so a stale `dispose()` cannot silently unregister the live
 * provider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRecallApi, _resetRecallApiState } from './recallApi.js'

describe('recallApi — disposable generation guard', () => {
  beforeEach(() => {
    _resetRecallApiState()
  })

  it('stale dispose() after re-registration is a no-op (does not send unregister)', () => {
    const sendNotification = vi.fn()
    const postMessage = vi.fn()
    const api = createRecallApi(sendNotification, postMessage)

    const handler1 = vi.fn().mockResolvedValue([])
    const handler2 = vi.fn().mockResolvedValue([])

    const d1 = api.registerProvider(handler1)
    const d2 = api.registerProvider(handler2)

    expect(sendNotification).toHaveBeenCalledTimes(2)
    expect(sendNotification).toHaveBeenNthCalledWith(1, 'recall.registerProvider', {})
    expect(sendNotification).toHaveBeenNthCalledWith(2, 'recall.registerProvider', {})

    sendNotification.mockClear()

    // Stale Disposable: must NOT post recall.unregisterProvider
    d1.dispose()
    expect(sendNotification).not.toHaveBeenCalled()

    // Current Disposable: posts unregister with its own generation
    d2.dispose()
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(sendNotification).toHaveBeenCalledWith('recall.unregisterProvider', expect.objectContaining({ generation: expect.any(Number) }))
  })

  it('current Disposable dispose() clears the slot and dispatches unregister', () => {
    const sendNotification = vi.fn()
    const postMessage = vi.fn()
    const api = createRecallApi(sendNotification, postMessage)

    const d = api.registerProvider(vi.fn().mockResolvedValue([]))
    sendNotification.mockClear()

    d.dispose()
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(sendNotification.mock.calls[0]![0]).toBe('recall.unregisterProvider')
  })

  it('double-dispose() of the same Disposable is idempotent (no second unregister)', () => {
    const sendNotification = vi.fn()
    const postMessage = vi.fn()
    const api = createRecallApi(sendNotification, postMessage)

    const d = api.registerProvider(vi.fn().mockResolvedValue([]))
    sendNotification.mockClear()

    d.dispose()
    d.dispose()
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })
})
