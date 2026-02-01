# @stina/scheduler

Job scheduling package for Stina extensions. Enables extensions to schedule one-time, recurring, and cron-based jobs with persistent storage and user context propagation.

## Package Overview

The scheduler package provides a reliable job scheduling system for extensions. Jobs are persisted to SQLite, survive application restarts, and automatically propagate user context when fired. The scheduler integrates with the Extension Host to deliver scheduled events to the appropriate extension handlers.

**Key features:**

- Three schedule types: one-time (`at`), recurring (`interval`), and cron expressions
- Persistent job storage in SQLite
- Misfire handling policies
- User ID propagation for multi-user support
- Automatic job disabling when extensions are unloaded

## Key Exports

```typescript
// Main service
export { SchedulerService } from './SchedulerService.js'

// Types
export type {
  SchedulerMisfirePolicy,    // 'run_once' | 'skip'
  SchedulerSchedule,         // at | cron | interval union type
  SchedulerJobRequest,       // Job registration input
  SchedulerFirePayload,      // Payload delivered to extension
  SchedulerFireEvent,        // Full fire event with extensionId
  SchedulerServiceOptions,   // Constructor options
  SchedulerDb,               // Database type alias
} from './SchedulerService.js'

// Schema and migrations
export { schedulerJobs, schedulerSchema } from './schema.js'
export function getSchedulerMigrationsPath(): string
```

## Schedule Types

### One-time (`at`)

Fires once at a specific ISO 8601 datetime.

```typescript
scheduler.schedule('my-extension', {
  id: 'reminder-1',
  userId: 'user-123',
  schedule: { type: 'at', at: '2025-06-15T09:00:00Z' },
  payload: { message: 'Meeting in 15 minutes' },
})
```

### Cron (`cron`)

Fires according to a cron expression. Supports optional timezone.

```typescript
scheduler.schedule('my-extension', {
  id: 'daily-summary',
  userId: 'user-123',
  schedule: {
    type: 'cron',
    cron: '0 9 * * *',        // Every day at 9:00
    timezone: 'Europe/Stockholm',
  },
  payload: { type: 'daily-summary' },
})
```

### Interval (`interval`)

Fires repeatedly at a fixed interval in milliseconds.

```typescript
scheduler.schedule('my-extension', {
  id: 'health-check',
  userId: 'user-123',
  schedule: { type: 'interval', everyMs: 60_000 },  // Every minute
})
```

## Misfire Policies

When a job's scheduled time has passed (e.g., application was stopped), the misfire policy determines behavior:

| Policy     | Behavior                                                    |
|------------|-------------------------------------------------------------|
| `run_once` | **Default.** Execute the job once, then resume normal schedule |
| `skip`     | Skip the missed execution entirely                          |

```typescript
scheduler.schedule('my-extension', {
  id: 'optional-task',
  userId: 'user-123',
  schedule: { type: 'at', at: '2025-01-01T00:00:00Z' },
  misfire: 'skip',  // Don't run if we missed it
})
```

The `delayMs` field in `SchedulerFirePayload` indicates how late the job fired (0 if on time).

## userId Propagation

All scheduled jobs require a `userId`. This enables multi-user support where:

1. **Job registration** - The `userId` is stored with the job in the database
2. **Job firing** - The `userId` is included in the `SchedulerFirePayload`
3. **Extension handler** - Receives the `userId` to execute in the correct user context

```typescript
interface SchedulerFirePayload {
  id: string
  payload?: Record<string, unknown>
  scheduledFor: string    // When the job was supposed to run
  firedAt: string         // When it actually fired
  delayMs: number         // Difference in milliseconds
  userId: string          // User context for this job
}
```

Legacy jobs without `userId` are automatically disabled with a warning logged.

## Integration with Extension Host

The `SchedulerService` is instantiated by the Extension Host with an `onFire` callback:

```typescript
const scheduler = new SchedulerService({
  db: database,
  onFire: (event: SchedulerFireEvent) => {
    // Route to extension's onScheduledJob handler
    const extension = extensionRegistry.get(event.extensionId)
    if (!extension) {
      return false  // Extension not loaded, disable job
    }
    extension.onScheduledJob(event.payload)
    return true     // Job processed, keep it active
  },
  logger: appLogger,
})

scheduler.start()
```

Returning `false` from `onFire` disables the job (useful when an extension is unloaded).

## Database Schema

### Table: `scheduler_jobs`

| Column           | Type    | Description                                      |
|------------------|---------|--------------------------------------------------|
| `id`             | TEXT PK | Composite key: `{extensionId}:{jobId}`           |
| `extension_id`   | TEXT    | Extension that owns this job                     |
| `job_id`         | TEXT    | Extension-assigned job identifier                |
| `user_id`        | TEXT    | User context for the job                         |
| `schedule_type`  | TEXT    | `'at'`, `'cron'`, or `'interval'`                |
| `schedule_value` | TEXT    | ISO datetime, cron expression, or milliseconds   |
| `payload_json`   | TEXT    | Optional JSON payload                            |
| `timezone`       | TEXT    | Timezone for cron jobs (e.g., `'Europe/Stockholm'`) |
| `misfire_policy` | TEXT    | `'run_once'` (default) or `'skip'`               |
| `last_run_at`    | TEXT    | ISO datetime of last execution                   |
| `next_run_at`    | TEXT    | ISO datetime of next scheduled run               |
| `enabled`        | INTEGER | 1 = active, 0 = disabled                         |
| `created_at`     | TEXT    | ISO datetime when job was created                |
| `updated_at`     | TEXT    | ISO datetime of last modification                |

### Indexes

- `idx_scheduler_jobs_next_run` on `next_run_at` - Efficient lookup of due jobs
- `idx_scheduler_jobs_enabled` on `enabled` - Filter active jobs
- `idx_scheduler_jobs_user_id` on `user_id` - Query jobs by user

## Implementation Notes

### Timer Management

The scheduler uses `setTimeout` rather than continuous polling:

1. Queries the database for the next job's `next_run_at`
2. Sets a timer for that exact time
3. When the timer fires, processes all due jobs
4. Reschedules the timer for the next pending job

### setTimeout Overflow Protection

JavaScript's `setTimeout` accepts a 32-bit signed integer for the delay, with a maximum value of 2^31 - 1 milliseconds (approximately 24.8 days). Larger values cause a `TimeoutOverflowWarning` and get clamped to 1ms, creating a busy loop.

The scheduler caps delays to `MAX_TIMEOUT_MS = 2147483647`. For jobs scheduled further out, the timer wakes early, finds no due jobs, and reschedules with another capped delay.

### Cron Parsing

Uses the `cron-parser` library (v4.9.0) for cron expression parsing. Supports:

- Standard 5-field cron expressions
- Timezone-aware scheduling via the `tz` option
- Next occurrence calculation from any starting point

### Job ID Scoping

Job IDs are scoped to extensions using a composite key format:

```
{extensionId}:{jobId}
```

This allows different extensions to use the same job IDs without conflicts. When an extension calls `schedule()` or `cancel()`, only its own jobs are affected.

### Upsert Behavior

Calling `schedule()` with an existing job ID updates the job configuration rather than creating a duplicate. This enables extensions to modify schedules without manual cancellation.
