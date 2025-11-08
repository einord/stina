import store, { TodoItem, TodoStatus, type TodoUpdate } from '@stina/store';

import type { ToolDefinition } from './base.js';

const DEFAULT_TODO_LIMIT = 20;

function normalizeTodoStatus(value: unknown): TodoStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'open') return 'pending';
  if (normalized === 'completed' || normalized === 'done') return 'completed';
  return undefined;
}

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

async function handleTodoList(args: unknown) {
  const payload = toRecord(args);
  const status = normalizeTodoStatus(payload.status);
  const limitRaw = typeof payload.limit === 'number' ? Math.floor(payload.limit) : undefined;
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_TODO_LIMIT;
  const todos = store.listTodos({ status, limit });
  return { ok: true, todos: todos.map(toTodoPayload) };
}

async function handleTodoAdd(args: unknown) {
  const payload = toRecord(args);
  const title = typeof payload.title === 'string' ? payload.title : '';
  const description = typeof payload.description === 'string' ? payload.description : undefined;
  const dueAt = parseDueAt(payload.due_at ?? payload.dueAt);
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  try {
    const todo = await store.createTodo({
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
    const next = await store.updateTodo(id, patch);
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

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
