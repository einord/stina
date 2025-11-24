#!/usr/bin/env bun
/**
 * Dev helper to remove the local SQLite database (~/.stina/stina.db).
 * Use when iterating on schema changes; does not touch encrypted settings.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbPath = path.join(os.homedir(), '.stina', 'stina.db');

try {
  fs.rmSync(dbPath);
  console.log(`[reset-db] Removed ${dbPath}`);
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    console.log('[reset-db] No database file found, nothing to remove');
  } else {
    console.error('[reset-db] Failed to remove DB:', err);
    process.exitCode = 1;
  }
}
