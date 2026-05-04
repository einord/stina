/**
 * Database surface for @stina/threads. Schema migrations live under
 * `./migrations/` and are copied to `dist/db/migrations/` at build time
 * (see tsup.config.ts).
 *
 * Migrations are applied by the existing multi-package runner in
 * @stina/adapters-node — pass the path returned by `getThreadsMigrationsPath()`
 * to its `runMigrations` entry. See docs/redesign-2026/08-migration.md
 * §"Schema versioning contract" for the long-term plan; v1 reuses the
 * existing runner.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export { threads, messages, threadsSchema, type ThreadsDb } from './schema.js'
export {
  ThreadRepository,
  type CreateThreadInput,
  type ListThreadsOptions,
} from './repository.js'

/**
 * Migrations folder for @stina/threads. Pass to the multi-package
 * `runMigrations` runner alongside other package paths.
 */
export function getThreadsMigrationsPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.join(__dirname, 'migrations')
}
