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
 *   --fresh        Wipe ALL redesign-2026 tables (including memory + policies)
 *                  before seeding. Default: warn and exit if any redesign-2026
 *                  table is non-empty.
 *   --reset-history Wipe only thread/conversation HISTORY (redesign-2026
 *                  threads + messages + activity log + thread summaries, plus
 *                  legacy chat_conversations + chat_interactions). Preserves
 *                  memory (profile_facts, standing_instructions), policies
 *                  (auto_policies), and chat-package settings (model_configs,
 *                  user_settings, quick_commands, tool_confirmation_overrides,
 *                  scheduler_jobs). Useful when re-running a demo seed without
 *                  losing your Ollama config or learned preferences.
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
import { clearHistoryOnly, clearRedesign2026Tables, getScenario, scenarios, seed } from '../src/index.js'

interface CliArgs {
  scenarioId?: string
  dbPath?: string
  fresh: boolean
  resetHistory: boolean
}

interface CliArgsWithHelp extends CliArgs {
  help: boolean
}

function parseArgs(argv: string[]): CliArgsWithHelp {
  const args: CliArgsWithHelp = { fresh: false, resetHistory: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--fresh') args.fresh = true
    else if (a === '--reset-history') args.resetHistory = true
    else if (a === '--db' && i + 1 < argv.length) args.dbPath = argv[++i]
    else if (a && !a.startsWith('--') && !args.scenarioId) args.scenarioId = a
  }
  return args
}

function printUsage(): void {
  console.log('Usage: pnpm dev:seed <scenario> [--db <path>] [--fresh | --reset-history]')
  console.log('')
  console.log('Seeds the redesign-2026 schema with a deterministic fixture set.')
  console.log('Pass DB_PATH=… to use an isolated database (recommended for demos).')
  console.log('')
  console.log('Available scenarios:')
  for (const id of Object.keys(scenarios)) {
    const built = scenarios[id]!()
    console.log(`  ${id.padEnd(24)} ${built.description}`)
  }
  console.log('')
  console.log('Flags:')
  console.log('  --db <path>      Override the database path (also honors DB_PATH env)')
  console.log('  --fresh          Wipe ALL redesign-2026 tables before seeding')
  console.log('                   (threads, messages, activity log, thread_summaries,')
  console.log('                   profile_facts, standing_instructions, auto_policies)')
  console.log('  --reset-history  Wipe only thread/conversation HISTORY before seeding;')
  console.log('                   preserves memory (profile_facts, standing_instructions),')
  console.log('                   policies (auto_policies), and chat-package settings')
  console.log('                   (model_configs, user_settings, quick_commands,')
  console.log('                   tool_confirmation_overrides). Also wipes legacy chat')
  console.log('                   conversations + interactions.')
  console.log('  --help, -h       Show this help')
}

async function main(): Promise<void> {
  const logger = createConsoleLogger('info')
  const args = parseArgs(process.argv.slice(2))

  // Help-mode is success — no scenario required, no error.
  if (args.help || !args.scenarioId) {
    printUsage()
    return
  }

  if (!(args.scenarioId in scenarios)) {
    const available = Object.keys(scenarios).join(', ')
    console.error(`Unknown scenario: "${args.scenarioId}"`)
    console.error(`Available: ${available}`)
    console.error('')
    console.error('Run with --help to see descriptions.')
    process.exit(2)
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

  // Mutually exclusive flags — pick one wipe mode.
  if (args.fresh && args.resetHistory) {
    logger.error('--fresh and --reset-history are mutually exclusive; pick one.')
    db.close()
    process.exit(2)
  }

  // Refuse to seed onto a populated DB unless --fresh or --reset-history.
  const existingThreads = (db.prepare('SELECT COUNT(*) AS n FROM threads').get() as { n: number }).n
  if (existingThreads > 0 && !args.fresh && !args.resetHistory) {
    logger.error(
      `Database already has ${existingThreads} thread(s) in the redesign-2026 ` +
        `schema. Re-run with --fresh (wipes everything) or --reset-history ` +
        `(preserves memory + settings), or pick a different --db path.`
    )
    db.close()
    process.exit(2)
  }

  if (args.fresh) {
    logger.info('Clearing all redesign-2026 tables before seeding')
    clearRedesign2026Tables(db)
  } else if (args.resetHistory) {
    logger.info('Clearing thread/conversation history before seeding (preserving memory, policies, settings)')
    clearHistoryOnly(db)
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
