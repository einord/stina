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
import { getTableName } from 'drizzle-orm/table';

import { ensureSqliteTable } from './schema.js';

type BetterSqlite3Database = Database.Database;

// Constants for database configuration
const DEFAULT_DB_DIR = path.join(os.homedir(), '.stina');
// Use the primary database file; legacy name preserved to avoid surprises across modules.
const DEFAULT_DB_FILE = path.join(DEFAULT_DB_DIR, 'stina.db');

/**
 * SQLiteDatabase class manages the SQLite database connection.
 */
export default class SQLiteDatabase {
  private sqliteDb?: BetterSqlite3Database;
  private drizzleDb?: ReturnType<typeof drizzle>;
  private initializedSchemas = new Map<string, SQLiteTableWithColumns<TableConfig>>();
  private initializedSchemaGroups = new Map<string, Record<string, SQLiteTableWithColumns<TableConfig>>>();
  private dbPath: string;
  private migrationsTableEnsured = false;

  constructor(customPath?: string) {
    const envOverride = process.env.STINA_DB_PATH;
    const dbPath = customPath ?? envOverride ?? DEFAULT_DB_FILE;
    this.dbPath = dbPath;
    const dir = dbPath === ':memory:' ? DEFAULT_DB_DIR : path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
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
   * Registers a schema (one or more tables) exactly once per name and rebuilds the Drizzle client.
   * Modules should prefer this over calling `initTable` table-by-table.
   */
  public registerSchema<T extends Record<string, SQLiteTableWithColumns<TableConfig>>>(
    name: string,
    factory: () => T,
  ): T {
    if (this.initializedSchemaGroups.has(name)) {
      return this.initializedSchemaGroups.get(name)! as T;
    }

    this.ensureSqliteConnection();
    const tables = factory();

    for (const table of Object.values(tables)) {
      const tableName = getTableName(table);
      if (!this.initializedSchemas.has(tableName)) {
        this.initializedSchemas.set(tableName, table);
        ensureSqliteTable(this.sqliteDb!, table);
      }
    }

    this.ensureDrizzle();
    this.initializedSchemaGroups.set(name, tables);
    return tables;
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
    this.sqliteDb = new Database(this.dbPath);
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
      schema: Object.fromEntries(this.initializedSchemas),
    });
  }

  /** Returns the path of the backing SQLite database. */
  public getPath() {
    return this.dbPath;
  }

  /** Returns the underlying better-sqlite3 connection, creating it if missing. */
  public getRawDatabase(): BetterSqlite3Database {
    this.ensureSqliteConnection();
    return this.sqliteDb!;
  }

  /**
   * Runs idempotent migrations registered by modules.
   */
  public async runMigrations(
    module: string,
    migrations: Array<{ id: string; run: (db: ReturnType<typeof drizzle>) => void | Promise<void> }>,
  ) {
    this.ensureSqliteConnection();
    this.ensureMigrationsTable();
    const applied = new Set<string>();
    const rows = this.sqliteDb!
      .prepare('SELECT migration_id FROM migrations WHERE module = ?')
      .all(module) as Array<{ migration_id: string }>;
    rows.forEach((row) => applied.add(row.migration_id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      await migration.run(this.getDatabase());
      this.sqliteDb!
        .prepare('INSERT INTO migrations (module, migration_id, applied_at) VALUES (?, ?, ?)')
        .run(module, migration.id, Date.now());
    }
  }

  private ensureMigrationsTable() {
    if (this.migrationsTableEnsured) return;
    this.ensureSqliteConnection();
    this.sqliteDb!.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        module TEXT NOT NULL,
        migration_id TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        PRIMARY KEY (module, migration_id)
      );
    `);
    this.migrationsTableEnsured = true;
  }
}
