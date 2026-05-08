import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: process.env.TSUP_DTS !== 'false',
  clean: true,
  sourcemap: true,
  shims: true,
  // No migrations are shipped, but keep splitting:false to match the rest of
  // the redesign-2026 packages — avoids surprises if migrations are added later.
  splitting: false,
})
