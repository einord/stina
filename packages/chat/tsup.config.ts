import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: ['src/index.ts', 'src/db/index.ts', 'src/orchestrator/index.ts', 'src/mappers/index.ts'],
  format: ['esm', 'cjs'],
  dts: process.env.TSUP_DTS !== 'false',
  clean: true,
  sourcemap: true,
  onSuccess: async () => {
    // Copy migrations to dist
    const migrationsDir = join('dist', 'db', 'migrations')
    mkdirSync(migrationsDir, { recursive: true })
    copyFileSync(
      join('src', 'db', 'migrations', '0001_create_chat_tables.sql'),
      join(migrationsDir, '0001_create_chat_tables.sql')
    )
  },
})
