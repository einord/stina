/**
 * Thrown when a migration marker file is found on startup, indicating that a
 * previous migration run was interrupted before completing. The user must
 * either delete the marker file to retry, or restore from backup.
 */
export class MigrationInterruptedError extends Error {
  readonly markerPath: string

  constructor(markerPath: string) {
    super(
      `Migration was interrupted in a previous run. Marker file present: ${markerPath}. Delete the marker file to retry, or restore from backup.`
    )
    this.name = 'MigrationInterruptedError'
    this.markerPath = markerPath
  }
}
