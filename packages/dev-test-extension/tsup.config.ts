import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node20',
  splitting: false,
  clean: true,
  sourcemap: false,
  external: ['@stina/extension-api', '@stina/extension-api/runtime'],
})
