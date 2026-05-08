import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { SchedulerService } from './SchedulerService.js'
import { schedulerJobs } from './schema.js'
import { eq } from 'drizzle-orm'

const migration0001 = readFileSync(
  new URL('./migrations/0001_create_scheduler_jobs.sql', import.meta.url),
  'utf-8'
)
const migration0002 = readFileSync(
  new URL('./migrations/0002_add_user_id.sql', import.meta.url),
  'utf-8'
)
const migration0003 = readFileSync(
  new URL('./migrations/0003_add_run_status.sql', import.meta.url),
  'utf-8'
)
const migration0004 = readFileSync(
  new URL('./migrations/0004_add_emit_config.sql', import.meta.url),
  'utf-8'
)

const createDb = () => {
  const rawDb = new Database(':memory:')
  rawDb.exec(migration0001)
  rawDb.exec(migration0002)
  rawDb.exec(migration0003)
  rawDb.exec(migration0004)
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

  // ─── emit field — persistence ──────────────────────────────────────────────

  it('schedule() with emit persists emit_json as a JSON string', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()

    const scheduler = new SchedulerService({
      db,
      onFire: () => true,
    })

    scheduler.schedule('ext', {
      id: 'emit-job',
      schedule: { type: 'interval', everyMs: 60_000 },
      userId: 'user-1',
      emit: { description: 'Daily summary', payload: { key: 'value' } },
    })

    const row = db
      .select({ emitJson: schedulerJobs.emitJson })
      .from(schedulerJobs)
      .where(eq(schedulerJobs.jobId, 'emit-job'))
      .get()

    expect(row?.emitJson).toBeTruthy()
    const parsed = JSON.parse(row!.emitJson!)
    expect(parsed.description).toBe('Daily summary')
    expect(parsed.payload).toEqual({ key: 'value' })

    scheduler.stop()
    rawDb.close()
  })

  it('schedule() without emit leaves emit_json as NULL', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()

    const scheduler = new SchedulerService({
      db,
      onFire: () => true,
    })

    scheduler.schedule('ext', {
      id: 'no-emit-job',
      schedule: { type: 'interval', everyMs: 60_000 },
      userId: 'user-1',
    })

    const row = db
      .select({ emitJson: schedulerJobs.emitJson })
      .from(schedulerJobs)
      .where(eq(schedulerJobs.jobId, 'no-emit-job'))
      .get()

    expect(row?.emitJson).toBeNull()

    scheduler.stop()
    rawDb.close()
  })

  it('schedule() with emit: { description: "" } throws via assertValidJob', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()

    const scheduler = new SchedulerService({
      db,
      onFire: () => true,
    })

    expect(() =>
      scheduler.schedule('ext', {
        id: 'bad-emit',
        schedule: { type: 'interval', everyMs: 60_000 },
        userId: 'user-1',
        emit: { description: '' },
      })
    ).toThrow('emit.description must be a non-empty string')

    scheduler.stop()
    rawDb.close()
  })

  it('schedule() with emit: { description: "X", payload: "not-an-object" } throws via assertValidJob', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()

    const scheduler = new SchedulerService({
      db,
      onFire: () => true,
    })

    expect(() =>
      scheduler.schedule('ext', {
        id: 'bad-payload',
        schedule: { type: 'interval', everyMs: 60_000 },
        userId: 'user-1',
        emit: { description: 'X', payload: 'not-an-object' as unknown as Record<string, unknown> },
      })
    ).toThrow('emit.payload must be a plain object if provided')

    scheduler.stop()
    rawDb.close()
  })

  // ─── emit field — fireJob branching ────────────────────────────────────────

  it('fireJob for a row with emit_json produces a SchedulerFireEvent with emit set', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()
    const fired: Array<{ emit: unknown }> = []

    const scheduler = new SchedulerService({
      db,
      onFire: (event) => {
        fired.push({ emit: event.emit })
        return true
      },
    })

    scheduler.start()
    scheduler.schedule('ext', {
      id: 'emit-fire-job',
      schedule: { type: 'at', at: '2025-01-01T00:00:00Z' },
      userId: 'user-1',
      emit: { description: 'Test summary' },
    })

    await vi.runOnlyPendingTimersAsync()

    expect(fired).toHaveLength(1)
    expect(fired[0]?.emit).toEqual({ description: 'Test summary' })

    scheduler.stop()
    rawDb.close()
  })

  it('fireJob for a row without emit_json produces event.emit === undefined', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()
    const fired: Array<{ emit: unknown }> = []

    const scheduler = new SchedulerService({
      db,
      onFire: (event) => {
        fired.push({ emit: event.emit })
        return true
      },
    })

    scheduler.start()
    scheduler.schedule('ext', {
      id: 'no-emit-fire-job',
      schedule: { type: 'at', at: '2025-01-01T00:00:00Z' },
      userId: 'user-1',
    })

    await vi.runOnlyPendingTimersAsync()

    expect(fired).toHaveLength(1)
    expect(fired[0]?.emit).toBeUndefined()

    scheduler.stop()
    rawDb.close()
  })

  it('corrupted emit_json falls through to legacy path with warn log; event.emit === undefined', async () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    const { rawDb, db } = createDb()
    const fired: Array<{ emit: unknown }> = []
    const warnMessages: string[] = []

    const scheduler = new SchedulerService({
      db,
      logger: {
        debug: () => {},
        info: () => {},
        warn: (msg) => { warnMessages.push(msg) },
        error: () => {},
      },
      onFire: (event) => {
        fired.push({ emit: event.emit })
        return true
      },
    })

    // Schedule a normal job first to create the row, then corrupt emit_json directly
    scheduler.schedule('ext', {
      id: 'corrupt-emit-job',
      schedule: { type: 'at', at: '2025-01-01T00:00:00Z' },
      userId: 'user-1',
    })

    // Directly set a corrupted emit_json value using the raw DB
    rawDb.prepare(
      "UPDATE scheduler_jobs SET emit_json = '{not-json' WHERE job_id = 'corrupt-emit-job'"
    ).run()

    scheduler.start()
    await vi.runOnlyPendingTimersAsync()

    expect(fired).toHaveLength(1)
    expect(fired[0]?.emit).toBeUndefined()
    expect(warnMessages.some((m) => m.includes('emit_json'))).toBe(true)

    scheduler.stop()
    rawDb.close()
  })

  // ─── migration apply test ────────────────────────────────────────────────────

  it('migration 0004 applies cleanly: existing rows get emit_json = NULL', () => {
    // Apply only 0001–0003 first, insert a legacy row, then apply 0004
    const rawDb = new Database(':memory:')
    rawDb.exec(migration0001)
    rawDb.exec(migration0002)
    rawDb.exec(migration0003)

    const now = new Date('2025-01-01T00:00:00Z').toISOString()
    rawDb.prepare(
      `INSERT INTO scheduler_jobs
        (id, extension_id, job_id, user_id, schedule_type, schedule_value,
         misfire_policy, next_run_at, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('ext:legacy-job', 'ext', 'legacy-job', 'user-1', 'interval', '60000',
      'run_once', now, 1, now, now)

    // Apply migration 0004
    rawDb.exec(migration0004)

    // Existing row should have emit_json = NULL
    const row = rawDb.prepare('SELECT emit_json FROM scheduler_jobs WHERE job_id = ?').get('legacy-job') as { emit_json: string | null }
    expect(row.emit_json).toBeNull()

    // Column is queryable — insert a row with emit_json set
    rawDb.prepare(
      `INSERT INTO scheduler_jobs
        (id, extension_id, job_id, user_id, schedule_type, schedule_value,
         misfire_policy, next_run_at, enabled, created_at, updated_at, emit_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('ext:new-job', 'ext', 'new-job', 'user-1', 'interval', '60000',
      'run_once', now, 1, now, now, JSON.stringify({ description: 'Test' }))

    const newRow = rawDb.prepare('SELECT emit_json FROM scheduler_jobs WHERE job_id = ?').get('new-job') as { emit_json: string | null }
    expect(JSON.parse(newRow.emit_json!).description).toBe('Test')

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
