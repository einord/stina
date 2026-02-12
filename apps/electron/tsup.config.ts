import { defineConfig } from 'tsup'
import path from 'node:path'

const rootDir = path.resolve(__dirname, '..', '..')
const alias = {
  '@stina/shared': path.resolve(rootDir, 'packages/shared/dist/index.js'),
  '@stina/core': path.resolve(rootDir, 'packages/core/dist/index.js'),
  '@stina/adapters-node': path.resolve(rootDir, 'packages/adapters-node/dist/index.js'),
  '@stina/ui-vue': path.resolve(rootDir, 'packages/ui-vue/dist/index.js'),
}
const noExternal = ['@stina/shared', '@stina/core', '@stina/adapters-node', '@stina/ui-vue', 'electron-updater']
const watchPaths = [
  path.resolve(__dirname, 'src'),
  path.resolve(rootDir, 'packages/core/dist'),
  path.resolve(rootDir, 'packages/adapters-node/dist'),
  path.resolve(rootDir, 'packages/shared/dist'),
  path.resolve(rootDir, 'packages/ui-vue/dist'),
]

const configs = [
  {
    entry: { main: 'src/main/index.ts' },
    tsconfig: '../../tsconfig.base.json',
    alias,
    noExternal,
    format: ['cjs'],
    outExtension: () => ({ js: '.js' }),
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    external: ['electron', '@aws-sdk/client-s3', 'better-sqlite3'],
  },
  {
    entry: { preload: 'src/preload/index.ts' },
    tsconfig: '../../tsconfig.base.json',
    alias,
    noExternal,
    format: ['cjs'],
    outExtension: () => ({ js: '.js' }),
    outDir: 'dist',
    sourcemap: true,
    external: ['electron', '@aws-sdk/client-s3', 'better-sqlite3'],
  },
]

const buildTarget = process.env['BUILD_TARGET']
export default defineConfig(() => {
  if (process.env['NODE_ENV'] === 'development') {
    // In dev, watch all relevant source paths so dist rebuilds on tokenSpec changes
    configs.forEach((cfg) => {
      cfg.watch = watchPaths
    })
  }
  if (buildTarget === 'preload') {
    return [configs[1]]
  }
  if (buildTarget === 'main') {
    return [configs[0]]
  }
  return configs
})
