import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  onSuccess: async () => {
    const srcMigrationsDir = join('src', 'migrations')
    const distMigrationsDir = join('dist', 'migrations')
    mkdirSync(distMigrationsDir, { recursive: true })

    const migrationFiles = readdirSync(srcMigrationsDir).filter((file) => file.endsWith('.sql'))
    for (const file of migrationFiles) {
      copyFileSync(join(srcMigrationsDir, file), join(distMigrationsDir, file))
    }
  },
})
