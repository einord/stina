/**
 * Database surface for @stina/memory. Schema migrations live under
 * `./migrations/` and are copied to `dist/db/migrations/` at build time
 * (see tsup.config.ts).
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export {
  standingInstructions,
  profileFacts,
  threadSummaries,
  memorySchema,
  type MemoryDb,
} from './schema.js'

export {
  StandingInstructionRepository,
  type CreateStandingInstructionInput,
} from './repositories/StandingInstructionRepository.js'
export {
  ProfileFactRepository,
  type CreateProfileFactInput,
} from './repositories/ProfileFactRepository.js'
export { ThreadSummaryRepository } from './repositories/ThreadSummaryRepository.js'

/**
 * Migrations folder for @stina/memory. Pass to the multi-package
 * `runMigrations` runner alongside other package paths.
 */
export function getMemoryMigrationsPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.join(__dirname, 'migrations')
}
