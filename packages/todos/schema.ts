import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projectsTable = sqliteTable(
  'todo_projects',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    description: text(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    nameIdx: index('idx_todo_projects_name').on(table.name),
  }),
);

export const todosTable = sqliteTable(
  'todos',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    description: text(),
    status: text().notNull().default('not_started'),
    dueTs: integer('due_ts', { mode: 'number' }),
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    reminderMinutes: integer('reminder_minutes', { mode: 'number' }),
    metadata: text(),
    source: text(),
    projectId: text('project_id').references(() => projectsTable.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    statusIdx: index('idx_todos_status').on(table.status),
    dueIdx: index('idx_todos_due').on(table.dueTs),
    projectIdx: index('idx_todos_project').on(table.projectId),
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
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    todoIdx: index('idx_todo_comments_todo').on(table.todoId),
  }),
);

export const todoTables = { todosTable, todoCommentsTable, projectsTable };

export type TodoTables = typeof todoTables;
