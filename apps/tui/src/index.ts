import path from 'node:path'
import fs from 'node:fs'
import { initI18n } from '@stina/i18n'
import { initDatabase, createConsoleLogger, getLogLevelFromEnv, getRawDb, getAppDataDir } from '@stina/adapters-node'
import { runMigrationIfNeeded, readMigrationMarker } from '@stina/migration'
import { DefaultUserService, getAuthMigrationsPath } from '@stina/auth'
import { UserRepository } from '@stina/auth/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { getSchedulerMigrationsPath } from '@stina/scheduler'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { getMemoryMigrationsPath } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { createCli } from './cli.js'

const logger = createConsoleLogger(getLogLevelFromEnv())

/**
 * Initialize database and ensure system user exists for local TUI mode.
 */
async function initializeApp() {
  // Early marker check — must happen before initDatabase so no subsystems
  // initialize if a previous migration run was interrupted.
  const markerPath = path.join(getAppDataDir(), 'migration-in-progress')
  if (fs.existsSync(markerPath)) {
    const marker = readMigrationMarker(markerPath)
    const lines = [
      'FATAL: Migration was interrupted in a previous run — Stina cannot start safely.',
      `  Marker file:   ${markerPath}`,
      `  Phase reached: ${marker?.phase ?? 'unknown'}`,
      `  Started:       ${marker?.started_at ? new Date(marker.started_at).toISOString() : 'unknown'}`,
      `  Backup path:   ${marker?.backup_path ?? '(unavailable)'}`,
      '',
      'Recovery options:',
      '  1. Resume:  Delete the marker file and restart the server.',
      `  2. Restore: Reinstall version ${marker?.source_version ?? '(see marker file)'} and run:`,
      `               stina-restore "${marker?.backup_path ?? '<backup-path>'}"`,
      '  3. Contact: Keep the marker file and contact support.',
    ]
    logger.error(lines.join('\n'))
    process.exit(1)
  }

  // Initialize database with all required migrations
  const db = initDatabase({
    logger,
    migrations: [
      getChatMigrationsPath(),
      getSchedulerMigrationsPath(),
      getAuthMigrationsPath(),
      // redesign-2026 packages — see docs/redesign-2026/08-migration.md
      getThreadsMigrationsPath(),
      getMemoryMigrationsPath(),
      getAutonomyMigrationsPath(),
    ],
  })

  // §08 legacy-thread migration — runs once, no-op on fresh installs and re-runs
  const rawDb = getRawDb()
  if (rawDb) {
    runMigrationIfNeeded(rawDb, {
      backupDir: path.join(getAppDataDir(), 'backups'),
      markerPath,
      sourceVersion: 'v0.5.0', // keep in sync with apps/tui/package.json version
      logger,
    })
  }

  // Ensure the local system user exists (creates if needed)
  const userRepository = new UserRepository(db)
  const defaultUserService = new DefaultUserService(userRepository)
  const systemUser = await defaultUserService.ensureDefaultUser()

  logger.debug(`Using system user: ${systemUser.username} (${systemUser.id})`)

  return { db, systemUser }
}

initI18n()

// Initialize app before CLI parsing
initializeApp()
  .then(({ systemUser }) => {
    // Store system user for use in CLI commands if needed
    process.env['STINA_SYSTEM_USER_ID'] = systemUser.id

    const cli = createCli()
    cli.parse()
  })
  .catch((error) => {
    logger.error('Failed to initialize TUI', { error: String(error) })
    process.exit(1)
  })
