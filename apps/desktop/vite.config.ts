import path from 'node:path';

import vue from '@vitejs/plugin-vue';
import IconsResolver from 'unplugin-icons/resolver';
import Icons from 'unplugin-icons/vite';
import Components from 'unplugin-vue-components/vite';
import { defineConfig } from 'vite';
import electronPlugin from 'vite-plugin-electron/simple';

export default defineConfig(async ({ mode }) => ({
  root: __dirname,
  plugins: [
    vue({ include: [/\.vue$/] }),
    Icons({ compiler: 'vue3' }),
    Components({ resolvers: [IconsResolver({ prefix: 'i' })] }),
    // @ts-expect-error - NodeNext moduleResolution has issues with vite-plugin-electron/simple typing
    ...(await electronPlugin({
      main: {
        entry: path.resolve(__dirname, 'electron/main.ts'),
        vite: {
          build: {
            rollupOptions: {
              external: ['keytar', 'better-sqlite3', 'ws'],
            },
          },
        },
      },
      preload: {
        input: {
          preload: path.resolve(__dirname, 'electron/preload.ts'),
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['keytar', 'better-sqlite3', 'ws'],
            },
          },
        },
      },
    })),
  ],
  resolve: {
    alias: {
      '@stina/store': path.resolve(__dirname, '../../packages/store/src/index.ts'),
      '@stina/settings': path.resolve(__dirname, '../../packages/settings/src/index.ts'),
      '@stina/mcp': path.resolve(__dirname, '../../packages/mcp/src/index.ts'),
      '@stina/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['keytar', 'better-sqlite3', '@stina/crypto'],
    },
  },
  server: {
    port: 5173,
    fs: {
      // Allow importing from monorepo root (packages/*)
      allow: [path.resolve(__dirname, '../../')],
    },
  },
}));
