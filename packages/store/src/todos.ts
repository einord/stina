import type { TodoInput, TodoItem, TodoStatus, TodoUpdate } from './types/todo.js';
import { registerToolSchema, withDatabase } from './toolkit.js';

const TODO_SCHEMA_NAME = 'store.todos';

type ChangeListener = () => void;
let onTodosChanged: ChangeListener | null = null;

/**
 * Allows the main store singleton to subscribe to mutations triggered through this module.
 * Needed so inserts/updates performed within the same process immediately refresh caches.
 */
export function setTodoChangeListener(listener: ChangeListener | null) {
  onTodosChanged = listener;
}

function notifyTodosChanged() {
  onTodosChanged?.();
}

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

export type TodoQuery = {
  status?: TodoStatus;
  limit?: number;
};

/**
 * Executes a SELECT query for todos with optional status/limit filters.
 */
export function listTodos(filter?: TodoQuery): TodoItem[] {
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
    if (filter?.limit && filter.limit > 0) {
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
export async function insertTodo(
  input: TodoInput & { status?: TodoStatus },
): Promise<TodoItem> {
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
  const result = withDatabase((db) => {
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
  notifyTodosChanged();
  return result;
}

/**
 * Updates an existing todo and returns the updated entity or null when missing.
 */
export async function updateTodoById(
  id: string,
  patch: TodoUpdate,
): Promise<TodoItem | null> {
  const next = withDatabase((db) => {
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
  if (next) notifyTodosChanged();
  return next;
}

/**
 * Maps raw database rows into TodoItem objects consumed by tools and renderer.
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
