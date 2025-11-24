import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const todosTable = sqliteTable(
  'todos',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    description: text(),
    status: text().notNull().default('not_started'),
    dueTs: integer('due_ts', { mode: 'timestamp' }),
    metadata: text(),
    source: text(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    statusIdx: index('idx_todos_status').on(table.status),
    dueIdx: index('idx_todos_due').on(table.dueTs),
  }),
);

export const todoCommentsTable = sqliteTable(
  'todo_comments',
  {
    id: text().primaryKey(),
    todoId: text('todo_id')
      .notNull()
      .references(() => todosTable.id, { onDelete: 'cascade' }),
    content: text().notNull(),
    createdAt: integer({ mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    todoIdx: index('idx_todo_comments_todo').on(table.todoId),
  }),
);

export const todoTables = { todosTable, todoCommentsTable };

export type TodoTables = typeof todoTables;
