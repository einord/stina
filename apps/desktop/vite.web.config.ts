import path from 'node:path';

import vue from '@vitejs/plugin-vue';
import IconsResolver from 'unplugin-icons/resolver';
import Icons from 'unplugin-icons/vite';
import Components from 'unplugin-vue-components/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [
    vue({ include: [/\.vue$/] }),
    Icons({ compiler: 'vue3' }),
    Components({ resolvers: [IconsResolver({ prefix: 'i' })] }),
  ],
  resolve: {
    alias: {
      '@stina/store': path.resolve(__dirname, '../../packages/store/src/index_new.ts'),
      '@stina/settings': path.resolve(__dirname, '../../packages/settings/src/index.ts'),
      '@stina/mcp': path.resolve(__dirname, '../../packages/mcp/src/index.ts'),
      '@stina/todos': path.resolve(__dirname, '../../packages/todos/index.ts'),
      '@stina/memories': path.resolve(__dirname, '../../packages/memories/index.ts'),
      '@stina/chat': path.resolve(__dirname, '../../packages/chat'),
      '@stina/state': path.resolve(__dirname, '../../packages/state/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '../../')] },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['keytar', 'better-sqlite3', '@stina/crypto'],
    },
  },
});
