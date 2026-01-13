import path from 'node:path'
import { fileURLToPath } from 'node:url'

export { SchedulerService } from './SchedulerService.js'
export type {
  SchedulerMisfirePolicy,
  SchedulerSchedule,
  SchedulerJobRequest,
  SchedulerFirePayload,
  SchedulerFireEvent,
  SchedulerServiceOptions,
  SchedulerDb,
} from './SchedulerService.js'
export { schedulerJobs, schedulerSchema } from './schema.js'

/**
 * Get migrations path for scheduler package
 */
export function getSchedulerMigrationsPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.join(__dirname, 'migrations')
}
