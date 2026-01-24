import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { SchedulerService } from './SchedulerService.js'

const migration0001 = readFileSync(
  new URL('./migrations/0001_create_scheduler_jobs.sql', import.meta.url),
  'utf-8'
)
const migration0002 = readFileSync(
  new URL('./migrations/0002_add_user_id.sql', import.meta.url),
  'utf-8'
)

const createDb = () => {
  const rawDb = new Database(':memory:')
  rawDb.exec(migration0001)
  rawDb.exec(migration0002)
  const db = drizzle(rawDb)
  return { rawDb, db }
}

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires a one-shot job once when late (run_once)', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:10:00Z'))
    const { rawDb, db } = createDb()
    const fired: Array<{ id: string; delayMs: number }> = []

    const scheduler = new SchedulerService({
      db,
      onFire: (event) => {
        fired.push({ id: event.payload.id, delayMs: event.payload.delayMs })
        return true
      },
    })

    scheduler.start()
    scheduler.schedule('ext', {
      id: 'job-1',
      schedule: { type: 'at', at: '2025-01-01T00:00:00Z' },
      userId: 'user-1',
    })

    await vi.runOnlyPendingTimersAsync()

    expect(fired).toHaveLength(1)
    expect(fired[0]?.id).toBe('job-1')
    expect(fired[0]?.delayMs).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(fired).toHaveLength(1)

    scheduler.stop()
    rawDb.close()
  })

  it('skips a late one-shot job when misfire policy is skip', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:10:00Z'))
    const { rawDb, db } = createDb()
    const fired: Array<{ id: string }> = []

    const scheduler = new SchedulerService({
      db,
      onFire: (event) => {
        fired.push({ id: event.payload.id })
        return true
      },
    })

    scheduler.start()
    scheduler.schedule('ext', {
      id: 'job-2',
      schedule: { type: 'at', at: '2025-01-01T00:00:00Z' },
      misfire: 'skip',
      userId: 'user-1',
    })

    await vi.runOnlyPendingTimersAsync()

    expect(fired).toHaveLength(0)

    scheduler.stop()
    rawDb.close()
  })

  it('fires interval jobs repeatedly', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()
    const fired: string[] = []

    const scheduler = new SchedulerService({
      db,
      onFire: (event) => {
        fired.push(event.payload.id)
        return true
      },
    })

    scheduler.start()
    scheduler.schedule('ext', {
      id: 'job-3',
      schedule: { type: 'interval', everyMs: 1000 },
      userId: 'user-1',
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(fired).toEqual(['job-3'])

    await vi.advanceTimersByTimeAsync(1000)
    expect(fired).toEqual(['job-3', 'job-3'])

    scheduler.stop()
    rawDb.close()
  })

  it('disables job when onFire returns false', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()
    const fired: string[] = []

    const scheduler = new SchedulerService({
      db,
      onFire: (event) => {
        fired.push(event.payload.id)
        return false // Simulate extension not found
      },
    })

    scheduler.start()
    scheduler.schedule('ext', {
      id: 'job-4',
      schedule: { type: 'interval', everyMs: 1000 },
      userId: 'user-1',
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(fired).toEqual(['job-4'])

    // Job should be disabled, so no more fires
    await vi.advanceTimersByTimeAsync(1000)
    expect(fired).toEqual(['job-4'])

    scheduler.stop()
    rawDb.close()
  })

  it('caps setTimeout delay to MAX_TIMEOUT_MS to prevent overflow warnings', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()
    const fired: string[] = []

    const scheduler = new SchedulerService({
      db,
      onFire: (event) => {
        fired.push(event.payload.id)
        return true
      },
    })

    scheduler.start()

    // Schedule a job 50 days in the future (far beyond MAX_TIMEOUT_MS of ~24.8 days)
    const futureDate = new Date('2025-02-20T00:00:00Z') // 50 days from start
    scheduler.schedule('ext', {
      id: 'far-future-job',
      schedule: { type: 'at', at: futureDate.toISOString() },
      userId: 'user-1',
    })

    // Maximum delay for setTimeout (2^31 - 1 ms ≈ 24.8 days)
    // This matches the MAX_TIMEOUT_MS constant in SchedulerService
    const MAX_TIMEOUT_MS = 2147483647
    const ONE_DAY_MS = 24 * 60 * 60 * 1000

    // The scheduler should have set a timer, not thrown or caused a busy loop
    // Advance time by MAX_TIMEOUT_MS (≈24.8 days)
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS)

    // Job should not have fired yet (still 25+ days in the future)
    expect(fired).toHaveLength(0)

    // Advance by another MAX_TIMEOUT_MS (another ≈24.8 days, total ≈49.6 days)
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS)
    expect(fired).toHaveLength(0)

    // Advance just a bit more to reach the 50-day mark - now it should fire
    await vi.advanceTimersByTimeAsync(ONE_DAY_MS) // 1 more day to reach 50
    expect(fired).toEqual(['far-future-job'])

    scheduler.stop()
    rawDb.close()
  })
})
