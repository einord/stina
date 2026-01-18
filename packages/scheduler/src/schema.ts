import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const schedulerJobs = sqliteTable(
  'scheduler_jobs',
  {
    id: text('id').primaryKey(),
    extensionId: text('extension_id').notNull(),
    jobId: text('job_id').notNull(),
    /** Optional user ID for user-scoped jobs. If null, the job is global. */
    userId: text('user_id'),
    scheduleType: text('schedule_type')
      .notNull()
      .$type<'at' | 'cron' | 'interval'>(),
    scheduleValue: text('schedule_value').notNull(),
    payloadJson: text('payload_json'),
    timezone: text('timezone'),
    misfirePolicy: text('misfire_policy')
      .notNull()
      .$type<'run_once' | 'skip'>()
      .default('run_once'),
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    nextRunIdx: index('idx_scheduler_jobs_next_run').on(table.nextRunAt),
    enabledIdx: index('idx_scheduler_jobs_enabled').on(table.enabled),
    userIdIdx: index('idx_scheduler_jobs_user_id').on(table.userId),
  })
)

export const schedulerSchema = { schedulerJobs }
