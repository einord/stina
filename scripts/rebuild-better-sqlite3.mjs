import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);

const logPrefix = '[rebuild-better-sqlite3]';
const log = (msg) => console.log(`${logPrefix} ${msg}`);

function resolvePaths() {
  const pkgPath = require.resolve('better-sqlite3/package.json');
  const moduleDir = dirname(pkgPath);
  const binaryPath = join(moduleDir, 'build', 'Release', 'better_sqlite3.node');
  const nodeGypBin = require.resolve('node-gyp/bin/node-gyp.js');
  return { moduleDir, binaryPath, nodeGypBin };
}

function needsRebuild(binaryPath) {
  if (!existsSync(binaryPath)) {
    log('Binary missing; rebuild required.');
    return true;
  }
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('better-sqlite3');
    log('Existing binary loads fine; skipping rebuild.');
    return false;
  } catch (error) {
    log(`Load failed (${error?.message || error}); rebuild required.`);
    return true;
  }
}

function rebuild({ moduleDir, nodeGypBin }) {
  log('Rebuilding via node-gyp (Release)...');
  const result = spawnSync(process.execPath, [nodeGypBin, 'rebuild', '--release', '--directory', moduleDir], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`node-gyp rebuild failed with code ${result.status}`);
  }
  log('Rebuild completed.');
}

function main() {
  const paths = resolvePaths();
  if (!needsRebuild(paths.binaryPath)) {
    return;
  }
  rebuild(paths);
}

main();
