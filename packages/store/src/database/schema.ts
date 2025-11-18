import type Database from 'better-sqlite3';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';
import type { ForeignKey } from 'drizzle-orm/sqlite-core/foreign-keys';
import { getTableConfig } from 'drizzle-orm/sqlite-core/utils';
import { getTableName } from 'drizzle-orm/table';

/**
 * Ensures that the physical SQLite table exists for the given Drizzle definition.
 */
export function ensureSqliteTable(
  sqlite: Database.Database,
  table: SQLiteTableWithColumns<TableConfig>,
) {
  const config = getTableConfig(table);
  const tableName = config.name;
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);
  if (row) return;

  const columnSql = config.columns.map((column) => buildColumnDefinition(column));
  const foreignKeys = config.foreignKeys.map((fk) => buildForeignKeyDefinition(fk));

  const statement = `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (${[...columnSql, ...foreignKeys].join(', ')});`;
  sqlite.exec(statement);
}

function buildColumnDefinition(column: AnySQLiteColumn): string {
  const sqlType =
    typeof (column as { getSQLType?: () => string }).getSQLType === 'function'
      ? (column as { getSQLType: () => string }).getSQLType()
      : 'text';
  const parts = [quoteIdentifier(column.name), sqlType.toUpperCase()];
  if (column.primary) {
    parts.push('PRIMARY KEY');
  }
  const autoIncrement = (column as { autoIncrement?: boolean }).autoIncrement;
  if (autoIncrement) {
    parts.push('AUTOINCREMENT');
  }
  if (column.notNull && !column.primary) {
    parts.push('NOT NULL');
  }
  if (column.isUnique && !column.primary) {
    parts.push('UNIQUE');
  }
  if (column.default !== undefined) {
    parts.push(`DEFAULT ${formatLiteral(column.default)}`);
  }
  return parts.join(' ');
}

function buildForeignKeyDefinition(fk: ForeignKey): string {
  const { columns, foreignColumns } = fk.reference();
  if (!columns.length || !foreignColumns.length) {
    return '';
  }
  const local = columns.map((column) => quoteIdentifier(column.name)).join(', ');
  const foreignTable = foreignColumns[0]?.table ? getTableName(foreignColumns[0].table) : '';
  const foreign = foreignColumns.map((column) => quoteIdentifier(column.name)).join(', ');
  const chunks = [
    `CONSTRAINT ${quoteIdentifier(fk.getName())}`,
    `FOREIGN KEY (${local})`,
    `REFERENCES ${quoteIdentifier(foreignTable)} (${foreign})`,
  ];
  if (fk.onDelete) {
    chunks.push(`ON DELETE ${fk.onDelete}`);
  }
  if (fk.onUpdate) {
    chunks.push(`ON UPDATE ${fk.onUpdate}`);
  }
  return chunks.join(' ');
}

function formatLiteral(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
