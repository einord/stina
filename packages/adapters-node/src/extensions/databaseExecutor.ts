import { getRawDb } from '../db/connection.js'

export function createExtensionDatabaseExecutor(): (
  extensionId: string,
  sql: string,
  params?: unknown[]
) => Promise<unknown[]> {
  return async (_extensionId: string, sql: string, params?: unknown[]) => {
    const db = getRawDb()
    if (!db) {
      throw new Error('Database not initialized')
    }

    const statement = db.prepare(sql)
    if (statement.reader) {
      return statement.all(...(params ?? []))
    }

    statement.run(...(params ?? []))
    return []
  }
}
