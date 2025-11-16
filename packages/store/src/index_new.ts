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
  }

  public initModule(
    name: string,
    schema: Record<
      string,
      SQLiteColumnBuilderBase<ColumnBuilderBaseConfig<ColumnDataType, string>, object>
    >,
  ) {
    this.db.initDatabaseTable(name, schema);
  }
}

const store = new Store();
export default store;
