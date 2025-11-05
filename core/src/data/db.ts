import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export interface DatabaseOptions {
  path: string;
  readonly?: boolean;
}

export type ProAssistDatabase = BetterSQLite3Database<Record<string, never>>;

export const createDatabase = (options: DatabaseOptions): ProAssistDatabase => {
  const dbPath = resolve(options.path);
  if (!options.readonly) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath, {
    readonly: Boolean(options.readonly),
    fileMustExist: Boolean(options.readonly)
  });

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite);
};
