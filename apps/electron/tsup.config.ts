import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { main: 'src/main/index.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.js' }),
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    external: ['electron'],
  },
  {
    entry: { preload: 'src/preload/index.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.js' }),
    outDir: 'dist',
    sourcemap: true,
    external: ['electron'],
  },
])
