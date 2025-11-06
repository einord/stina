import path from 'node:path';

import vue from '@vitejs/plugin-vue';
import IconsResolver from 'unplugin-icons/resolver';
import Icons from 'unplugin-icons/vite';
import Components from 'unplugin-vue-components/vite';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  plugins: [
    vue({ include: [/\.vue$/] }),
    Icons({ compiler: 'vue3' }),
    Components({ resolvers: [IconsResolver({ prefix: 'i' })] }),
    electron({
      main: {
        entry: path.resolve(__dirname, 'electron/main.ts'),
      },
      preload: {
        input: {
          preload: path.resolve(__dirname, 'electron/preload.ts'),
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@stina/store': path.resolve(__dirname, '../../packages/store/src/index.ts'),
      '@stina/settings': path.resolve(__dirname, '../../packages/settings/src/index.ts'),
      '@stina/mcp': path.resolve(__dirname, '../../packages/mcp/src/index.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: {
      // Allow importing from monorepo root (packages/*)
      allow: [path.resolve(__dirname, '../../')],
    },
  },
}));
