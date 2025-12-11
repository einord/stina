import { spawnSync } from 'child_process';
import fs, { existsSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);

const logPrefix = '[rebuild-better-sqlite3]';
const log = (msg) => console.log(`${logPrefix} ${msg}`);

function resolveModuleDirs() {
  const pkgPath = require.resolve('better-sqlite3/package.json');
  const moduleDir = dirname(pkgPath);
  const nodeGypBin = require.resolve('node-gyp/bin/node-gyp.js');

  const dirs = [moduleDir];
  try {
    const pnpmRoot = join(process.cwd(), 'node_modules', '.pnpm');
    const entries = fs.readdirSync(pnpmRoot);
    for (const entry of entries) {
      if (!entry.startsWith('better-sqlite3@')) continue;
      const candidate = join(pnpmRoot, entry, 'node_modules', 'better-sqlite3');
      if (fs.existsSync(candidate)) dirs.push(candidate);
    }
  } catch (err) {
    log(`pnpm scan skipped (${err?.message || err})`);
  }

  return { dirs: Array.from(new Set(dirs)), nodeGypBin };
}

function rebuild({ moduleDir, nodeGypBin }) {
  log('Rebuilding via node-gyp (Release)...');
  const cxxFlags = `${process.env.CXXFLAGS ?? ''} -Wno-cast-function-type-mismatch`.trim();
  const result = spawnSync(
    process.execPath,
    [nodeGypBin, 'rebuild', '--release', '--directory', moduleDir],
    {
      stdio: 'inherit',
      env: { ...process.env, CXXFLAGS: cxxFlags },
    },
  );
  if (result.status !== 0) {
    throw new Error(`node-gyp rebuild failed with code ${result.status}`);
  }
  log('Rebuild completed.');
}

function main() {
  const { dirs, nodeGypBin } = resolveModuleDirs();
  if (!dirs.length) {
    throw new Error('Could not locate better-sqlite3 module directories');
  }
  log(`Force rebuilding ${dirs.length} better-sqlite3 instance(s) for current Node runtime.`);
  dirs.forEach((d) => log(`- ${d}`));
  for (const dir of dirs) {
    const binaryPath = join(dir, 'build', 'Release', 'better_sqlite3.node');
    if (!existsSync(binaryPath)) {
      log(`Binary missing in ${dir}; rebuilding.`);
    }
    rebuild({ moduleDir: dir, nodeGypBin });
  }
}

main();
/* eslint-env node */
/* global console, process */
