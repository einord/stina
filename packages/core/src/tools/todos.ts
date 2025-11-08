import type { TodoInput, TodoItem, TodoStatus, TodoUpdate } from '@stina/store';
import { registerToolSchema, withDatabase } from '@stina/store/toolkit';

import type { ToolDefinition } from './base.js';

const DEFAULT_TODO_LIMIT = 20;
const TODO_SCHEMA_NAME = 'tool.todos';

type TodoRow = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  due_ts?: number | null;
  metadata?: string | null;
  source?: string | null;
  created_at: number;
  updated_at: number;
};

registerToolSchema(TODO_SCHEMA_NAME, (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      due_ts INTEGER,
      metadata TEXT,
      source TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
    CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_ts);
  `);
});

/**
 * Converts user-provided status strings into the internal TodoStatus enum.
 */
function normalizeTodoStatus(value: unknown): TodoStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'open') return 'pending';
  if (normalized === 'completed' || normalized === 'done') return 'completed';
  return undefined;
}

/**
 * Maps a TodoItem into the JSON-friendly payload returned to tools.
 */
function toTodoPayload(item: TodoItem) {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    status: item.status,
    due_at: item.dueAt ?? null,
    due_at_iso: typeof item.dueAt === 'number' ? new Date(item.dueAt).toISOString() : null,
    metadata: item.metadata ?? null,
    source: item.source ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

/**
 * Parses optional due date inputs (timestamp or ISO string) into a unix epoch.
 */
function parseDueAt(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Implements the todo_list tool by reading todos from the store with optional filters.
 */
async function handleTodoList(args: unknown) {
  const payload = toRecord(args);
  const status = normalizeTodoStatus(payload.status);
  const limitRaw = typeof payload.limit === 'number' ? Math.floor(payload.limit) : undefined;
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_TODO_LIMIT;
  const todos = listTodosFromDb({ status, limit });
  return { ok: true, todos: todos.map(toTodoPayload) };
}

/**
 * Implements the todo_add tool by creating a new entry in the store.
 */
async function handleTodoAdd(args: unknown) {
  const payload = toRecord(args);
  const title = typeof payload.title === 'string' ? payload.title : '';
  const description = typeof payload.description === 'string' ? payload.description : undefined;
  const dueAt = parseDueAt(payload.due_at ?? payload.dueAt);
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  try {
    const todo = await insertTodo({
      title,
      description,
      dueAt,
      metadata: metadata ?? null,
    });
    return { ok: true, todo: toTodoPayload(todo) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Implements the todo_update tool by patching existing todo fields.
 */
async function handleTodoUpdate(args: unknown) {
  const payload = toRecord(args);
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!id) {
    return { ok: false, error: 'todo_update requires { id }' };
  }
  const patch: TodoUpdate = {};
  if (typeof payload.title === 'string') patch.title = payload.title;
  if (typeof payload.description === 'string') patch.description = payload.description;
  const status = normalizeTodoStatus(payload.status);
  if (status) patch.status = status;
  const dueAt = parseDueAt(payload.due_at ?? payload.dueAt);
  if (dueAt !== null) patch.dueAt = dueAt;
  if (payload.due_at === null || payload.dueAt === null) patch.dueAt = null;
  if (payload.metadata === null) patch.metadata = null;
  else if (isRecord(payload.metadata)) patch.metadata = payload.metadata;

  try {
    const next = await updateTodoById(id, patch);
    if (!next) {
      return { ok: false, error: `Todo not found: ${id}` };
    }
    return { ok: true, todo: toTodoPayload(next) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export const todoTools: ToolDefinition[] = [
  {
    spec: {
      name: 'todo_list',
      description: 'List todo items that are stored locally inside Stina.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: "Optional status filter. Use 'pending' or 'completed'.",
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of items to return (defaults to 20).',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleTodoList,
  },
  {
    spec: {
      name: 'todo_add',
      description: 'Create a new todo item that the assistant should remember.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short description of the task.',
          },
          description: {
            type: 'string',
            description: 'Optional longer context or notes.',
          },
          due_at: {
            type: 'string',
            description: 'Optional due date/time (ISO 8601).',
          },
          metadata: {
            type: 'object',
            description: 'Optional JSON metadata for the tool.',
            additionalProperties: true,
          },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
    handler: handleTodoAdd,
  },
  {
    spec: {
      name: 'todo_update',
      description: 'Update or complete an existing todo item.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Todo identifier returned from todo_list/todo_add.',
          },
          title: {
            type: 'string',
            description: 'New title.',
          },
          description: {
            type: 'string',
            description: 'New description.',
          },
          status: {
            type: 'string',
            description: "Set to 'pending' or 'completed'.",
          },
          due_at: {
            type: 'string',
            description: 'New due date/time (ISO 8601).',
          },
          metadata: {
            type: 'object',
            description: 'Replace metadata payload.',
            additionalProperties: true,
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    handler: handleTodoUpdate,
  },
];

/**
 * Coerces arbitrary input into a plain record for easier property access.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Type guard verifying that a value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalizes unknown errors so tool responses get a user-friendly string.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Executes a SELECT query for todos with optional status/limit filters.
 */
function listTodosFromDb(filter?: { status?: TodoStatus; limit?: number }): TodoItem[] {
  return withDatabase((db) => {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter?.status) {
      clauses.push('status = @status');
      params.status = filter.status;
    }
    let sql =
      'SELECT id, title, description, status, due_ts, metadata, source, created_at, updated_at FROM todos';
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    sql += ' ORDER BY CASE WHEN due_ts IS NULL THEN 1 ELSE 0 END, due_ts ASC, created_at ASC';
    if (filter?.limit) {
      sql += ' LIMIT @limit';
      params.limit = filter.limit;
    }
    const rows = db.prepare(sql).all(params) as TodoRow[];
    return rows.map(normalizeTodoRow);
  });
}

/**
 * Inserts a new todo row and returns the normalized entity.
 */
async function insertTodo(input: TodoInput & { status?: TodoStatus }): Promise<TodoItem> {
  const now = Date.now();
  const title = input.title?.trim();
  if (!title) {
    throw new Error('Todo title is required');
  }
  const item: TodoItem = {
    id: generateId(),
    title,
    description: input.description?.trim() || undefined,
    status: input.status ?? 'pending',
    dueAt: typeof input.dueAt === 'number' ? input.dueAt : null,
    metadata: input.metadata ?? null,
    source: input.source ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return withDatabase((db) => {
    db.prepare(
      `INSERT INTO todos (id, title, description, status, due_ts, metadata, source, created_at, updated_at)
       VALUES (@id, @title, @description, @status, @due_ts, @metadata, @source, @created_at, @updated_at)`,
    ).run({
      id: item.id,
      title: item.title,
      description: item.description ?? null,
      status: item.status,
      due_ts: item.dueAt ?? null,
      metadata: serializeMetadata(item.metadata ?? null),
      source: item.source ?? null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    });
    return item;
  });
}

/**
 * Updates an existing todo and returns the updated entity or null when missing.
 */
async function updateTodoById(id: string, patch: TodoUpdate): Promise<TodoItem | null> {
  return withDatabase((db) => {
    const existing = db
      .prepare(
        'SELECT id, title, description, status, due_ts, metadata, source, created_at, updated_at FROM todos WHERE id = ?',
      )
      .get(id) as TodoRow | undefined;
    if (!existing) return null;
    const current = normalizeTodoRow(existing);
    const next: TodoItem = {
      ...current,
      ...patch,
      title: patch.title?.trim() ?? current.title,
      description: patch.description?.trim() ?? current.description,
      dueAt: patch.dueAt === undefined ? current.dueAt : patch.dueAt,
      metadata: patch.metadata === undefined ? current.metadata : patch.metadata,
      source: patch.source === undefined ? current.source : patch.source,
      status: patch.status ?? current.status,
      updatedAt: Date.now(),
    };
    db.prepare(
      `UPDATE todos
       SET title=@title,
           description=@description,
           status=@status,
           due_ts=@due_ts,
           metadata=@metadata,
           source=@source,
           updated_at=@updated_at
       WHERE id=@id`,
    ).run({
      id: next.id,
      title: next.title,
      description: next.description ?? null,
      status: next.status,
      due_ts: next.dueAt ?? null,
      metadata: serializeMetadata(next.metadata ?? null),
      source: next.source ?? null,
      updated_at: next.updatedAt,
    });
    return next;
  });
}

/**
 * Maps raw database rows into TodoItem objects consumed by tools.
 */
function normalizeTodoRow(row: TodoRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status === 'completed' ? 'completed' : 'pending',
    dueAt: row.due_ts == null ? null : Number(row.due_ts),
    metadata: deserializeMetadata(row.metadata ?? null),
    source: row.source ?? null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

/**
 * Serializes metadata records to JSON, tolerating invalid values by returning null.
 */
function serializeMetadata(meta?: Record<string, unknown> | null) {
  if (!meta) return null;
  try {
    return JSON.stringify(meta);
  } catch {
    return null;
  }
}

/**
 * Parses metadata JSON strings back into objects.
 */
function deserializeMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Generates a short random id for todo entries.
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}
