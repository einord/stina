#!/usr/bin/env node
/**
 * Dev seeder CLI.
 *
 *   pnpm --filter @stina/test-fixtures seed-dev-db <scenario>
 *
 * Optional flags:
 *   --db <path>    Override the database path. Default: $DB_PATH or the
 *                  platform default (Library/Application Support/Stina/data.db
 *                  on macOS).
 *   --fresh        Wipe redesign-2026 tables before seeding. Default: warn
 *                  and exit if any redesign-2026 table is non-empty.
 *
 * Available scenarios are listed if no argument is given.
 *
 * Migrations run automatically before seeding; the script uses the same
 * runner the apps use, so this is safe against an uninitialized database.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  initCoreSchema,
  runMigrations,
  createConsoleLogger,
  getDbPath,
} from '@stina/adapters-node'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { getMemoryMigrationsPath } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { clearRedesign2026Tables, getScenario, scenarios, seed } from '../src/index.js'

interface CliArgs {
  scenarioId?: string
  dbPath?: string
  fresh: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { fresh: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--fresh') args.fresh = true
    else if (a === '--db' && i + 1 < argv.length) args.dbPath = argv[++i]
    else if (a && !a.startsWith('--') && !args.scenarioId) args.scenarioId = a
  }
  return args
}

function printUsage(): void {
  console.log('Usage: pnpm --filter @stina/test-fixtures seed-dev-db <scenario> [--db <path>] [--fresh]')
  console.log('')
  console.log('Available scenarios:')
  for (const id of Object.keys(scenarios)) {
    const built = scenarios[id]!()
    console.log(`  ${id.padEnd(24)} ${built.description}`)
  }
}

async function main(): Promise<void> {
  const logger = createConsoleLogger('info')
  const args = parseArgs(process.argv.slice(2))

  if (!args.scenarioId) {
    printUsage()
    process.exit(1)
  }

  const scenario = getScenario(args.scenarioId)
  const dbPath = args.dbPath ?? getDbPath()

  logger.info('Seeding database', { path: dbPath, scenario: scenario.id })

  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  // Run all redesign-2026 + chat migrations so the schema is ready. We include
  // chat migrations because the legacy thread split (§08) — when implemented —
  // will need to read chat tables.
  initCoreSchema(db)
  runMigrations(db, [
    getChatMigrationsPath(),
    getThreadsMigrationsPath(),
    getMemoryMigrationsPath(),
    getAutonomyMigrationsPath(),
  ])

  // Refuse to seed onto a populated DB unless --fresh.
  const existingThreads = (db.prepare('SELECT COUNT(*) AS n FROM threads').get() as { n: number }).n
  if (existingThreads > 0 && !args.fresh) {
    logger.error(
      `Database already has ${existingThreads} thread(s) in the redesign-2026 ` +
        `schema. Re-run with --fresh to wipe and re-seed, or pick a different ` +
        `--db path.`
    )
    db.close()
    process.exit(2)
  }

  if (args.fresh) {
    logger.info('Clearing redesign-2026 tables before seeding')
    clearRedesign2026Tables(db)
  }

  const counts = seed(db, scenario)
  db.close()

  logger.info('Seed complete', { ...counts })
}

// Allow running directly as `tsx scripts/seed-dev-db.ts` or via the package script.
const __filename = fileURLToPath(import.meta.url)
const isDirectRun = process.argv[1] === __filename || process.argv[1]?.endsWith(path.basename(__filename))
if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
