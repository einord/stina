import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/db/index.ts'],
  format: ['esm', 'cjs'],
  dts: process.env.TSUP_DTS !== 'false',
  clean: true,
  sourcemap: true,
})
