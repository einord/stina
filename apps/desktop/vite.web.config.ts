import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import Components from 'unplugin-vue-components/vite';
import IconsResolver from 'unplugin-icons/resolver';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  plugins: [
    vue({ include: [/\.vue$/] }),
    Icons({ compiler: 'vue3' }),
    Components({ resolvers: [IconsResolver({ prefix: 'i' })] }),
  ],
  resolve: {
    alias: {
      '@stina/store': path.resolve(__dirname, '../../packages/store/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '../../')] },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});