import { and, asc, count, desc, eq, gte, inArray, not, or, sql } from 'drizzle-orm';

import store from '@stina/store';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

import {
  todoTables,
  todosTable,
  todoCommentsTable,
  projectsTable,
  recurringTemplatesTable,
  todoStepsTable,
  recurringTemplateStepsTable,
} from './schema.js';
import {
  NewTodo,
  NewTodoComment,
  NewTodoStep,
  NewProject,
  NewRecurringTemplate,
  NewRecurringTemplateStep,
  RecurringLeadTimeUnit,
  RecurringFrequency,
  RecurringOverlapPolicy,
  RecurringTemplate,
  RecurringTemplateInput,
  RecurringTemplateRow,
  RecurringTemplateUpdate,
  Todo,
  TodoComment,
  TodoStep,
  TodoStepInput,
  TodoStepUpdate,
  TodoStepRow,
  TodoInput,
  TodoQuery,
  TodoRow,
  TodoStatus,
  TodoUpdate,
  Project,
  ProjectInput,
  ProjectRow,
  ProjectUpdate,
  RecurringTemplateStep,
  RecurringTemplateStepInput,
  RecurringTemplateStepRow,
  RecurringTemplateStepUpdate,
} from './types.js';

const MODULE = 'todos';

const todoSelection = {
  id: todosTable.id,
  title: todosTable.title,
  description: todosTable.description,
  status: todosTable.status,
  dueTs: todosTable.dueTs,
  isAllDay: todosTable.isAllDay,
  reminderMinutes: todosTable.reminderMinutes,
  metadata: todosTable.metadata,
  source: todosTable.source,
  projectId: todosTable.projectId,
  recurringTemplateId: todosTable.recurringTemplateId,
  createdAt: todosTable.createdAt,
  updatedAt: todosTable.updatedAt,
  projectName: projectsTable.name,
  comment_count: count(todoCommentsTable.id).as('comment_count'),
};

const todoStepSelection = {
  id: todoStepsTable.id,
  todoId: todoStepsTable.todoId,
  title: todoStepsTable.title,
  isDone: todoStepsTable.isDone,
  orderIndex: todoStepsTable.orderIndex,
  completedAt: todoStepsTable.completedAt,
  createdAt: todoStepsTable.createdAt,
  updatedAt: todoStepsTable.updatedAt,
};

const recurringStepSelection = {
  id: recurringTemplateStepsTable.id,
  templateId: recurringTemplateStepsTable.templateId,
  title: recurringTemplateStepsTable.title,
  orderIndex: recurringTemplateStepsTable.orderIndex,
  createdAt: recurringTemplateStepsTable.createdAt,
  updatedAt: recurringTemplateStepsTable.updatedAt,
};

/**
 * Ensures legacy installations have new columns before Drizzle registers indexes.
 */
function ensureTodoColumnsExist() {
  const raw = store.getRawDatabase();
  const hasTodosTable = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'todos' LIMIT 1")
    .get();
  if (!hasTodosTable) return;

  const ensureColumn = (name: string, ddl: string) => {
    const hasColumn = raw
      .prepare(`SELECT 1 FROM pragma_table_info('todos') WHERE name = ? LIMIT 1`)
      .get(name);
    if (hasColumn) return;
    try {
      raw.exec(ddl);
    } catch (error) {
      console.warn(`[todos] Failed to add column ${name} (may already exist):`, error);
    }
  };

  ensureColumn('project_id', 'ALTER TABLE todos ADD COLUMN project_id TEXT;');
  ensureColumn('is_all_day', 'ALTER TABLE todos ADD COLUMN is_all_day INTEGER DEFAULT 0 NOT NULL;');
  ensureColumn('reminder_minutes', 'ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER;');
  ensureColumn('recurring_template_id', 'ALTER TABLE todos ADD COLUMN recurring_template_id TEXT;');
}

