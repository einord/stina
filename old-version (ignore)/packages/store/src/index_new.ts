import fs from 'node:fs';
import path from 'node:path';

import { ColumnBuilderBaseConfig, ColumnDataType } from 'drizzle-orm';
import { SQLiteColumnBuilderBase, SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';
import { EventEmitter } from 'node:events';

import SQLiteDatabase from './database/index.js';

type DrizzleDb = ReturnType<SQLiteDatabase['getDatabase']>;

type ModuleMigration = {
  /** Unique migration id per module, e.g. 'add-title-col'. */
  id: string;
  /** Migration function; keep idempotent. */
  run: (db: DrizzleDb) => void | Promise<void>;
};

type ModuleDefinition<TTables extends Record<string, unknown>, TApi> = {
  /** Unique module name used for schema and change notifications. */
  name: string;
  /** Factory returning the module's table definitions. */
  schema: () => TTables;
  /** Optional bootstrap that receives helpers and returns the module API. */
  bootstrap?: (ctx: {
    db: DrizzleDb;
    tables: TTables;
    emitChange: (payload?: unknown) => void;
    onChange: (listener: (payload?: unknown) => void) => () => void;
  }) => TApi;
  /** Optional migration steps to be run once per registration. */
  migrations?: ModuleMigration[];
};

/**
 * Event emitter-based store for application state management.
 * Owns DB lifecycle, module registration, and a shared change bus.
 */
class Store extends EventEmitter {
  private database: SQLiteDatabase;
  private moduleAPIs = new Map<string, unknown>();
  private moduleEmitters = new Map<string, EventEmitter>();
  private watched = false;

  constructor(dbPath?: string) {
    super();
    this.database = new SQLiteDatabase(dbPath);

    // Invoke event indicating that it is time for database initialization
    this.emit('init');
    this.setupWatch();
  }

  /** Returns the active Drizzle database instance. */
  public getDatabase() {
    return this.database.getDatabase();
  }

  /** Returns the underlying better-sqlite3 connection. */
  public getRawDatabase() {
    return this.database.getRawDatabase();
  }

  /**
   * Registers a schema (one or more tables) and returns the table map. Ensures a single registration per name.
   */
  public registerSchema<T extends Record<string, unknown>>(name: string, factory: () => T): T {
    return this.database.registerSchema(
      name,
      factory as () => Record<string, SQLiteTableWithColumns<TableConfig>>,
    ) as unknown as T;
  }

  /** Registers a module: installs schema, runs migrations, wires change notifications, and returns the API. */
  public registerModule<TTables extends Record<string, unknown>, TApi>(
    definition: ModuleDefinition<TTables, TApi>,
  ): { tables: TTables; api: TApi | undefined } {
    const tables = this.registerSchema(definition.name, definition.schema);
    const db = this.getDatabase();

    if (definition.migrations?.length) {
      void this.database.runMigrations(definition.name, definition.migrations);
    }

    let api: TApi | undefined;
    if (definition.bootstrap) {
      const emitter = this.getModuleEmitter(definition.name);
      const emitChange = (payload?: unknown) => this.emitChange(definition.name, payload);
      const onChange = (listener: (payload?: unknown) => void) => {
        emitter.on('change', listener);
        return () => emitter.off('change', listener);
      };
      api = definition.bootstrap({ db, tables, emitChange, onChange });
      this.moduleAPIs.set(definition.name, api as unknown);
    }

    return { tables, api };
  }

  /** Emits a change notification for the given module. */
  public emitChange(moduleName: string, payload?: unknown) {
    const emitter = this.getModuleEmitter(moduleName);
    emitter.emit('change', payload);
    this.emit('change', { module: moduleName, payload });
  }

  /** Emits a coarse external change (file watch, etc.). */
  public emitExternalChange() {
    this.emit('external-change');
  }

  /** Subscribes to module changes; returns an unsubscribe handle. */
  public onChange(moduleName: string, listener: (payload?: unknown) => void) {
    const emitter = this.getModuleEmitter(moduleName);
    emitter.on('change', listener);
    return () => emitter.off('change', listener);
  }

  /** Returns a module API if it was bootstrapped. */
  public getModuleApi<T>(moduleName: string): T | undefined {
    return this.moduleAPIs.get(moduleName) as T | undefined;
  }

  /**
   * Runs the provided callback within a transaction. Change events should be emitted after commit.
   */
  public async withTransaction<T>(fn: Parameters<DrizzleDb['transaction']>[0]): Promise<T> {
    const db = this.getDatabase();
    // drizzle-orm/better-sqlite3 exposes .transaction which wraps fn in BEGIN/COMMIT.
    return db.transaction(fn) as unknown as Promise<T>;
  }

  /**
   * Initializes a database table with the given name and schema.
   * @deprecated Prefer registerSchema/registerModule for module-scoped schemas.
   */
  public initDatabaseTable(
    name: string,
    schema: Record<
      string,
      SQLiteColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>, object>
    >,
  ) {
    return this.database.initTable(name, schema);
  }

  private getModuleEmitter(moduleName: string): EventEmitter {
    if (!this.moduleEmitters.has(moduleName)) {
      this.moduleEmitters.set(moduleName, new EventEmitter());
    }
    return this.moduleEmitters.get(moduleName)!;
  }

  /**
   * Watches the underlying DB file and emits a coarse `external-change` event for multi-process sync.
   */
  private setupWatch() {
    if (this.watched) return;
    const dbPath = this.database.getPath();
    if (!dbPath || dbPath === ':memory:') return;
    // Ensure database exists so watch does not throw for missing file
    try {
      this.database.getDatabase();
    } catch {
      // ignore
    }
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const watcher = fs.watch(dbPath, { persistent: false }, () => {
        this.emitExternalChange();
      });
      watcher.on('error', () => watcher.close());
      this.watched = true;
    } catch {
      this.watched = false;
    }
  }
}

const store = new Store();
export default store;
