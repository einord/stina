import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: ['src/index.ts', 'src/db/index.ts', 'src/orchestrator/index.ts', 'src/mappers/index.ts'],
  format: ['esm', 'cjs'],
  dts: process.env.TSUP_DTS !== 'false',
  clean: true,
  sourcemap: true,
  // Shims for import.meta.url in CJS
  shims: true,
  // Bundle ESM-only packages to ensure CJS compatibility
  noExternal: ['nanoid'],
  onSuccess: async () => {
    // Copy all migrations to dist
    const srcMigrationsDir = join('src', 'db', 'migrations')
    const distMigrationsDir = join('dist', 'db', 'migrations')
    mkdirSync(distMigrationsDir, { recursive: true })

    const migrationFiles = readdirSync(srcMigrationsDir).filter((f) => f.endsWith('.sql'))
    for (const file of migrationFiles) {
      copyFileSync(join(srcMigrationsDir, file), join(distMigrationsDir, file))
    }
  },
})
