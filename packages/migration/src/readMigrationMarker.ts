import fs from 'node:fs'

export interface MigrationMarker {
  started_at?: number
  phase?: string
  last_completed_package?: string | null
  backup_path?: string | null
  source_version?: string
  target_version?: string
}

/**
 * Reads and parses the migration marker file.
 * Returns null if the file is missing, unreadable, or contains invalid JSON.
 * Never throws.
 */
export function readMigrationMarker(markerPath: string): MigrationMarker | null {
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8')) as MigrationMarker
  } catch {
    return null
  }
}
