import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { SchedulerService } from './SchedulerService.js'

const migrationSql = readFileSync(
  new URL('./migrations/0001_create_scheduler_jobs.sql', import.meta.url),
  'utf-8'
)

const createDb = () => {
  const rawDb = new Database(':memory:')
  rawDb.exec(migrationSql)
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
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(fired).toEqual(['job-4'])

    // Job should be disabled, so no more fires
    await vi.advanceTimersByTimeAsync(1000)
    expect(fired).toEqual(['job-4'])

    scheduler.stop()
    rawDb.close()
  })
})
