import type { ThreadsDb } from '@stina/threads/db'
import type { AutonomyDb } from '@stina/autonomy/db'

/**
 * Cast an adapters-node DB to one of the redesign-2026 typed Drizzle DBs.
 * The adapters-node DB and the per-package typed DBs are structurally
 * compatible but TypeScript requires an explicit cast — same pattern as
 * `asChatDb` and `apps/api/src/asRedesign2026Db.ts`.
 */
export function asThreadsDb(db: unknown): ThreadsDb {
  return db as ThreadsDb
}

export function asAutonomyDb(db: unknown): AutonomyDb {
  return db as AutonomyDb
}
