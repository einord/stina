import * as cronParser from 'cron-parser'
import { and, asc, eq, lte } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { schedulerJobs } from './schema.js'

export type SchedulerMisfirePolicy = 'run_once' | 'skip'

export type SchedulerSchedule =
  | { type: 'at'; at: string }
  | { type: 'cron'; cron: string; timezone?: string }
  | { type: 'interval'; everyMs: number }

export interface SchedulerJobRequest {
  id: string
  schedule: SchedulerSchedule
  payload?: Record<string, unknown>
  misfire?: SchedulerMisfirePolicy
}

export interface SchedulerFirePayload {
  id: string
  payload?: Record<string, unknown>
  scheduledFor: string
  firedAt: string
  delayMs: number
}

export interface SchedulerFireEvent {
  extensionId: string
  payload: SchedulerFirePayload
}

export type SchedulerDb = BetterSQLite3Database<Record<string, unknown>>

export interface SchedulerServiceOptions {
  db: SchedulerDb
  onFire: (event: SchedulerFireEvent) => void
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, context?: Record<string, unknown>): void
  }
  now?: () => Date
}

type SchedulerJobRow = typeof schedulerJobs.$inferSelect

export class SchedulerService {
  private readonly db: SchedulerDb
  private readonly onFire: (event: SchedulerFireEvent) => void
  private readonly logger?: SchedulerServiceOptions['logger']
  private readonly now: () => Date
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private ticking = false

  constructor(options: SchedulerServiceOptions) {
    this.db = options.db
    this.onFire = options.onFire
    this.logger = options.logger
    this.now = options.now ?? (() => new Date())
  }

  /**
   * Start the scheduler loop.
   */
  start(): void {
    if (this.running) return
    this.running = true
    this.scheduleNextTick(0)
  }

  /**
   * Stop the scheduler loop.
   */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * Register or update a scheduled job for an extension.
   */
  schedule(extensionId: string, job: SchedulerJobRequest): void {
    this.assertValidJob(job)
    const now = this.now()
    const scheduleType = job.schedule.type
    const scheduleValue = this.getScheduleValue(job.schedule)
    const timezone =
      job.schedule.type === 'cron' ? job.schedule.timezone ?? null : null
    const misfirePolicy: SchedulerMisfirePolicy = job.misfire ?? 'run_once'
    const nextRunAt = this.computeNextRunAt(job.schedule, now, timezone)

    const id = this.buildJobId(extensionId, job.id)
    const nowIso = now.toISOString()
    const payloadJson = job.payload ? JSON.stringify(job.payload) : null

    this.db
      .insert(schedulerJobs)
      .values({
        id,
        extensionId,
        jobId: job.id,
        scheduleType,
        scheduleValue,
        payloadJson,
        timezone,
        misfirePolicy,
        nextRunAt,
        enabled: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: schedulerJobs.id,
        set: {
          scheduleType,
          scheduleValue,
          payloadJson,
          timezone,
          misfirePolicy,
          nextRunAt,
          enabled: true,
          updatedAt: nowIso,
        },
      })
      .run()

    this.scheduleNextTick()
  }

  /**
   * Disable a scheduled job for an extension.
   */
  cancel(extensionId: string, jobId: string): void {
    const id = this.buildJobId(extensionId, jobId)
    this.db
      .update(schedulerJobs)
      .set({ enabled: false, updatedAt: this.now().toISOString() })
      .where(eq(schedulerJobs.id, id))
      .run()
    this.scheduleNextTick()
  }

  private scheduleNextTick(delayMs?: number): void {
    if (!this.running) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const nextDelay = delayMs ?? this.getNextDelay()
    if (nextDelay === null) return

    const safeDelay = Math.max(0, nextDelay)
    this.timer = setTimeout(() => {
      void this.tick()
    }, safeDelay)
  }

