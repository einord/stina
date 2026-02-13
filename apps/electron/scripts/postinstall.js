#!/usr/bin/env node

// Skip electron-rebuild in CI environments
// CI tests don't run the Electron app, so they don't need Electron-compiled native modules
// The CI workflow will rebuild better-sqlite3 for Node.js separately

if (process.env.CI === 'true') {
  console.log('Skipping electron-rebuild in CI environment');
  console.log('Native modules will be rebuilt for Node.js by the CI workflow');
  process.exit(0);
}

const { execSync } = require('child_process');

console.log('Running electron-rebuild for better-sqlite3...');
try {
  execSync('electron-rebuild -f -w better-sqlite3', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
} catch (error) {
  console.error('electron-rebuild failed:', error.message);
  process.exit(1);
}
