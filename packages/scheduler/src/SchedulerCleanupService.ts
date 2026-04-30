import type { SchedulerRepository } from './SchedulerRepository.js'

export interface SchedulerCleanupLogger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

export interface SchedulerCleanupServiceOptions {
  repository: SchedulerRepository
  /**
   * Resolve the retention (in days) for the given user. Return `0` or a
   * negative number to disable cleanup for that user (jobs are kept forever).
   */
  getRetentionDays: (userId: string) => Promise<number> | number
  /**
   * Retention (in days) used for legacy scheduled jobs that have no `userId`
   * (left over from an earlier version of the scheduler). These jobs are
   * never re-fired, so they exist only as dead weight. Defaults to 30 days.
   * Set to `0` or a negative number to keep them indefinitely.
   */
  legacyRetentionDays?: number
  /**
   * How often the cleanup loop runs. Defaults to 6 hours.
   */
  intervalMs?: number
  /**
   * Initial delay before the first run after `start()`. Defaults to 1 minute,
   * to avoid blocking startup and to give the rest of the app time to settle.
   */
  initialDelayMs?: number
  logger?: SchedulerCleanupLogger
  now?: () => Date
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
const DEFAULT_INITIAL_DELAY_MS = 60 * 1000
const DEFAULT_LEGACY_RETENTION_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Periodically removes completed (disabled) scheduled jobs that are older
 * than the user's configured retention window. Runs in-process alongside the
 * SchedulerService and is safe to start/stop together with it.
 */
export class SchedulerCleanupService {
  private readonly repository: SchedulerRepository
  private readonly getRetentionDays: SchedulerCleanupServiceOptions['getRetentionDays']
  private readonly legacyRetentionDays: number
  private readonly intervalMs: number
  private readonly initialDelayMs: number
  private readonly logger?: SchedulerCleanupLogger
  private readonly now: () => Date
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(options: SchedulerCleanupServiceOptions) {
    this.repository = options.repository
    this.getRetentionDays = options.getRetentionDays
    this.legacyRetentionDays = options.legacyRetentionDays ?? DEFAULT_LEGACY_RETENTION_DAYS
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
    this.logger = options.logger
    this.now = options.now ?? (() => new Date())
  }

  /**
   * Start the cleanup loop. Safe to call multiple times.
   */
  start(): void {
    if (this.running) return
    this.running = true
    this.scheduleNext(this.initialDelayMs)
  }

  /**
   * Stop the cleanup loop and clear any pending timer.
   */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * Run a single cleanup pass. Exposed for testing and for ad-hoc invocation.
   * @returns Total number of rows deleted across all users
   */
  async runOnce(): Promise<number> {
    let totalDeleted = 0
    let userIds: string[] = []

    try {
      userIds = this.repository.listUserIds()
    } catch (error) {
      this.logger?.error('Scheduler cleanup failed to list users', {
        error: error instanceof Error ? error.message : String(error),
      })
      return 0
    }

    for (const userId of userIds) {
      try {
        const retentionDays = await this.getRetentionDays(userId)
        if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
          continue
        }
        const cutoffMs = this.now().getTime() - retentionDays * MS_PER_DAY
        const beforeIso = new Date(cutoffMs).toISOString()
        const deleted = this.repository.deleteDisabledBefore(userId, beforeIso)
        if (deleted > 0) {
          totalDeleted += deleted
          this.logger?.info('Scheduler cleanup removed old jobs', {
            userId,
            retentionDays,
            deleted,
          })
        }
      } catch (error) {
        this.logger?.error('Scheduler cleanup failed for user', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (Number.isFinite(this.legacyRetentionDays) && this.legacyRetentionDays > 0) {
      try {
        const cutoffMs = this.now().getTime() - this.legacyRetentionDays * MS_PER_DAY
        const beforeIso = new Date(cutoffMs).toISOString()
        const deleted = this.repository.deleteDisabledLegacyBefore(beforeIso)
        if (deleted > 0) {
          totalDeleted += deleted
          this.logger?.info('Scheduler cleanup removed legacy jobs without userId', {
            retentionDays: this.legacyRetentionDays,
            deleted,
          })
        }
      } catch (error) {
        this.logger?.error('Scheduler cleanup failed for legacy jobs', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return totalDeleted
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      void this.tick()
    }, Math.max(0, delayMs))
  }

  private async tick(): Promise<void> {
    if (!this.running) return
    try {
      await this.runOnce()
    } catch (error) {
      this.logger?.error('Scheduler cleanup tick failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.scheduleNext(this.intervalMs)
    }
  }
}
