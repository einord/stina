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
  // Disable chunk-splitting so getAutonomyMigrationsPath stays co-located with
  // the dist/db/migrations folder it references via import.meta.url.
  splitting: false,
  noExternal: ['nanoid'],
  onSuccess: async () => {
    const srcMigrationsDir = join('src', 'db', 'migrations')
    const distMigrationsDir = join('dist', 'db', 'migrations')
    mkdirSync(distMigrationsDir, { recursive: true })

    const migrationFiles = readdirSync(srcMigrationsDir).filter((f) => f.endsWith('.sql'))
    for (const file of migrationFiles) {
      copyFileSync(join(srcMigrationsDir, file), join(distMigrationsDir, file))
    }
  },
})
