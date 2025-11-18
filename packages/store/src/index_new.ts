import { ColumnBuilderBaseConfig, ColumnDataType } from 'drizzle-orm';
import { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core';
import { EventEmitter } from 'stream';

import { SQLiteDatabase } from './database/index.js';

/**
 * Event emitter-based store for application state management.
 */
class Store extends EventEmitter {
  private db: SQLiteDatabase;

  constructor() {
    super();
    this.db = new SQLiteDatabase();

    // Invoke event indicating that it is time for database initialization
    this.emit('init');
  }

  /**
   * Initializes a database table with the given name and schema.
   * @param name The name of the table to initialize.
   * @param schema The schema definition for the table.
   * @returns The initialized table.
   */
  public initDatabaseTable(
    name: string,
    schema: Record<
      string,
      SQLiteColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>, object>
    >,
  ) {
    return this.db.initDatabaseTable(name, schema);
  }
}

const store = new Store();
export default store;