  private async tick(): Promise<void> {
    if (!this.running || this.ticking) return
    this.ticking = true

    try {
      const now = this.now()
      const nowIso = now.toISOString()

      const rows = this.db
        .select()
        .from(schedulerJobs)
        .where(and(eq(schedulerJobs.enabled, true), lte(schedulerJobs.nextRunAt, nowIso)))
        .orderBy(asc(schedulerJobs.nextRunAt))
        .all()

      for (const row of rows) {
        this.fireJob(row, now)
      }
    } catch (error) {
      this.logger?.error('Scheduler tick failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.ticking = false
      this.scheduleNextTick()
    }
  }

  private fireJob(row: SchedulerJobRow, now: Date): void {
    const scheduledFor = row.nextRunAt
    const firedAt = now.toISOString()
    const scheduledTime = new Date(scheduledFor).getTime()
    const delayMs = Math.max(0, now.getTime() - scheduledTime)

    const misfirePolicy = row.misfirePolicy ?? 'run_once'
    const shouldSkip = delayMs > 0 && misfirePolicy === 'skip'

    if (!shouldSkip) {
      const payload = row.payloadJson ? this.safeParsePayload(row.payloadJson) : undefined
      this.onFire({
        extensionId: row.extensionId,
        payload: {
          id: row.jobId,
          payload,
          scheduledFor,
          firedAt,
          delayMs,
        },
      })
    }

    const scheduleType = row.scheduleType
    if (scheduleType === 'at') {
      this.disableJob(row.id, firedAt)
      return
    }

    const schedule = this.parseSchedule(row)
    const nextRunAt = this.tryComputeNextRunAt(schedule, now, row.timezone, row.id)
    if (!nextRunAt) {
      this.disableJob(row.id, firedAt)
      return
    }
    this.updateNextRun(row.id, firedAt, nextRunAt)
  }

  private getNextDelay(): number | null {
    const rows = this.db
      .select({ id: schedulerJobs.id, nextRunAt: schedulerJobs.nextRunAt })
      .from(schedulerJobs)
      .where(eq(schedulerJobs.enabled, true))
      .orderBy(asc(schedulerJobs.nextRunAt))
      .all()

    if (rows.length === 0) return null

    const now = this.now()
    const nowIso = now.toISOString()

    for (const row of rows) {
      const nextTime = new Date(row.nextRunAt).getTime()
      if (!Number.isNaN(nextTime)) {
        return nextTime - now.getTime()
      }
      this.logger?.warn('Invalid scheduler next_run_at; disabling job', {
        id: row.id,
        nextRunAt: row.nextRunAt,
      })
      this.disableJob(row.id, nowIso)
    }

    return null
  }

  private updateNextRun(id: string, firedAt: string, nextRunAt: string): void {
    this.db
      .update(schedulerJobs)
      .set({
        lastRunAt: firedAt,
        nextRunAt,
        updatedAt: firedAt,
      })
      .where(eq(schedulerJobs.id, id))
      .run()
  }

  private disableJob(id: string, firedAt: string): void {
    this.db
      .update(schedulerJobs)
      .set({
        enabled: false,
        lastRunAt: firedAt,
        updatedAt: firedAt,
      })
      .where(eq(schedulerJobs.id, id))
      .run()
  }

  private computeNextRunAt(
    schedule: SchedulerSchedule,
    from: Date,
    timezone?: string | null
  ): string {
    switch (schedule.type) {
      case 'at': {
        const date = this.parseDate(schedule.at)
        if (!date) {
          throw new Error('Invalid schedule.at value')
        }
        return date.toISOString()
      }
      case 'interval': {
        if (!Number.isFinite(schedule.everyMs) || schedule.everyMs <= 0) {
          throw new Error('Invalid schedule.everyMs value')
        }
        return new Date(from.getTime() + schedule.everyMs).toISOString()
      }
      case 'cron': {
        const interval = cronParser.parseExpression(schedule.cron, {
          currentDate: from,
          tz: timezone ?? undefined,
        })
        return interval.next().toDate().toISOString()
      }
    }
  }

  private getScheduleValue(schedule: SchedulerSchedule): string {
    switch (schedule.type) {
      case 'at':
        return schedule.at
      case 'interval':
        return String(schedule.everyMs)
      case 'cron':
        return schedule.cron
    }
  }

  private parseSchedule(row: SchedulerJobRow): SchedulerSchedule {
    switch (row.scheduleType) {
      case 'interval':
        return { type: 'interval', everyMs: Number(row.scheduleValue) }
      case 'cron':
        return { type: 'cron', cron: row.scheduleValue, timezone: row.timezone ?? undefined }
      default:
        return { type: 'at', at: row.scheduleValue }
    }
  }

  private tryComputeNextRunAt(
    schedule: SchedulerSchedule,
    from: Date,
    timezone: string | null,
    jobId: string
  ): string | null {
    try {
      return this.computeNextRunAt(schedule, from, timezone)
    } catch (error) {
      this.logger?.error('Invalid scheduler schedule; disabling job', {
        id: jobId,
        schedule,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  private assertValidJob(job: SchedulerJobRequest): void {
    if (!job.id || typeof job.id !== 'string' || !job.id.trim()) {
      throw new Error('Job id is required')
    }
    this.assertValidSchedule(job.schedule)
  }

  private assertValidSchedule(schedule: SchedulerSchedule): void {
    switch (schedule.type) {
      case 'at': {
        const date = this.parseDate(schedule.at)
        if (!date) {
          throw new Error('Invalid schedule.at value')
        }
        return
      }
      case 'interval': {
        if (!Number.isFinite(schedule.everyMs) || schedule.everyMs <= 0) {
          throw new Error('Invalid schedule.everyMs value')
        }
        return
      }
      case 'cron': {
        if (!schedule.cron || typeof schedule.cron !== 'string') {
          throw new Error('Invalid schedule.cron value')
        }
        try {
          cronParser.parseExpression(schedule.cron, {
            currentDate: this.now(),
            tz: schedule.timezone ?? undefined,
          })
        } catch (error) {
          throw new Error(
            `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`
          )
        }
        return
      }
    }
  }

  private parseDate(value: string): Date | null {
    if (!value || typeof value !== 'string') return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  private safeParsePayload(payload: string): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(payload)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      return undefined
    } catch (error) {
      this.logger?.warn('Failed to parse scheduler payload', {
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }

  private buildJobId(extensionId: string, jobId: string): string {
    return `${extensionId}:${jobId}`
  }
}
