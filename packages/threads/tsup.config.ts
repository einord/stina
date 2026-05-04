import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: ['src/index.ts', 'src/db/index.ts'],
  format: ['esm', 'cjs'],
  dts: process.env.TSUP_DTS !== 'false',
  clean: true,
  sourcemap: true,
  shims: true,
  noExternal: ['nanoid'],
  onSuccess: async () => {
    // Copy migrations to dist (matches packages/chat convention)
    const srcMigrationsDir = join('src', 'db', 'migrations')
    const distMigrationsDir = join('dist', 'db', 'migrations')
    mkdirSync(distMigrationsDir, { recursive: true })

    const migrationFiles = readdirSync(srcMigrationsDir).filter((f) => f.endsWith('.sql'))
    for (const file of migrationFiles) {
      copyFileSync(join(srcMigrationsDir, file), join(distMigrationsDir, file))
    }
  },
})
