import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  plugins: [
    vue({ include: [/\.vue$/] }),
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
