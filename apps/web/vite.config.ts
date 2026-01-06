import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const uiVuePath = resolve(__dirname, '../../packages/ui-vue/src')
const corePath = resolve(__dirname, '../../packages/core/src')
const i18nPath = resolve(__dirname, '../../packages/i18n/src')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@stina/ui-vue': uiVuePath,
      '@stina/core': corePath,
      '@stina/i18n': i18nPath,
    },
  },
  optimizeDeps: {
    exclude: ['@stina/ui-vue', '@stina/core', '@stina/i18n'],
  },
  ssr: {
    noExternal: ['@stina/ui-vue', '@stina/core', '@stina/i18n'],
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
