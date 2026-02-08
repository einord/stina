import type { ChatDb } from '@stina/chat/db'

/**
 * Cast an adapters-node DB to ChatDb.
 * adapters-node DB uses a specific schema type, while ChatDb uses `any`.
 * They are structurally compatible but TypeScript requires an explicit cast.
 */
export function asChatDb(db: unknown): ChatDb {
  return db as ChatDb
}
