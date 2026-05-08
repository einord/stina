/**
 * Unit tests for spawnWelcomeThreadIfNew.
 *
 * Uses in-memory stubs for markersRepo and emitEventInternal — no DB or app
 * server needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawnWelcomeThreadIfNew, WELCOME_MESSAGE_TEXT, type WelcomeThreadDeps } from '../welcomeThread.js'
import type { RuntimeMarkersRepository } from '@stina/autonomy/db'

/** Build a minimal stub markersRepo backed by an in-memory Map. */
function makeMarkersRepo(initial: Map<string, boolean> = new Map()): RuntimeMarkersRepository {
  const store = new Map<string, boolean>(initial)
  return {
    has: vi.fn(async (key: string, userId: string) => store.get(`${key}:${userId}`) ?? false),
    set: vi.fn(async (key: string, userId: string) => {
      store.set(`${key}:${userId}`, true)
    }),
  } as unknown as RuntimeMarkersRepository
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  }
}

describe('spawnWelcomeThreadIfNew', () => {
  const userId = 'user-test-1'

  it('first call spawns a thread and sets the marker; returns { spawned: true, thread_id }', async () => {
    const markersRepo = makeMarkersRepo()
    const emitEventInternal = vi.fn().mockResolvedValue({ thread_id: 'thread-abc' })
    const logger = makeLogger()

    const result = await spawnWelcomeThreadIfNew(
      { markersRepo, emitEventInternal, logger },
      { userId }
    )

    expect(result).toEqual({ spawned: true, thread_id: 'thread-abc' })

    // emitEventInternal was called with the correct input
    expect(emitEventInternal).toHaveBeenCalledOnce()
    expect(emitEventInternal).toHaveBeenCalledWith({
      trigger: { kind: 'stina', reason: 'system_notice' },
      content: { kind: 'system', message: WELCOME_MESSAGE_TEXT },
      title: 'Välkommen till Stina',
    })

    // marker was set after spawn
    expect(markersRepo.set).toHaveBeenCalledOnce()
    expect(await markersRepo.has('welcome_thread_v1', userId)).toBe(true)
  })

  it('second call (marker present) is a no-op; returns { spawned: false } without calling emitEventInternal', async () => {
    // Pre-populate the marker as if the first boot already ran.
    const markersRepo = makeMarkersRepo(new Map([['welcome_thread_v1:user-test-1', true]]))
    const emitEventInternal = vi.fn()
    const logger = makeLogger()

    const result = await spawnWelcomeThreadIfNew(
      { markersRepo, emitEventInternal, logger },
      { userId }
    )

    expect(result).toEqual({ spawned: false })
    expect(emitEventInternal).not.toHaveBeenCalled()
  })

  it('emitEventInternal throws → returns { spawned: false }, marker is NOT set, error is logged', async () => {
    const markersRepo = makeMarkersRepo()
    const emitEventInternal = vi.fn().mockRejectedValue(new Error('spawn error'))
    const logger = makeLogger()

    const result = await spawnWelcomeThreadIfNew(
      { markersRepo, emitEventInternal, logger },
      { userId }
    )

    expect(result).toEqual({ spawned: false })
    expect(markersRepo.set).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('emitEventInternal failed'),
      expect.objectContaining({ userId, err: 'spawn error' })
    )
  })

  it('marker write fails after successful spawn → returns { spawned: true, thread_id }, error is logged', async () => {
    const markersRepo = makeMarkersRepo()
    // Override the set stub to throw
    vi.spyOn(markersRepo, 'set').mockRejectedValue(new Error('db write error'))
    const emitEventInternal = vi.fn().mockResolvedValue({ thread_id: 'thread-xyz' })
    const logger = makeLogger()

    const result = await spawnWelcomeThreadIfNew(
      { markersRepo, emitEventInternal, logger },
      { userId }
    )

    // Thread was spawned successfully
    expect(result).toEqual({ spawned: true, thread_id: 'thread-xyz' })

    // But the marker write failed — a warn was logged
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('marker write failed'),
      expect.objectContaining({ userId, thread_id: 'thread-xyz', err: 'db write error' })
    )
  })
})
