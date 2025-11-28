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
    recurringTemplateId: text('recurring_template_id'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    statusIdx: index('idx_todos_status').on(table.status),
    dueIdx: index('idx_todos_due').on(table.dueTs),
    projectIdx: index('idx_todos_project').on(table.projectId),
    recurringIdx: index('idx_todos_recurring').on(table.recurringTemplateId),
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

export const recurringTemplatesTable = sqliteTable(
  'recurring_templates',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    description: text(),
    projectId: text('project_id').references(() => projectsTable.id, { onDelete: 'set null' }),
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    timeOfDay: text('time_of_day'), // HH:MM (local or timezone)
    timezone: text(),
    frequency: text().notNull(), // daily | weekday | weekly | monthly | custom
    dayOfWeek: integer('day_of_week', { mode: 'number' }), // 0-6 when weekly
    dayOfMonth: integer('day_of_month', { mode: 'number' }), // 1-31 when monthly
    cron: text(), // optional future use
    leadTimeMinutes: integer('lead_time_minutes', { mode: 'number' }).notNull().default(0),
    overlapPolicy: text('overlap_policy').notNull().default('skip_if_open'),
    maxAdvanceCount: integer('max_advance_count', { mode: 'number' }).notNull().default(1),
    lastGeneratedDueAt: integer('last_generated_due_at', { mode: 'number' }),
    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    frequencyIdx: index('idx_recurring_frequency').on(table.frequency),
    projectIdx: index('idx_recurring_project').on(table.projectId),
  }),
);

export const todoTables = {
  todosTable,
  todoCommentsTable,
  projectsTable,
  recurringTemplatesTable,
};

export type TodoTables = typeof todoTables;