function ensureRecurringColumnsAndMigrate() {
  const raw = store.getRawDatabase();
  const hasRecurringTable = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recurring_templates' LIMIT 1")
    .get();
  if (!hasRecurringTable) return;

  const ensureColumn = (name: string, ddl: string) => {
    const hasColumn = raw
      .prepare(`SELECT 1 FROM pragma_table_info('recurring_templates') WHERE name = ? LIMIT 1`)
      .get(name);
    if (hasColumn) return;
    try {
      raw.exec(ddl);
    } catch (error) {
      console.warn(`[todos] Failed to add column ${name} (may already exist):`, error);
    }
  };

  ensureColumn('days_of_week', 'ALTER TABLE recurring_templates ADD COLUMN days_of_week TEXT;');
  ensureColumn('months', 'ALTER TABLE recurring_templates ADD COLUMN months TEXT;');
  ensureColumn('month_of_year', 'ALTER TABLE recurring_templates ADD COLUMN month_of_year INTEGER;');
  ensureColumn('lead_time_value', 'ALTER TABLE recurring_templates ADD COLUMN lead_time_value INTEGER DEFAULT 0 NOT NULL;');
  ensureColumn('lead_time_unit', "ALTER TABLE recurring_templates ADD COLUMN lead_time_unit TEXT DEFAULT 'days' NOT NULL;");
  ensureColumn('reminder_minutes', 'ALTER TABLE recurring_templates ADD COLUMN reminder_minutes INTEGER;');

  const rows = raw
    .prepare(
      `SELECT id, frequency, day_of_week, day_of_month, days_of_week, months, month_of_year, lead_time_minutes, lead_time_value, lead_time_unit, reminder_minutes
       FROM recurring_templates`,
    )
    .all() as Array<{
    id: string;
    frequency: string;
    day_of_week: number | null;
    day_of_month: number | null;
    days_of_week: string | null;
    months: string | null;
    month_of_year: number | null;
    lead_time_minutes: number | null;
    lead_time_value: number | null;
    lead_time_unit: string | null;
    reminder_minutes: number | null;
  }>;

  const update = raw.prepare(
    `UPDATE recurring_templates
     SET frequency = @frequency,
         day_of_week = @day_of_week,
         days_of_week = @days_of_week,
         day_of_month = @day_of_month,
         months = @months,
         month_of_year = @month_of_year,
         lead_time_value = @lead_time_value,
         lead_time_unit = @lead_time_unit,
         lead_time_minutes = @lead_time_minutes,
         reminder_minutes = @reminder_minutes
     WHERE id = @id`,
  );

  for (const row of rows) {
    const frequency = normalizeFrequency(row.frequency);
    const parsedDays = parseNumberArray(row.days_of_week, 0, 6);
    let daysOfWeek = parsedDays;
    if (!daysOfWeek || !daysOfWeek.length) {
      if (row.frequency === 'weekday') {
        daysOfWeek = [1, 2, 3, 4, 5];
      } else if (row.frequency === 'daily') {
        daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
      } else if (typeof row.day_of_week === 'number') {
        daysOfWeek = [row.day_of_week];
      }
    }

    const parsedMonths = parseNumberArray(row.months, 1, 12);
    const months = frequency === 'monthly' ? parsedMonths : null;
    const monthOfYear = frequency === 'yearly' ? (row.month_of_year ?? parsedMonths?.[0] ?? null) : null;
    const dayOfMonth = frequency === 'weekly' ? null : clampDayOfMonthValue(row.day_of_month ?? 1);

    const lead = normalizeLeadTime(row.lead_time_value, row.lead_time_unit as RecurringLeadTimeUnit | null, row.lead_time_minutes ?? 0);

    update.run({
      id: row.id,
      frequency,
      day_of_week: daysOfWeek?.[0] ?? null,
      days_of_week: serializeNumberArray(daysOfWeek),
      day_of_month: dayOfMonth,
      months: months ? JSON.stringify(months) : null,
      month_of_year: monthOfYear,
      lead_time_value: lead.value,
      lead_time_unit: lead.unit,
      lead_time_minutes: lead.minutes,
      reminder_minutes: row.reminder_minutes ?? null,
    });
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clampDayOfMonthValue(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return null;
  return Math.min(Math.max(num, 1), 31);
}

function normalizeNumberArray(values: Array<number | null | undefined> | null | undefined, min: number, max: number): number[] | null {
  if (!values) return null;
  const cleaned = values
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => Number.isFinite(v) && v >= min && v <= max)
    .map((v) => Math.round(v));
  const unique = Array.from(new Set(cleaned)).sort((a, b) => a - b);
  return unique.length ? unique : null;
}

function parseNumberArray(raw: string | null | undefined, min: number, max: number): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return normalizeNumberArray(parsed as Array<number | null | undefined>, min, max);
  } catch {
    return null;
  }
}

function serializeNumberArray(values: number[] | null | undefined): string | null {
  if (!values?.length) return null;
  return JSON.stringify(values);
}

function normalizeFrequency(value: string | null | undefined): RecurringFrequency {
  switch (value) {
    case 'weekly':
    case 'monthly':
    case 'yearly':
      return value;
    case 'daily':
    case 'weekday':
    default:
      return 'weekly';
  }
}

function normalizeLeadTime(
  value: number | null | undefined,
  unit: RecurringLeadTimeUnit | null | undefined,
  fallbackMinutes?: number | null,
): { value: number; unit: RecurringLeadTimeUnit; minutes: number } {
  const safeUnit: RecurringLeadTimeUnit =
    unit === 'hours' || unit === 'after_completion' ? unit : 'days';
  const numericValue = Number.isFinite(value as number) ? Math.max(Number(value), 0) : 0;
  if (safeUnit === 'after_completion') {
    return { value: 0, unit: 'after_completion', minutes: 0 };
  }
  const minutes =
    safeUnit === 'hours' ? numericValue * 60 : Number.isFinite(numericValue) ? numericValue * 24 * 60 : 0;
  if (minutes === 0 && fallbackMinutes && fallbackMinutes > 0) {
    if (fallbackMinutes % (24 * 60) === 0) {
      const days = Math.round(fallbackMinutes / (24 * 60));
      return { value: days, unit: 'days', minutes: days * 24 * 60 };
    }
    if (fallbackMinutes % 60 === 0) {
      const hours = Math.round(fallbackMinutes / 60);
      return { value: hours, unit: 'hours', minutes: hours * 60 };
    }
  }
  return { value: numericValue, unit: safeUnit, minutes };
}

class TodoRepository {
  constructor(private readonly db = store.getDatabase(), private readonly emitChange: (p: unknown) => void) {}

  onChange(listener: (payload: unknown) => void) {
    return store.onChange(MODULE, listener);
  }

  /**
   * Reloads todos after an external change (e.g. another process wrote to the DB).
   */
  watchExternalChanges() {
    return store.on('external-change', () => {
      this.emitChange({ kind: 'external' });
    });
  }

