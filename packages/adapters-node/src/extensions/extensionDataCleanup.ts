import type { Database } from 'better-sqlite3'

export interface ExtensionDataCleanupResult {
  tablesDropped: string[]
  modelConfigsDeleted: number
}

/**
 * Deletes all data associated with an extension from the database.
 * This includes:
 * 1. Tables with prefix `ext_{sanitizedExtensionId}_` (where extensionId has dashes replaced with underscores)
 * 2. Model configs where `provider_extension_id` matches the extensionId
 */
export async function deleteExtensionData(
  db: Database,
  extensionId: string
): Promise<ExtensionDataCleanupResult> {
  const tablesDropped: string[] = []

  // Sanitize extensionId by replacing dashes with underscores for table prefix matching
  const sanitizedId = extensionId.replace(/-/g, '_')
  const tablePrefix = `ext_${sanitizedId}_%`

  console.log(`[deleteExtensionData] extensionId: ${extensionId}, sanitizedId: ${sanitizedId}, tablePrefix: ${tablePrefix}`)

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

  console.log(`[deleteExtensionData] Found ${tables.length} tables:`, tables.map(t => t.name))

  let remainingTables = tables.map((t) => t.name)

  // Drop tables iteratively - some tables may have foreign key dependencies
  // Keep trying until all are dropped or no progress is made
  while (remainingTables.length > 0) {
    const tablesBeforePass = remainingTables.length
    const stillRemaining: string[] = []

    for (const tableName of remainingTables) {
      try {
        db.prepare(`DROP TABLE IF EXISTS "${tableName}"`).run()
        tablesDropped.push(tableName)
        console.log(`Dropped table: ${tableName}`)
      } catch (error) {
        // Table couldn't be dropped (likely due to FK constraints), try again next pass
        console.log(
          `Could not drop table ${tableName} yet (may have FK dependencies): ${error instanceof Error ? error.message : String(error)}`
        )
        stillRemaining.push(tableName)
      }
    }

    remainingTables = stillRemaining

    // If no tables were dropped in this pass, we're stuck (circular dependencies or other issues)
    if (remainingTables.length > 0 && remainingTables.length === tablesBeforePass) {
      console.error(
        `Unable to drop remaining tables due to dependencies: ${remainingTables.join(', ')}`
      )
      break
    }
  }

  // Delete model configs for this extension
  const result = db
    .prepare(`DELETE FROM model_configs WHERE provider_extension_id = ?`)
    .run(extensionId)
  const modelConfigsDeleted = result.changes

  if (modelConfigsDeleted > 0) {
    console.log(`Deleted ${modelConfigsDeleted} model config(s) for extension: ${extensionId}`)
  }

  return {
    tablesDropped,
    modelConfigsDeleted
  }
}
