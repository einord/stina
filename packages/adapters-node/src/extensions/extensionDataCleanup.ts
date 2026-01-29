import type { Database } from 'better-sqlite3'
import type { Logger } from '@stina/core'

export interface ExtensionDataCleanupResult {
  tablesDropped: string[]
  modelConfigsDeleted: number
}

/**
 * Validates that a table name matches the expected extension table pattern
 * to prevent SQL injection vulnerabilities.
 * Returns true if the table name is valid (contains only alphanumeric, underscores, starts with 'ext_')
 */
function isValidExtensionTableName(tableName: string): boolean {
  // Must start with ext_ and contain only alphanumeric characters and underscores
  return /^ext_[a-zA-Z0-9_]+$/.test(tableName)
}

/**
 * Deletes all data associated with an extension from the database.
 * This includes:
 * 1. Tables with prefix `ext_{sanitizedExtensionId}_` (where extensionId has dashes replaced with underscores)
 * 2. Model configs where `provider_extension_id` matches the extensionId
 */
export async function deleteExtensionData(
  db: Database,
  extensionId: string,
  logger: Logger
): Promise<ExtensionDataCleanupResult> {
  const tablesDropped: string[] = []

  // Sanitize extensionId by replacing dashes with underscores for table prefix matching
  const sanitizedId = extensionId.replace(/-/g, '_')
  const tablePrefix = `ext_${sanitizedId}_%`

  logger.info('Deleting extension data', { extensionId, sanitizedId, tablePrefix })

  // Find all tables with the extension prefix
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    AND name LIKE ?
  `
    )
    .all(tablePrefix) as { name: string }[]

  logger.info('Found extension tables', { count: tables.length, tables: tables.map(t => t.name) })

  let remainingTables = tables.map((t) => t.name)

  // Drop tables iteratively - some tables may have foreign key dependencies
  // Keep trying until all are dropped or no progress is made
  while (remainingTables.length > 0) {
    const tablesBeforePass = remainingTables.length
    const stillRemaining: string[] = []

    for (const tableName of remainingTables) {
      // Validate table name to prevent SQL injection
      if (!isValidExtensionTableName(tableName)) {
        logger.error('Found invalid extension table name in database', { tableName, extensionId })
        continue
      }

      try {
        db.prepare(`DROP TABLE IF EXISTS "${tableName}"`).run()
        tablesDropped.push(tableName)
        logger.info('Dropped table', { tableName })
      } catch (error) {
        // Table couldn't be dropped (likely due to FK constraints), try again next pass
        logger.warn('Could not drop table yet (may have FK dependencies)', {
          tableName,
          error: error instanceof Error ? error.message : String(error)
        })
        stillRemaining.push(tableName)
      }
    }

    remainingTables = stillRemaining

    // If no tables were dropped in this pass, we're stuck (circular dependencies or other issues)
    if (remainingTables.length > 0 && remainingTables.length === tablesBeforePass) {
      logger.error('Unable to drop remaining tables due to dependencies', {
        remainingTables: remainingTables.join(', ')
      })
      break
    }
  }

  // Delete model configs for this extension
  const result = db
    .prepare(`DELETE FROM model_configs WHERE provider_extension_id = ?`)
    .run(extensionId)
  const modelConfigsDeleted = result.changes

  if (modelConfigsDeleted > 0) {
    logger.info('Deleted model configs for extension', { extensionId, count: modelConfigsDeleted })
  }

  return {
    tablesDropped,
    modelConfigsDeleted
  }
}