  /**
   * Returns todos with optional filters. By default excludes completed/cancelled
   * todos last updated before today unless includeArchived is true.
   */
  async list(query?: TodoQuery): Promise<Todo[]> {
    const filters = [];
    const includeArchived = query?.includeArchived ?? false;
    if (!includeArchived) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayTs = startOfToday.getTime();
      filters.push(
        or(
          not(inArray(todosTable.status, ['completed', 'cancelled'])),
          gte(todosTable.updatedAt, todayTs),
        ),
      );
    }
    const where = filters.length ? and(...filters) : undefined;
    const rows = await this.db
      .select(todoSelection)
      .from(todosTable)
      .leftJoin(projectsTable, eq(todosTable.projectId, projectsTable.id))
      .leftJoin(todoCommentsTable, eq(todosTable.id, todoCommentsTable.todoId))
      .where(where)
      .groupBy(todosTable.id)
      .orderBy(
        asc(sql`CASE WHEN ${todosTable.dueTs} IS NULL THEN 1 ELSE 0 END`),
        asc(todosTable.dueTs),
        asc(todosTable.createdAt),
      )
      .limit(query?.limit ?? 100);
    const todos = rows.map((row) => this.mapRow(row as TodoRow & { comment_count?: number | null; projectName?: string | null }));
    const stepMap = await this.listStepsByTodoIds(todos.map((t) => t.id));
    return todos.map((todo) => ({ ...todo, steps: stepMap[todo.id] ?? [] }));
  }

  /**
   * Returns all projects sorted alphabetically.
   */
  async listProjects(): Promise<Project[]> {
    const rows = await this.db.select().from(projectsTable).orderBy(asc(projectsTable.name));
    return rows.map((row) => this.mapProjectRow(row as ProjectRow));
  }

  async listRecurringTemplates(enabledOnly = false): Promise<RecurringTemplate[]> {
    const rows = await this.db
      .select()
      .from(recurringTemplatesTable)
      .where(enabledOnly ? eq(recurringTemplatesTable.enabled, true) : undefined)
      .orderBy(asc(recurringTemplatesTable.title));
    const templates = rows.map((row) => this.mapRecurringRow(row as RecurringTemplateRow));
    const stepMap = await this.listRecurringTemplateStepsByIds(templates.map((tpl) => tpl.id));
    return templates.map((tpl) => ({ ...tpl, steps: stepMap[tpl.id] ?? [] }));
  }

  async listRecurringTemplateSteps(templateId: string): Promise<RecurringTemplateStep[]> {
    if (!templateId) return [];
    const rows = await this.db
      .select(recurringStepSelection)
      .from(recurringTemplateStepsTable)
      .where(eq(recurringTemplateStepsTable.templateId, templateId))
      .orderBy(asc(recurringTemplateStepsTable.orderIndex), asc(recurringTemplateStepsTable.createdAt));
    return rows.map((row) => this.mapRecurringStepRow(row as RecurringTemplateStepRow));
  }

  async listRecurringTemplateStepsByIds(ids: string[]): Promise<Record<string, RecurringTemplateStep[]>> {
    if (!ids.length) return {};
    const rows = await this.db
      .select(recurringStepSelection)
      .from(recurringTemplateStepsTable)
      .where(inArray(recurringTemplateStepsTable.templateId, ids))
      .orderBy(asc(recurringTemplateStepsTable.orderIndex), asc(recurringTemplateStepsTable.createdAt));
    const map: Record<string, RecurringTemplateStep[]> = {};
    for (const row of rows) {
      const list = map[row.templateId] ?? [];
      list.push(this.mapRecurringStepRow(row as RecurringTemplateStepRow));
      map[row.templateId] = list;
    }
    return map;
  }

  async findRecurringTemplateById(id: string): Promise<RecurringTemplate | null> {
    if (!id) return null;
    const rows = await this.db
      .select()
      .from(recurringTemplatesTable)
      .where(eq(recurringTemplatesTable.id, id))
      .limit(1);
    if (!rows[0]) return null;
    const base = this.mapRecurringRow(rows[0] as RecurringTemplateRow);
    const steps = await this.listRecurringTemplateSteps(base.id);
    return { ...base, steps };
  }

  async insertRecurringTemplate(input: RecurringTemplateInput): Promise<RecurringTemplate> {
    const now = Date.now();
    const frequency = normalizeFrequency(input.frequency);
    const daysOfWeek =
      frequency === 'weekly'
        ? normalizeNumberArray(
            input.daysOfWeek ?? (input.dayOfWeek !== undefined ? [input.dayOfWeek] : null),
            0,
            6,
          )
        : null;
    const months = frequency === 'monthly' ? normalizeNumberArray(input.months, 1, 12) : null;
    const monthOfYear =
      frequency === 'yearly'
        ? normalizeNumberArray([input.monthOfYear ?? null], 1, 12)?.[0] ?? null
        : null;
    const dayOfMonth = frequency === 'weekly' ? null : clampDayOfMonthValue(input.dayOfMonth ?? 1);
    const lead = normalizeLeadTime(
      input.leadTimeValue ?? null,
      input.leadTimeUnit ?? null,
      input.leadTimeMinutes ?? 0,
    );
    const record: NewRecurringTemplate = {
      id: `rt_${uid()}`,
      title: input.title?.trim() || '',
      description: input.description?.trim() || null,
      projectId: input.projectId?.trim() || null,
      isAllDay: !!input.isAllDay,
      timeOfDay: input.isAllDay ? null : input.timeOfDay?.trim() || null,
      timezone: input.timezone?.trim() || null,
      frequency,
      dayOfWeek: daysOfWeek?.[0] ?? null,
      daysOfWeek: serializeNumberArray(daysOfWeek),
      dayOfMonth,
      months: serializeNumberArray(months),
      monthOfYear,
      cron: input.cron?.trim() || null,
      leadTimeMinutes: lead.minutes,
      leadTimeValue: lead.value,
      leadTimeUnit: lead.unit,
      reminderMinutes: input.reminderMinutes ?? null,
      overlapPolicy: input.overlapPolicy ?? 'skip_if_open',
      lastGeneratedDueAt: null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    if (!record.title) throw new Error('Recurring template title is required');
    await this.assertProjectExists(record.projectId);
    await this.db.insert(recurringTemplatesTable).values(record);
    if (input.steps?.length) {
      const nowSteps = input.steps.map((step, idx) => ({
        title: step.title,
        orderIndex: step.orderIndex ?? idx,
      }));
      await this.insertRecurringTemplateSteps(record.id, nowSteps);
    }
    const mapped = this.mapRecurringRow(record as RecurringTemplateRow);
    const steps = await this.listRecurringTemplateSteps(record.id);
    this.emitChange({ kind: 'recurring_template', id: record.id });
    return { ...mapped, steps };
  }

  async updateRecurringTemplate(
    id: string,
    patch: RecurringTemplateUpdate,
  ): Promise<RecurringTemplate | null> {
    const existing = await this.db.select().from(recurringTemplatesTable).where(eq(recurringTemplatesTable.id, id)).limit(1);
    if (!existing[0]) return null;
    const current = this.mapRecurringRow(existing[0] as RecurringTemplateRow);
    const updates: Partial<NewRecurringTemplate> = { updatedAt: Date.now() };
    if (patch.title !== undefined) updates.title = patch.title?.trim() || '';
    if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
    if (patch.projectId !== undefined) {
      const projectId = patch.projectId?.trim() || null;
      await this.assertProjectExists(projectId);
      updates.projectId = projectId;
    }
    if (patch.isAllDay !== undefined) updates.isAllDay = !!patch.isAllDay;
    if (patch.timeOfDay !== undefined) updates.timeOfDay = patch.timeOfDay?.trim() || null;
    if (patch.timezone !== undefined) updates.timezone = patch.timezone?.trim() || null;
    if (patch.isAllDay === true) updates.timeOfDay = null;
    const nextFrequency = normalizeFrequency(patch.frequency ?? current.frequency);
    updates.frequency = nextFrequency;

    const nextDaysOfWeek =
      nextFrequency === 'weekly'
        ? normalizeNumberArray(
            patch.daysOfWeek ?? (patch.dayOfWeek !== undefined ? [patch.dayOfWeek] : current.daysOfWeek ?? (current.dayOfWeek !== null ? [current.dayOfWeek] : null)),
            0,
            6,
          )
        : null;
    updates.dayOfWeek = nextDaysOfWeek?.[0] ?? null;
    updates.daysOfWeek = serializeNumberArray(nextDaysOfWeek);

    updates.dayOfMonth =
      nextFrequency === 'weekly'
        ? null
        : clampDayOfMonthValue(patch.dayOfMonth ?? current.dayOfMonth ?? 1);

    const nextMonths =
      nextFrequency === 'monthly'
        ? normalizeNumberArray(patch.months ?? current.months ?? null, 1, 12)
        : null;
    updates.months = serializeNumberArray(nextMonths);
    updates.monthOfYear =
      nextFrequency === 'yearly'
        ? normalizeNumberArray([patch.monthOfYear ?? current.monthOfYear ?? null], 1, 12)?.[0] ?? null
        : null;
    if (patch.cron !== undefined) updates.cron = patch.cron?.trim() || null;
    const lead = normalizeLeadTime(
      patch.leadTimeValue ?? current.leadTimeValue,
      patch.leadTimeUnit ?? current.leadTimeUnit,
      patch.leadTimeMinutes ?? current.leadTimeMinutes,
    );
    updates.leadTimeMinutes = lead.minutes;
    updates.leadTimeValue = lead.value;
    updates.leadTimeUnit = lead.unit;
    if (patch.reminderMinutes !== undefined) updates.reminderMinutes = patch.reminderMinutes ?? null;
    if (patch.overlapPolicy !== undefined) updates.overlapPolicy = patch.overlapPolicy;
    if (patch.lastGeneratedDueAt !== undefined) updates.lastGeneratedDueAt = patch.lastGeneratedDueAt ?? null;
    if (patch.enabled !== undefined) updates.enabled = !!patch.enabled;

    if (updates.title !== undefined && !updates.title) throw new Error('Recurring template title is required');
    await this.db.update(recurringTemplatesTable).set(updates).where(eq(recurringTemplatesTable.id, id));
    this.emitChange({ kind: 'recurring_template', id });
    const refreshed = await this.db
      .select()
      .from(recurringTemplatesTable)
      .where(eq(recurringTemplatesTable.id, id))
      .limit(1);
    if (!refreshed[0]) return null;
    const mapped = this.mapRecurringRow(refreshed[0] as RecurringTemplateRow);
    const steps = await this.listRecurringTemplateSteps(id);
    return { ...mapped, steps };
  }

  async deleteRecurringTemplate(id: string): Promise<boolean> {
    const existing = await this.db
      .select()
      .from(recurringTemplatesTable)
      .where(eq(recurringTemplatesTable.id, id))
      .limit(1);
    if (!existing[0]) return false;
    await this.db.delete(recurringTemplatesTable).where(eq(recurringTemplatesTable.id, id));
    await this.db
      .update(todosTable)
      .set({ recurringTemplateId: null })
      .where(eq(todosTable.recurringTemplateId, id));
    this.emitChange({ kind: 'recurring_template', id });
    return true;
  }

  async listOpenTodosForTemplate(templateId: string): Promise<Todo[]> {
    if (!templateId) return [];
    const selection = {
      ...todoSelection,
      comment_count: sql<number>`0`.as('comment_count'),
    };
    const rows = await this.db
      .select(selection)
      .from(todosTable)
      .leftJoin(projectsTable, eq(todosTable.projectId, projectsTable.id))
      .where(
        and(eq(todosTable.recurringTemplateId, templateId), inArray(todosTable.status, ['not_started', 'in_progress'])),
      );
    const todos = rows.map((row) => this.mapRow(row as TodoRow & { comment_count?: number | null; projectName?: string | null }));
    const stepMap = await this.listStepsByTodoIds(todos.map((t) => t.id));
    return todos.map((todo) => ({ ...todo, steps: stepMap[todo.id] ?? [] }));
  }

  async listComments(todoId: string): Promise<TodoComment[]> {
    if (!todoId) return [];
    const rows = await this.db
      .select()
      .from(todoCommentsTable)
      .where(eq(todoCommentsTable.todoId, todoId))
      .orderBy(asc(todoCommentsTable.createdAt));
    return rows.map((row) => ({
      id: row.id,
      todoId: row.todoId,
      content: row.content,
      createdAt: Number(row.createdAt) || 0,
    }));
  }

  async listCommentsByTodoIds(ids: string[]): Promise<Record<string, TodoComment[]>> {
    if (!ids.length) return {};
    const rows = await this.db
      .select()
      .from(todoCommentsTable)
      .where(inArray(todoCommentsTable.todoId, ids))
      .orderBy(asc(todoCommentsTable.createdAt));
    const map: Record<string, TodoComment[]> = {};
    for (const row of rows) {
      const arr = map[row.todoId] ?? [];
      arr.push({
        id: row.id,
        todoId: row.todoId,
        content: row.content,
        createdAt: Number(row.createdAt) || 0,
      });
      map[row.todoId] = arr;
    }
    return map;
  }

  async listSteps(todoId: string): Promise<TodoStep[]> {
    if (!todoId) return [];
    const rows = await this.db
      .select(todoStepSelection)
      .from(todoStepsTable)
      .where(eq(todoStepsTable.todoId, todoId))
      .orderBy(asc(todoStepsTable.orderIndex), asc(todoStepsTable.createdAt));
    return rows.map((row) => this.mapStepRow(row as TodoStepRow));
  }

  async listStepsByTodoIds(ids: string[]): Promise<Record<string, TodoStep[]>> {
    if (!ids.length) return {};
    const rows = await this.db
      .select(todoStepSelection)
      .from(todoStepsTable)
      .where(inArray(todoStepsTable.todoId, ids))
      .orderBy(asc(todoStepsTable.orderIndex), asc(todoStepsTable.createdAt));
    const map: Record<string, TodoStep[]> = {};
    for (const row of rows) {
      const list = map[row.todoId] ?? [];
      list.push(this.mapStepRow(row as TodoStepRow));
      map[row.todoId] = list;
    }
    return map;
  }

  async insertStep(todoId: string, input: TodoStepInput): Promise<TodoStep> {
    const todo = await this.db
      .select({ id: todosTable.id, status: todosTable.status })
      .from(todosTable)
      .where(eq(todosTable.id, todoId))
      .limit(1);
    if (!todo[0]) throw new Error('Todo not found');
    const existing = await this.listSteps(todoId);
    const baseOrder = existing.length ? Math.max(...existing.map((s) => s.orderIndex)) + 1 : 0;
    const now = Date.now();
    const isDone = !!input.isDone;
    const record: NewTodoStep = {
      id: `ts_${uid()}`,
      todoId,
      title: input.title?.trim() || '',
      isDone,
      orderIndex: input.orderIndex ?? baseOrder,
      completedAt: isDone ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    if (!record.title) throw new Error('Step title is required');
    await this.db.insert(todoStepsTable).values(record);
    await this.touchTodo(todoId);
    if (isDone && todo[0].status === 'not_started') {
      await this.db
        .update(todosTable)
        .set({ status: 'in_progress', updatedAt: Date.now() })
        .where(eq(todosTable.id, todoId));
    }
    this.emitChange({ kind: 'todo', id: todoId });
    return this.mapStepRow(record as TodoStepRow);
  }

  async updateStep(id: string, patch: TodoStepUpdate): Promise<TodoStep | null> {
    const rows = await this.db.select().from(todoStepsTable).where(eq(todoStepsTable.id, id)).limit(1);
    if (!rows[0]) return null;
    const current = this.mapStepRow(rows[0] as TodoStepRow);
    const updates: Partial<NewTodoStep> = { updatedAt: Date.now() };
    let toggledDone = false;
    if (patch.title !== undefined) updates.title = patch.title?.trim() || current.title;
    if (patch.isDone !== undefined) {
      const nextDone = !!patch.isDone;
      updates.isDone = nextDone;
      if (nextDone && !current.isDone) {
        toggledDone = true;
        updates.completedAt = Date.now();
      } else if (!nextDone) {
        updates.completedAt = null;
      }
    }
    if (patch.orderIndex !== undefined && Number.isFinite(patch.orderIndex as number)) {
      updates.orderIndex = Number(patch.orderIndex);
    }
    await this.db.update(todoStepsTable).set(updates).where(eq(todoStepsTable.id, id));
    await this.touchTodo(current.todoId);
    if (toggledDone) {
      const todo = await this.db
        .select({ status: todosTable.status })
        .from(todosTable)
        .where(eq(todosTable.id, current.todoId))
        .limit(1);
      if (todo[0]?.status === 'not_started') {
        await this.db
          .update(todosTable)
          .set({ status: 'in_progress', updatedAt: Date.now() })
          .where(eq(todosTable.id, current.todoId));
      }
    }
    this.emitChange({ kind: 'todo', id: current.todoId });
    const refreshed = await this.db
      .select(todoStepSelection)
      .from(todoStepsTable)
      .where(eq(todoStepsTable.id, id))
      .limit(1);
    return refreshed[0] ? this.mapStepRow(refreshed[0] as TodoStepRow) : null;
  }

  async deleteStep(id: string): Promise<TodoStep | null> {
    const rows = await this.db.select().from(todoStepsTable).where(eq(todoStepsTable.id, id)).limit(1);
    if (!rows[0]) return null;
    const step = this.mapStepRow(rows[0] as TodoStepRow);
    await this.db.delete(todoStepsTable).where(eq(todoStepsTable.id, id));
    await this.touchTodo(step.todoId);
    this.emitChange({ kind: 'todo', id: step.todoId });
    return step;
  }

  async reorderSteps(todoId: string, orderedIds: string[]): Promise<TodoStep[]> {
    if (!orderedIds.length) return this.listSteps(todoId);
    const steps = await this.listSteps(todoId);
    const orderMap = new Map(orderedIds.map((id, idx) => [id, idx] as const));
    const updates: Array<Promise<unknown>> = [];
    for (const step of steps) {
      const nextOrder = orderMap.has(step.id) ? orderMap.get(step.id)! : step.orderIndex;
      if (nextOrder === step.orderIndex) continue;
      updates.push(
        this.db.update(todoStepsTable).set({ orderIndex: nextOrder, updatedAt: Date.now() }).where(eq(todoStepsTable.id, step.id)),
      );
    }
    if (updates.length) await Promise.all(updates);
    await this.touchTodo(todoId);
    this.emitChange({ kind: 'todo', id: todoId });
    return this.listSteps(todoId);
  }

  async insertRecurringTemplateStep(templateId: string, input: RecurringTemplateStepInput): Promise<RecurringTemplateStep> {
    const existing = await this.listRecurringTemplateSteps(templateId);
    const now = Date.now();
    const record: NewRecurringTemplateStep = {
      id: `rts_${uid()}`,
      templateId,
      title: input.title?.trim() || '',
      orderIndex: input.orderIndex ?? (existing.length ? Math.max(...existing.map((s) => s.orderIndex)) + 1 : 0),
      createdAt: now,
      updatedAt: now,
    };
    if (!record.title) throw new Error('Step title is required');
    await this.db.insert(recurringTemplateStepsTable).values(record);
    this.emitChange({ kind: 'recurring_template', id: templateId });
    return this.mapRecurringStepRow(record as RecurringTemplateStepRow);
  }

  async updateRecurringTemplateStep(id: string, patch: RecurringTemplateStepUpdate): Promise<RecurringTemplateStep | null> {
    const rows = await this.db
      .select()
      .from(recurringTemplateStepsTable)
      .where(eq(recurringTemplateStepsTable.id, id))
      .limit(1);
    if (!rows[0]) return null;
    const current = this.mapRecurringStepRow(rows[0] as RecurringTemplateStepRow);
    const updates: Partial<NewRecurringTemplateStep> = { updatedAt: Date.now() };
    if (patch.title !== undefined) updates.title = patch.title?.trim() || current.title;
    if (patch.orderIndex !== undefined && Number.isFinite(patch.orderIndex as number)) {
      updates.orderIndex = Number(patch.orderIndex);
    }
    await this.db
      .update(recurringTemplateStepsTable)
      .set(updates)
      .where(eq(recurringTemplateStepsTable.id, id));
    this.emitChange({ kind: 'recurring_template', id: current.templateId });
    const refreshed = await this.db
      .select(recurringStepSelection)
      .from(recurringTemplateStepsTable)
      .where(eq(recurringTemplateStepsTable.id, id))
      .limit(1);
    return refreshed[0] ? this.mapRecurringStepRow(refreshed[0] as RecurringTemplateStepRow) : null;
  }

  async deleteRecurringTemplateStep(id: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(recurringTemplateStepsTable)
      .where(eq(recurringTemplateStepsTable.id, id))
      .limit(1);
    if (!rows[0]) return false;
    const step = this.mapRecurringStepRow(rows[0] as RecurringTemplateStepRow);
    await this.db.delete(recurringTemplateStepsTable).where(eq(recurringTemplateStepsTable.id, id));
    this.emitChange({ kind: 'recurring_template', id: step.templateId });
    return true;
  }

  async reorderRecurringTemplateSteps(templateId: string, orderedIds: string[]): Promise<RecurringTemplateStep[]> {
    if (!orderedIds.length) return this.listRecurringTemplateSteps(templateId);
    const steps = await this.listRecurringTemplateSteps(templateId);
    const orderMap = new Map(orderedIds.map((id, idx) => [id, idx] as const));
    const updates: Array<Promise<unknown>> = [];
    for (const step of steps) {
      const nextOrder = orderMap.has(step.id) ? orderMap.get(step.id)! : step.orderIndex;
      if (nextOrder === step.orderIndex) continue;
      updates.push(
        this.db
          .update(recurringTemplateStepsTable)
          .set({ orderIndex: nextOrder, updatedAt: Date.now() })
          .where(eq(recurringTemplateStepsTable.id, step.id)),
      );
    }
    if (updates.length) await Promise.all(updates);
    this.emitChange({ kind: 'recurring_template', id: templateId });
    return this.listRecurringTemplateSteps(templateId);
  }

  private async insertRecurringTemplateSteps(templateId: string, inputs: RecurringTemplateStepInput[]): Promise<void> {
    if (!inputs?.length) return;
    const existing = await this.listRecurringTemplateSteps(templateId);
    let order = existing.length ? Math.max(...existing.map((s) => s.orderIndex)) + 1 : 0;
    const now = Date.now();
    const records: NewRecurringTemplateStep[] = [];
    for (const input of inputs) {
      const title = input.title?.trim();
      if (!title) continue;
      const orderIndex = input.orderIndex ?? order++;
      records.push({
        id: `rts_${uid()}`,
        templateId,
        title,
        orderIndex,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!records.length) return;
    await this.db.insert(recurringTemplateStepsTable).values(records);
  }

  async replaceRecurringTemplateSteps(templateId: string, inputs: RecurringTemplateStepInput[]): Promise<void> {
    await this.db.delete(recurringTemplateStepsTable).where(eq(recurringTemplateStepsTable.templateId, templateId));
    if (!inputs?.length) return;
    await this.insertRecurringTemplateSteps(templateId, inputs);
  }

  private async insertTodoSteps(todoId: string, inputs: TodoStepInput[]): Promise<void> {
    if (!inputs?.length) return;
    const existing = await this.listSteps(todoId);
    let order = existing.length ? Math.max(...existing.map((s) => s.orderIndex)) + 1 : 0;
    const now = Date.now();
    const records: NewTodoStep[] = [];
    for (const input of inputs) {
      const title = input.title?.trim();
      if (!title) continue;
      const orderIndex = input.orderIndex ?? order++;
      records.push({
        id: `ts_${uid()}`,
        todoId,
        title,
        isDone: !!input.isDone,
        orderIndex,
        completedAt: input.isDone ? now : null,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!records.length) return;
    await this.db.insert(todoStepsTable).values(records);
    await this.touchTodo(todoId);
  }

  private async touchTodo(todoId: string) {
    await this.db.update(todosTable).set({ updatedAt: Date.now() }).where(eq(todosTable.id, todoId));
  }

  async findByIdentifier(identifier: string): Promise<Todo | null> {
    const trimmed = identifier?.trim();
    if (!trimmed) return null;
    const byId = await this.hydrateTodo(trimmed);
    if (byId) return byId;

    const byTitle = await this.db
      .select(todoSelection)
      .from(todosTable)
      .leftJoin(projectsTable, eq(todosTable.projectId, projectsTable.id))
      .leftJoin(todoCommentsTable, eq(todosTable.id, todoCommentsTable.todoId))
      .where(eq(todosTable.title, trimmed))
      .groupBy(todosTable.id)
      .orderBy(desc(todosTable.updatedAt))
      .limit(1);
    if (!byTitle[0]) return null;
    const mapped = this.mapRow(byTitle[0] as TodoRow & { comment_count?: number | null; projectName?: string | null });
    const steps = await this.listSteps(mapped.id);
    return { ...mapped, steps };
  }

  /**
   * Finds a project by id or exact name match.
   */
  async findProjectByIdentifier(identifier: string): Promise<Project | null> {
    const trimmed = identifier?.trim();
    if (!trimmed) return null;
    const byId = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, trimmed))
      .limit(1);
    if (byId[0]) return this.mapProjectRow(byId[0] as ProjectRow);

    const byName = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.name, trimmed))
      .limit(1);
    return byName[0] ? this.mapProjectRow(byName[0] as ProjectRow) : null;
  }

  async insert(input: TodoInput): Promise<Todo> {
    const now = Date.now();
    const title = input.title?.trim();
    if (!title) throw new Error('Todo title is required');
    const projectId = input.projectId?.trim() ? input.projectId.trim() : null;
    await this.assertProjectExists(projectId);
    const recurringTemplateId = input.recurringTemplateId?.trim() ? input.recurringTemplateId.trim() : null;
    await this.assertRecurringTemplateExists(recurringTemplateId);

    const record: NewTodo = {
      id: `td_${uid()}`,
      title,
      description: input.description ?? null,
      status: input.status ?? 'not_started',
      dueTs: input.dueAt ?? null,
      isAllDay: input.isAllDay ?? false,
      reminderMinutes: input.reminderMinutes ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      source: input.source ?? null,
      projectId,
      recurringTemplateId,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(todosTable).values(record);
    if (input.steps?.length) {
      await this.insertTodoSteps(record.id, input.steps);
    } else if (recurringTemplateId) {
      const templateSteps = await this.listRecurringTemplateSteps(recurringTemplateId);
      if (templateSteps.length) {
        await this.insertTodoSteps(
          record.id,
          templateSteps.map((step) => ({ title: step.title, orderIndex: step.orderIndex })),
        );
      }
    }
    this.emitChange({ kind: 'todo', id: record.id });
    const hydrated = await this.hydrateTodo(record.id);
    if (hydrated) return hydrated;
    return this.mapRow({ ...record, comment_count: 0 } as TodoRow & { comment_count?: number | null; projectName?: string | null });
  }

  /**
   * Creates a new project entry.
   */
  async insertProject(input: ProjectInput): Promise<Project> {
    const name = input.name?.trim();
    if (!name) throw new Error('Project name is required');
    const now = Date.now();
    const record: NewProject = {
      id: `pr_${uid()}`,
      name,
      description: input.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(projectsTable).values(record);
    this.emitChange({ kind: 'project', id: record.id });
    return this.mapProjectRow(record as ProjectRow);
  }

  async update(id: string, patch: TodoUpdate): Promise<Todo | null> {
    const existing = await this.db.select().from(todosTable).where(eq(todosTable.id, id)).limit(1);
    if (!existing[0]) return null;
    const updates: Partial<NewTodo> = {
      updatedAt: Date.now(),
    };
    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.description !== undefined) updates.description = patch.description ?? null;
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.dueAt !== undefined) updates.dueTs = patch.dueAt;
    if (patch.isAllDay !== undefined) updates.isAllDay = patch.isAllDay;
    if (patch.reminderMinutes !== undefined) updates.reminderMinutes = patch.reminderMinutes;
    if (patch.metadata !== undefined) {
      updates.metadata = patch.metadata ? JSON.stringify(patch.metadata) : null;
    }
    if (patch.source !== undefined) updates.source = patch.source ?? null;
    if (patch.projectId !== undefined) {
      const projectId = patch.projectId?.trim() ? patch.projectId.trim() : null;
      await this.assertProjectExists(projectId);
      updates.projectId = projectId;
    }
    if (patch.recurringTemplateId !== undefined) {
      const rtId = patch.recurringTemplateId?.trim() ? patch.recurringTemplateId.trim() : null;
      await this.assertRecurringTemplateExists(rtId);
      updates.recurringTemplateId = rtId;
    }
    await this.db.update(todosTable).set(updates).where(eq(todosTable.id, id));
    this.emitChange({ kind: 'todo', id });
    return this.hydrateTodo(id);
  }

  async updateProject(id: string, patch: ProjectUpdate): Promise<Project | null> {
    const existing = await this.db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!existing[0]) return null;
    const updates: Partial<NewProject> = { updatedAt: Date.now() };
    if (patch.name !== undefined) {
      const nextName = patch.name?.trim();
      if (!nextName) throw new Error('Project name is required');
      updates.name = nextName;
    }
    if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
    await this.db.update(projectsTable).set(updates).where(eq(projectsTable.id, id));
    this.emitChange({ kind: 'project', id });
    const next = await this.db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    return next[0] ? this.mapProjectRow(next[0] as ProjectRow) : null;
  }

  async deleteProject(id: string): Promise<boolean> {
    const existing = await this.db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    if (!existing[0]) return false;
    await this.db.update(todosTable).set({ projectId: null }).where(eq(todosTable.projectId, id));
    await this.db.delete(projectsTable).where(eq(projectsTable.id, id));
    this.emitChange({ kind: 'project', id });
    return true;
  }

  async insertComment(todoId: string, content: string): Promise<TodoComment> {
    const trimmed = content?.trim();
    if (!todoId || !trimmed) throw new Error('Todo comment requires todoId and content');
    const record: NewTodoComment = {
      id: `tc_${uid()}`,
      todoId,
      content: trimmed,
      createdAt: Date.now(),
    };
    await this.db.insert(todoCommentsTable).values(record);
    this.emitChange({ kind: 'todo_comment', id: record.id, todoId });
    return {
      id: record.id,
      todoId: record.todoId,
      content: record.content,
      createdAt: Number(record.createdAt) || 0,
    };
  }

  async deleteComment(id: string): Promise<boolean> {
    const res = await this.db.delete(todoCommentsTable).where(eq(todoCommentsTable.id, id));
    const changes =
      (res as { changes?: number; rowsAffected?: number }).changes ??
      (res as { rowsAffected?: number }).rowsAffected ??
      0;
    if (changes > 0) {
      this.emitChange({ kind: 'todo_comment', id });
      return true;
    }
    return false;
  }

  /**
   * Hydrates a todo with project + comment counts.
   */
  private async hydrateTodo(id: string): Promise<Todo | null> {
    const rows = await this.db
      .select(todoSelection)
      .from(todosTable)
      .leftJoin(projectsTable, eq(todosTable.projectId, projectsTable.id))
      .leftJoin(todoCommentsTable, eq(todosTable.id, todoCommentsTable.todoId))
      .where(eq(todosTable.id, id))
      .groupBy(todosTable.id)
      .limit(1);
    if (!rows[0]) return null;
    const base = this.mapRow(rows[0] as TodoRow & { comment_count?: number | null; projectName?: string | null });
    const steps = await this.listSteps(id);
    return { ...base, steps };
  }

  private mapRow(row: TodoRow & { comment_count?: number | null; projectName?: string | null }): Todo {
    let metadata: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      status: row.status as TodoStatus,
      dueAt: row.dueTs ?? null,
      isAllDay: !!row.isAllDay,
      reminderMinutes: row.reminderMinutes ?? null,
      metadata,
      source: row.source ?? null,
      projectId: row.projectId ?? null,
      projectName: row.projectName ?? null,
      recurringTemplateId: row.recurringTemplateId ?? null,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
      commentCount: typeof row.comment_count === 'number' ? row.comment_count : undefined,
    };
  }

  private mapStepRow(row: TodoStepRow): TodoStep {
    return {
      id: row.id,
      todoId: row.todoId,
      title: row.title,
      isDone: !!row.isDone,
      orderIndex: Number(row.orderIndex) || 0,
      completedAt: row.completedAt ?? null,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
    };
  }

  private mapRecurringStepRow(row: RecurringTemplateStepRow): RecurringTemplateStep {
    return {
      id: row.id,
      templateId: row.templateId,
      title: row.title,
      orderIndex: Number(row.orderIndex) || 0,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
    };
  }

  private mapProjectRow(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
    };
  }

  private mapRecurringRow(row: RecurringTemplateRow): RecurringTemplate {
    const frequency = normalizeFrequency(row.frequency as string);
    const daysOfWeek =
      frequency === 'weekly'
        ? parseNumberArray(row.daysOfWeek as unknown as string, 0, 6) ??
          (typeof row.dayOfWeek === 'number' ? [row.dayOfWeek] : null)
        : null;
    const months = frequency === 'monthly' ? parseNumberArray(row.months as unknown as string, 1, 12) : null;
    const monthOfYear =
      frequency === 'yearly'
        ? normalizeNumberArray([row.monthOfYear as number | null | undefined], 1, 12)?.[0] ?? null
        : null;
    const dayOfMonth =
      frequency === 'weekly'
        ? null
        : clampDayOfMonthValue(row.dayOfMonth ?? null) ?? clampDayOfMonthValue(1);
    const lead = normalizeLeadTime(
      row.leadTimeValue,
      row.leadTimeUnit as RecurringLeadTimeUnit | null,
      row.leadTimeMinutes,
    );
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      projectId: row.projectId ?? null,
      isAllDay: !!row.isAllDay,
      timeOfDay: row.timeOfDay ?? null,
      timezone: row.timezone ?? null,
      frequency,
      dayOfWeek: daysOfWeek?.[0] ?? null,
      daysOfWeek,
      dayOfMonth: dayOfMonth ?? 1,
      months,
      monthOfYear,
      cron: row.cron ?? null,
      leadTimeMinutes: lead.minutes,
      leadTimeValue: lead.value,
      leadTimeUnit: lead.unit,
      reminderMinutes: row.reminderMinutes ?? null,
      overlapPolicy: (row.overlapPolicy as RecurringOverlapPolicy) ?? 'skip_if_open',
      lastGeneratedDueAt: row.lastGeneratedDueAt ?? null,
      enabled: !!row.enabled,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
    };
  }

  private async assertProjectExists(projectId: string | null | undefined) {
    if (!projectId) return;
    const found = await this.db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);
    if (!found[0]) {
      throw new Error(`Project not found: ${projectId}`);
    }
  }

  private async assertRecurringTemplateExists(templateId: string | null | undefined) {
    if (!templateId) return;
    const found = await this.db
      .select({ id: recurringTemplatesTable.id })
      .from(recurringTemplatesTable)
      .where(eq(recurringTemplatesTable.id, templateId))
      .limit(1);
    if (!found[0]) {
      throw new Error(`Recurring template not found: ${templateId}`);
    }
  }
}

