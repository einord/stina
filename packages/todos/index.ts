import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

import store from '@stina/store/index_new';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

import { todoTables, todosTable, todoCommentsTable } from './schema.js';
import {
  NewTodo,
  NewTodoComment,
  Todo,
  TodoComment,
  TodoInput,
  TodoQuery,
  TodoRow,
  TodoStatus,
  TodoUpdate,
} from './types.js';

const MODULE = 'todos';

function uid() {
  return Math.random().toString(36).slice(2, 10);
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
      .select({
        id: todosTable.id,
        title: todosTable.title,
        description: todosTable.description,
        status: todosTable.status,
        dueTs: todosTable.dueTs,
        metadata: todosTable.metadata,
        source: todosTable.source,
        createdAt: todosTable.createdAt,
        updatedAt: todosTable.updatedAt,
        comment_count: count(todoCommentsTable.id).as('comment_count'),
      })
      .from(todosTable)
      .leftJoin(todoCommentsTable, eq(todosTable.id, todoCommentsTable.todoId))
      .where(where)
      .groupBy(todosTable.id)
      .orderBy(
        asc(sql`CASE WHEN ${todosTable.dueTs} IS NULL THEN 1 ELSE 0 END`),
        asc(todosTable.dueTs),
        asc(todosTable.createdAt),
      )
      .limit(query?.limit ?? 100);
    return rows.map((row) =>
      this.mapRow(row as TodoRow & { comment_count?: number | null }),
    );
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
    const byId = await this.db
      .select()
      .from(todosTable)
      .where(eq(todosTable.id, trimmed))
      .limit(1);
    if (byId[0]) return this.mapRow({ ...(byId[0] as TodoRow), comment_count: 0 });
    const byTitle = await this.db
      .select()
      .from(todosTable)
      .where(eq(todosTable.title, trimmed))
      .orderBy(desc(todosTable.updatedAt))
      .limit(1);
    return byTitle[0] ? this.mapRow({ ...(byTitle[0] as TodoRow), comment_count: 0 }) : null;
  }

  async insert(input: TodoInput): Promise<Todo> {
    const now = Date.now();
    const title = input.title?.trim();
    if (!title) throw new Error('Todo title is required');
    const record: NewTodo = {
      id: `td_${uid()}`,
      title,
      description: input.description ?? null,
      status: input.status ?? 'not_started',
      dueTs: input.dueAt ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      source: input.source ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(todosTable).values(record);
    this.emitChange({ kind: 'todo', id: record.id });
    return this.mapRow({ ...record, comment_count: 0 } as TodoRow & { comment_count?: number | null });
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
    if (patch.metadata !== undefined) {
      updates.metadata = patch.metadata ? JSON.stringify(patch.metadata) : null;
    }
    if (patch.source !== undefined) updates.source = patch.source ?? null;
    await this.db.update(todosTable).set(updates).where(eq(todosTable.id, id));
    const next = await this.db.select().from(todosTable).where(eq(todosTable.id, id)).limit(1);
    if (!next[0]) return null;
    this.emitChange({ kind: 'todo', id });
    return this.mapRow({
      ...(next[0] as TodoRow),
      comment_count: (existing[0] as { commentCount?: number })?.commentCount ?? 0,
    });
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

  private mapRow(row: TodoRow & { comment_count?: number | null }): Todo {
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
      metadata,
      source: row.source ?? null,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
      commentCount: typeof row.comment_count === 'number' ? row.comment_count : undefined,
    };
  }
}

let repo: TodoRepository | null = null;

/**
 * Returns the singleton todo repository, registering schema + change events on first access.
 * Use in any process that needs to read or mutate todos.
 */
export function getTodoRepository(): TodoRepository {
  if (repo) return repo;
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
  todoTables,
  type Todo,
  type TodoComment,
  type TodoStatus,
  type TodoInput,
  type TodoUpdate,
  type TodoQuery,
};
