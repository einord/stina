import fs from 'node:fs'
import {
  initDatabase,
  getRawDb,
  createConsoleLogger,
  getLogLevelFromEnv,
} from '@stina/adapters-node'
import {
  getChatMigrationsPath,
  UserSettingsRepository,
} from '@stina/chat/db'
import { getSchedulerMigrationsPath } from '@stina/scheduler'
import { getAuthMigrationsPath } from '@stina/auth'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { getMemoryMigrationsPath } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { UserRepository, type AuthDb } from '@stina/auth/db'
import { seed, typicalMorning } from '@stina/test-fixtures'
import type { ChatDb } from '@stina/chat/db'

const DB_PATH = '/tmp/stina-e2e.db'

export default async function globalSetup(): Promise<void> {
  // 1. Delete any stale DB files so auth tables are also fresh
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true })
  }

  // 2. Tell adapters-node which path to use
  process.env['STINA_DB_PATH'] = DB_PATH

  const logger = createConsoleLogger(getLogLevelFromEnv())

  // 3. Open DB with all migrations
  const db = initDatabase({
    logger,
    dbPath: DB_PATH,
    migrations: [
      getChatMigrationsPath(),
      getSchedulerMigrationsPath(),
      getAuthMigrationsPath(),
      getThreadsMigrationsPath(),
      getMemoryMigrationsPath(),
      getAutonomyMigrationsPath(),
    ],
  })

  // 4. Create e2e user with role 'user' (not 'admin' — avoids full onboarding)
  const userRepository = new UserRepository(db as unknown as AuthDb)
  const user = await userRepository.create({
    username: 'e2e-test',
    role: 'user',
    displayName: 'E2E Test',
  })

  // 5. Seed firstName so App.vue skips profile-only onboarding
  const settingsRepo = new UserSettingsRepository(db as unknown as ChatDb, user.id)
  await settingsRepo.setValue('firstName', 'E2E')

  // 6. Seed typical-morning fixture
  const rawDb = getRawDb()
  if (!rawDb) {
    throw new Error('global-setup: getRawDb() returned null after initDatabase')
  }
  seed(rawDb, typicalMorning())

  // 7. Close the raw DB connection
  rawDb.close()
}