let repo: TodoRepository | null = null;

/**
 * Returns the singleton todo repository, registering schema + change events on first access.
 * Use in any process that needs to read or mutate todos.
 */
export function getTodoRepository(): TodoRepository {
  if (repo) return repo;
  ensureTodoColumnsExist();
  ensureRecurringColumnsAndMigrate();
  const { api } = store.registerModule({
    name: MODULE,
    schema: () => todoTables as unknown as Record<string, SQLiteTableWithColumns<TableConfig>>,
    bootstrap: ({ db, emitChange }) => new TodoRepository(db, emitChange),
  });
  repo = (api as TodoRepository | undefined) ?? new TodoRepository(store.getDatabase(), () => undefined);
  repo.watchExternalChanges?.();
  return repo;
}

export {
  todosTable,
  todoCommentsTable,
  todoStepsTable,
  projectsTable,
  todoTables,
  type Todo,
  type TodoComment,
  type TodoStep,
  type TodoStepInput,
  type TodoStepUpdate,
  type TodoStatus,
  type TodoInput,
  type TodoUpdate,
  type TodoQuery,
  type Project,
  type ProjectInput,
  type ProjectUpdate,
  recurringTemplatesTable,
  recurringTemplateStepsTable,
  type RecurringTemplate,
  type RecurringTemplateInput,
  type RecurringTemplateUpdate,
  type RecurringTemplateStep,
  type RecurringTemplateStepInput,
  type RecurringTemplateStepUpdate,
  type RecurringFrequency,
  type RecurringLeadTimeUnit,
  type RecurringOverlapPolicy,
};
