import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

import store from '@stina/store/index_new';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

import {
  todoTables,
  todosTable,
  todoCommentsTable,
  projectsTable,
  recurringTemplatesTable,
} from './schema.js';
import {
  NewTodo,
  NewTodoComment,
  NewProject,
  NewRecurringTemplate,
  RecurringFrequency,
  RecurringOverlapPolicy,
  RecurringTemplate,
  RecurringTemplateInput,
  RecurringTemplateRow,
  RecurringTemplateUpdate,
  Todo,
  TodoComment,
  TodoInput,
  TodoQuery,
  TodoRow,
  TodoStatus,
  TodoUpdate,
  Project,
  ProjectInput,
  ProjectRow,
  ProjectUpdate,
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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clampMaxAdvanceCount(value: number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.min(num, 10);
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

  async list(query?: TodoQuery): Promise<Todo[]> {
    const filters = [];
    if (query?.status) {
      filters.push(eq(todosTable.status, query.status));
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
    return rows.map((row) => this.mapRow(row as TodoRow & { comment_count?: number | null; projectName?: string | null }));
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
    return rows.map((row) => this.mapRecurringRow(row as RecurringTemplateRow));
  }

  async findRecurringTemplateById(id: string): Promise<RecurringTemplate | null> {
    if (!id) return null;
    const rows = await this.db
      .select()
      .from(recurringTemplatesTable)
      .where(eq(recurringTemplatesTable.id, id))
      .limit(1);
    return rows[0] ? this.mapRecurringRow(rows[0] as RecurringTemplateRow) : null;
  }

  async insertRecurringTemplate(input: RecurringTemplateInput): Promise<RecurringTemplate> {
    const now = Date.now();
    const record: NewRecurringTemplate = {
      id: `rt_${uid()}`,
      title: input.title?.trim() || '',
      description: input.description?.trim() || null,
      projectId: input.projectId?.trim() || null,
      isAllDay: !!input.isAllDay,
      timeOfDay: input.timeOfDay?.trim() || null,
      timezone: input.timezone?.trim() || null,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      cron: input.cron?.trim() || null,
      leadTimeMinutes: input.leadTimeMinutes ?? 0,
      overlapPolicy: input.overlapPolicy ?? 'skip_if_open',
      maxAdvanceCount: clampMaxAdvanceCount(input.maxAdvanceCount),
      lastGeneratedDueAt: null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    if (!record.title) throw new Error('Recurring template title is required');
    await this.assertProjectExists(record.projectId);
    await this.db.insert(recurringTemplatesTable).values(record);
    this.emitChange({ kind: 'recurring_template', id: record.id });
    return this.mapRecurringRow(record as RecurringTemplateRow);
  }

  async updateRecurringTemplate(
    id: string,
    patch: RecurringTemplateUpdate,
  ): Promise<RecurringTemplate | null> {
    const existing = await this.db.select().from(recurringTemplatesTable).where(eq(recurringTemplatesTable.id, id)).limit(1);
    if (!existing[0]) return null;
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
    if (patch.frequency !== undefined) updates.frequency = patch.frequency;
    if (patch.dayOfWeek !== undefined) updates.dayOfWeek = patch.dayOfWeek ?? null;
    if (patch.dayOfMonth !== undefined) updates.dayOfMonth = patch.dayOfMonth ?? null;
    if (patch.cron !== undefined) updates.cron = patch.cron?.trim() || null;
    if (patch.leadTimeMinutes !== undefined) updates.leadTimeMinutes = patch.leadTimeMinutes ?? 0;
    if (patch.overlapPolicy !== undefined) updates.overlapPolicy = patch.overlapPolicy;
    if (patch.maxAdvanceCount !== undefined) updates.maxAdvanceCount = clampMaxAdvanceCount(patch.maxAdvanceCount);
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
    return refreshed[0] ? this.mapRecurringRow(refreshed[0] as RecurringTemplateRow) : null;
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
    return rows.map((row) => this.mapRow(row as TodoRow & { comment_count?: number | null; projectName?: string | null }));
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

    return byTitle[0]
      ? this.mapRow(byTitle[0] as TodoRow & { comment_count?: number | null; projectName?: string | null })
      : null;
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
    return this.mapRow(rows[0] as TodoRow & { comment_count?: number | null; projectName?: string | null });
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
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      projectId: row.projectId ?? null,
      isAllDay: !!row.isAllDay,
      timeOfDay: row.timeOfDay ?? null,
      timezone: row.timezone ?? null,
      frequency: row.frequency as RecurringFrequency,
      dayOfWeek: row.dayOfWeek ?? null,
      dayOfMonth: row.dayOfMonth ?? null,
      cron: row.cron ?? null,
      leadTimeMinutes: row.leadTimeMinutes ?? 0,
      overlapPolicy: (row.overlapPolicy as RecurringOverlapPolicy) ?? 'skip_if_open',
      maxAdvanceCount: row.maxAdvanceCount ?? 1,
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
  projectsTable,
  todoTables,
  type Todo,
  type TodoComment,
  type TodoStatus,
  type TodoInput,
  type TodoUpdate,
  type TodoQuery,
  type Project,
  type ProjectInput,
  type ProjectUpdate,
  recurringTemplatesTable,
  type RecurringTemplate,
  type RecurringTemplateInput,
  type RecurringTemplateUpdate,
  type RecurringFrequency,
  type RecurringOverlapPolicy,
};
