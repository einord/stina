import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node20',
  splitting: false,
  clean: true,
  sourcemap: false,
  // Bundle @stina/extension-api/runtime into the dist so the extension is
  // self-contained — matches the pattern used by sibling production
  // extensions (stina-ext-ollama, stina-ext-openai, …). Without this, the
  // built index.js contains a literal `import "@stina/extension-api/runtime"`
  // which fails to resolve when loaded from `data/extensions/local/dev-test/`
  // (no node_modules on that path, especially in Docker).
  noExternal: [/.*/],
})
