import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchedulerCleanupService } from './SchedulerCleanupService.js'
import type { SchedulerRepository } from './SchedulerRepository.js'

interface DeleteCall {
  userId: string
  beforeIso: string
}

interface FakeRepoOptions {
  userIds?: string[]
  retentionByUser?: Record<string, number | undefined>
  deleteCounts?: Record<string, number>
  legacyDeleteCount?: number
  throwForUser?: string
  throwForLegacy?: boolean
  throwForListUserIds?: boolean
}

const createFakeRepo = (options: FakeRepoOptions = {}) => {
  const userDeleteCalls: DeleteCall[] = []
  const legacyDeleteCalls: string[] = []

  const repo = {
    listUserIds: vi.fn(() => {
      if (options.throwForListUserIds) {
        throw new Error('listUserIds boom')
      }
      return options.userIds ?? []
    }),
    deleteDisabledBefore: vi.fn((userId: string, beforeIso: string) => {
      userDeleteCalls.push({ userId, beforeIso })
      if (options.throwForUser === userId) {
        throw new Error(`delete failed for ${userId}`)
      }
      return options.deleteCounts?.[userId] ?? 0
    }),
    deleteDisabledLegacyBefore: vi.fn((beforeIso: string) => {
      legacyDeleteCalls.push(beforeIso)
      if (options.throwForLegacy) {
        throw new Error('legacy boom')
      }
      return options.legacyDeleteCount ?? 0
    }),
  } satisfies Partial<SchedulerRepository>

  return {
    repo: repo as unknown as SchedulerRepository,
    userDeleteCalls,
    legacyDeleteCalls,
    listUserIdsMock: repo.listUserIds,
    deleteDisabledBeforeMock: repo.deleteDisabledBefore,
    deleteDisabledLegacyBeforeMock: repo.deleteDisabledLegacyBefore,
  }
}

const NOW = new Date('2026-04-30T12:00:00Z')
const MS_PER_DAY = 24 * 60 * 60 * 1000

