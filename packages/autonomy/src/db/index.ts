/**
 * Database surface for @stina/autonomy. Schema migrations live under
 * `./migrations/` and are copied to `dist/db/migrations/` at build time
 * (see tsup.config.ts).
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export {
  autoPolicies,
  activityLogEntries,
  toolSeveritySnapshots,
  runtimeMarkers,
  autonomySchema,
  type AutonomyDb,
} from './schema.js'

export {
  AutoPolicyRepository,
  type CreateAutoPolicyInput,
} from './repositories/AutoPolicyRepository.js'
export {
  ActivityLogRepository,
  type AppendEntryInput,
  type ListEntriesOptions,
} from './repositories/ActivityLogRepository.js'
export { ToolSeveritySnapshotRepository } from './repositories/ToolSeveritySnapshotRepository.js'
export { RuntimeMarkersRepository } from './repositories/RuntimeMarkersRepository.js'

/**
 * Migrations folder for @stina/autonomy. Pass to the multi-package
 * `runMigrations` runner alongside other package paths.
 */
export function getAutonomyMigrationsPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.join(__dirname, 'migrations')
}
