import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const uiVuePath = resolve(__dirname, '../../packages/ui-vue/src')
const corePath = resolve(__dirname, '../../packages/core/src')

export default defineConfig({
  plugins: [vue()],
  root: __dirname,
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@stina/ui-vue': uiVuePath,
      '@stina/core': corePath,
    },
  },
  optimizeDeps: {
    exclude: ['@stina/ui-vue', '@stina/core'],
  },
  ssr: {
    noExternal: ['@stina/ui-vue', '@stina/core'],
  },
  build: {
    outDir: 'dist/renderer',
    emptyDirOnly: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 3003,
  },
})