describe('SchedulerCleanupService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('runOnce', () => {
    it('deletes per-user with the correct cutoff and returns total deleted', async () => {
      const { repo, userDeleteCalls } = createFakeRepo({
        userIds: ['u1', 'u2'],
        retentionByUser: { u1: 30, u2: 7 },
        deleteCounts: { u1: 4, u2: 2, legacy: 0 },
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: (userId) =>
          ({ u1: 30, u2: 7 } as Record<string, number>)[userId] ?? 0,
        legacyRetentionDays: 0, // disable legacy pass for this test
        now: () => NOW,
      })

      const total = await service.runOnce()

      expect(total).toBe(6)
      expect(userDeleteCalls).toHaveLength(2)
      expect(userDeleteCalls[0]).toEqual({
        userId: 'u1',
        beforeIso: new Date(NOW.getTime() - 30 * MS_PER_DAY).toISOString(),
      })
      expect(userDeleteCalls[1]).toEqual({
        userId: 'u2',
        beforeIso: new Date(NOW.getTime() - 7 * MS_PER_DAY).toISOString(),
      })
    })

    it.each([
      ['zero', 0],
      ['negative', -5],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('skips users whose retention is %s', async (_label, retention) => {
      const { repo, deleteDisabledBeforeMock } = createFakeRepo({
        userIds: ['u1'],
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => retention,
        legacyRetentionDays: 0,
        now: () => NOW,
      })

      const total = await service.runOnce()

      expect(total).toBe(0)
      expect(deleteDisabledBeforeMock).not.toHaveBeenCalled()
    })

    it('continues with other users if one user throws', async () => {
      const { repo, userDeleteCalls } = createFakeRepo({
        userIds: ['u1', 'u2', 'u3'],
        deleteCounts: { u1: 1, u3: 2 },
        throwForUser: 'u2',
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 0,
        now: () => NOW,
      })

      const total = await service.runOnce()

      expect(total).toBe(3)
      expect(userDeleteCalls.map((c) => c.userId)).toEqual(['u1', 'u2', 'u3'])
    })

    it('returns 0 and skips delete calls if listUserIds throws', async () => {
      const { repo, deleteDisabledBeforeMock, deleteDisabledLegacyBeforeMock } = createFakeRepo({
        throwForListUserIds: true,
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 30,
        now: () => NOW,
      })

      const total = await service.runOnce()

      expect(total).toBe(0)
      expect(deleteDisabledBeforeMock).not.toHaveBeenCalled()
      expect(deleteDisabledLegacyBeforeMock).not.toHaveBeenCalled()
    })

    it('runs legacy cleanup with legacyRetentionDays after the per-user pass', async () => {
      const { repo, legacyDeleteCalls } = createFakeRepo({
        userIds: ['u1'],
        deleteCounts: { u1: 0 },
        legacyDeleteCount: 5,
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 14,
        now: () => NOW,
      })

      const total = await service.runOnce()

      expect(total).toBe(5)
      expect(legacyDeleteCalls).toHaveLength(1)
      expect(legacyDeleteCalls[0]).toBe(
        new Date(NOW.getTime() - 14 * MS_PER_DAY).toISOString()
      )
    })

    it('skips legacy cleanup when legacyRetentionDays is 0 or negative', async () => {
      const { repo, deleteDisabledLegacyBeforeMock } = createFakeRepo({
        userIds: [],
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 0,
        now: () => NOW,
      })

      await service.runOnce()
      expect(deleteDisabledLegacyBeforeMock).not.toHaveBeenCalled()
    })

    it('still completes the per-user pass if legacy cleanup throws', async () => {
      const { repo } = createFakeRepo({
        userIds: ['u1'],
        deleteCounts: { u1: 3 },
        throwForLegacy: true,
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 30,
        now: () => NOW,
      })

      const total = await service.runOnce()
      expect(total).toBe(3)
    })

    it('supports both sync and async getRetentionDays callbacks', async () => {
      const { repo } = createFakeRepo({
        userIds: ['sync-user', 'async-user'],
        deleteCounts: { 'sync-user': 1, 'async-user': 2 },
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: (userId) =>
          userId === 'sync-user' ? 10 : Promise.resolve(20),
        legacyRetentionDays: 0,
        now: () => NOW,
      })

      const total = await service.runOnce()
      expect(total).toBe(3)
    })
  })

  describe('start/stop loop', () => {
    it('runs the first cleanup after initialDelayMs and then on intervalMs', async () => {
      const { repo, deleteDisabledBeforeMock } = createFakeRepo({
        userIds: ['u1'],
        deleteCounts: { u1: 0 },
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 0,
        initialDelayMs: 1_000,
        intervalMs: 60_000,
        now: () => new Date(),
      })

      service.start()
      expect(deleteDisabledBeforeMock).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1_000)
      expect(deleteDisabledBeforeMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(60_000)
      expect(deleteDisabledBeforeMock).toHaveBeenCalledTimes(2)

      service.stop()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(deleteDisabledBeforeMock).toHaveBeenCalledTimes(2)
    })

    it('start() is idempotent', async () => {
      const { repo, deleteDisabledBeforeMock } = createFakeRepo({
        userIds: ['u1'],
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 0,
        initialDelayMs: 500,
        intervalMs: 10_000,
        now: () => new Date(),
      })

      service.start()
      service.start()
      service.start()

      await vi.advanceTimersByTimeAsync(500)
      expect(deleteDisabledBeforeMock).toHaveBeenCalledTimes(1)

      service.stop()
    })

    it('reschedules the next tick even when runOnce throws unexpectedly', async () => {
      const { repo, deleteDisabledBeforeMock } = createFakeRepo({
        throwForListUserIds: true,
      })

      const service = new SchedulerCleanupService({
        repository: repo,
        getRetentionDays: () => 30,
        legacyRetentionDays: 0,
        initialDelayMs: 100,
        intervalMs: 1_000,
        now: () => new Date(),
      })

      service.start()
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(1_000)

      // listUserIds is invoked once per tick; we expect at least two ticks
      expect((repo.listUserIds as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(
        2
      )
      expect(deleteDisabledBeforeMock).not.toHaveBeenCalled()

      service.stop()
    })
  })
})
