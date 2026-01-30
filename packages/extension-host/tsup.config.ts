import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/storage/QueryParser.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
