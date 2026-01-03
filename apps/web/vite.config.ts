import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const uiVuePath = resolve(__dirname, '../../packages/ui-vue/src')
const corePath = resolve(__dirname, '../../packages/core/src')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
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
