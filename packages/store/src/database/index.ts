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

import { ensureSqliteTable } from './schema.js';

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
  private initializedSchemas = new Map<string, SQLiteTableWithColumns<TableConfig>>();

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  /**
   * Initializes (if needed) the SQLite database.
   * If the database is already loaded, it simply returns the existing instance.
   */
  public getDatabase() {
    if (!this.drizzleDb) {
      this.ensureDrizzle();
    }
    return this.drizzleDb!;
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
    if (this.initializedSchemas.has(name)) {
      return this.initializedSchemas.get(name)!;
    }

    this.ensureSqliteConnection();

    const table = sqliteTable(name, schema);
    this.initializedSchemas.set(name, table);
    ensureSqliteTable(this.sqliteDb!, table);
    this.ensureDrizzle();
    return table;
  }

  /**
   * Ensures there is an open SQLite connection.
   */
  private ensureSqliteConnection() {
    if (this.sqliteDb) return;
    this.sqliteDb = new Database(DB_FILE);
    this.sqliteDb.pragma('journal_mode = WAL');
    this.sqliteDb.pragma('foreign_keys = ON');
  }

  /**
   * Rebuilds the Drizzle client with the latest schema map.
   */
  private ensureDrizzle() {
    this.ensureSqliteConnection();
    this.drizzleDb = drizzle({
      client: this.sqliteDb!,
      casing: 'snake_case',
      schema: Object.fromEntries(this.initializedSchemas),
    });
  }
}
