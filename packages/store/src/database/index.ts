import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ColumnBuilderBaseConfig, ColumnDataType } from 'drizzle-orm/column-builder';
import {
  SQLiteColumnBuilderBase,
  SQLiteTableWithColumns,
  TableConfig,
  sqliteTable,
} from 'drizzle-orm/sqlite-core';

type BetterSqlite3Database = Database.Database;

// Constants for database configuration
const DB_DIR = path.join(os.homedir(), '.stina');
const DB_FILE = path.join(DB_DIR, 'stina-test.db');

/**
 * SQLiteDatabase class manages the SQLite database connection.
 */
export default class SQLiteDatabase {
  private sqliteDb?: BetterSqlite3Database;
  private drizzleDb?: ReturnType<typeof drizzle>;
  private initializedSchemas = new Map<string, object>();

  constructor() {}

  /**
   * Initializes (if needed) the SQLite database.
   * If the database is already loaded, it simply returns the existing instance.
   */
  public initDatabase() {
    if (!this.sqliteDb || !this.drizzleDb) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      const sqlite = new Database(DB_FILE);
      this.sqliteDb = sqlite;
      this.drizzleDb = drizzle({
        client: this.sqliteDb,
        casing: 'snake_case',
        schema: Object.fromEntries(this.initializedSchemas),
      });

      // Set PRAGMA settings for performance and integrity
      sqlite.pragma('journal_mode = WAL');

      // Enable/Force foreign key constraints
      sqlite.pragma('foreign_keys = ON');
    }
  }

  /**
   * Executes a given SQL schema against the database.
   * @param schema SQL schema string to be determined.
   */
  public initTable(
    name: string,
    schema: {
      [key: string]: SQLiteColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>>;
    },
  ): SQLiteTableWithColumns<TableConfig> {
    const table = sqliteTable('interactions', schema);
    this.initializedSchemas.set(name, table);
    return table;
  }
}
