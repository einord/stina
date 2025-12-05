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

export const recurringTemplatesTable = sqliteTable(
  'recurring_templates',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    description: text(),
    projectId: text('project_id').references(() => projectsTable.id, { onDelete: 'set null' }),
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    timeOfDay: text('time_of_day'), // HH:MM in local time (timezone support is not yet applied in scheduler)
    timezone: text(), // Optional IANA timezone name for future use with timeOfDay
    frequency: text().notNull(), // weekly | monthly | yearly
    dayOfWeek: integer('day_of_week', { mode: 'number' }), // legacy single day for weekly
    daysOfWeek: text('days_of_week'), // JSON array of 0-6 (Sun-Sat)
    dayOfMonth: integer('day_of_month', { mode: 'number' }), // 1-31 when monthly/yearly
    months: text(), // JSON array of 1-12 when monthly
    monthOfYear: integer('month_of_year', { mode: 'number' }), // 1-12 when yearly
    cron: text(), // optional future use
    leadTimeMinutes: integer('lead_time_minutes', { mode: 'number' }).notNull().default(0),
    leadTimeValue: integer('lead_time_value', { mode: 'number' }).notNull().default(0),
    leadTimeUnit: text('lead_time_unit').notNull().default('days'), // hours | days | after_completion
    reminderMinutes: integer('reminder_minutes', { mode: 'number' }),
    overlapPolicy: text('overlap_policy').notNull().default('skip_if_open'),
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

export const todoStepsTable = sqliteTable(
  'todo_steps',
  {
    id: text().primaryKey(),
    todoId: text('todo_id')
      .notNull()
      .references(() => todosTable.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    orderIndex: integer('order_index', { mode: 'number' }).notNull().default(0),
    completedAt: integer('completed_at', { mode: 'number' }),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    todoIdx: index('idx_todo_steps_todo').on(table.todoId),
  }),
);

export const recurringTemplateStepsTable = sqliteTable(
  'recurring_template_steps',
  {
    id: text().primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => recurringTemplatesTable.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    orderIndex: integer('order_index', { mode: 'number' }).notNull().default(0),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    templateIdx: index('idx_recurring_steps_template').on(table.templateId),
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
    recurringTemplateId: text('recurring_template_id').references(() => recurringTemplatesTable.id, { onDelete: 'set null' }),
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

export const todoTables = {
  todosTable,
  todoCommentsTable,
  projectsTable,
  recurringTemplatesTable,
  todoStepsTable,
  recurringTemplateStepsTable,
};

export type TodoTables = typeof todoTables;
