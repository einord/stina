import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

export type StoreDatabase = Database.Database;

export const DB_DIR = path.join(os.homedir(), '.stina');
export const DB_FILE = path.join(DB_DIR, 'stina.db');

let dbInstance: StoreDatabase | null = null;
const initializedSchemas = new Set<string>();

/**
 * Ensures that the ~/.stina directory exists before touching the database file.
 */
function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Returns the shared Better-SQLite3 instance (lazy-initialized with WAL mode).
 */
export function getDatabase(): StoreDatabase {
  if (!dbInstance) {
    ensureDir(DB_DIR);
    dbInstance = new Database(DB_FILE);
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}

/**
 * Convenience helper for running synchronous work against the shared DB handle.
 */
export function withDatabase<T>(fn: (db: StoreDatabase) => T): T {
  return fn(getDatabase());
}

/**
 * Allows tool modules to register their table/index creation logic once per process.
 * @param name Unique identifier for the schema initializer.
 * @param init Callback that runs SQL against the shared DB.
 */
export function registerToolSchema(name: string, init: (db: StoreDatabase) => void): void {
  if (initializedSchemas.has(name)) return;
  init(getDatabase());
  initializedSchemas.add(name);
}
