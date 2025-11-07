import store, { TodoItem, TodoStatus } from '@stina/store';

import type { ToolDefinition } from './base.js';

const DEFAULT_TODO_LIMIT = 20;

function normalizeTodoStatus(value: any): TodoStatus | undefined {
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

function parseDueAt(input: any): number | null {
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

async function handleTodoList(args: any) {
  const status = normalizeTodoStatus(args?.status);
  const limitRaw = typeof args?.limit === 'number' ? Math.floor(args.limit) : undefined;
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_TODO_LIMIT;
  const todos = store.listTodos({ status, limit });
  return { ok: true, todos: todos.map(toTodoPayload) };
}

async function handleTodoAdd(args: any) {
  const title = typeof args?.title === 'string' ? args.title : '';
  const description = typeof args?.description === 'string' ? args.description : undefined;
  const dueAt = parseDueAt(args?.due_at ?? args?.dueAt);
  const metadata = typeof args?.metadata === 'object' && args?.metadata !== null ? args.metadata : undefined;
  try {
    const todo = await store.createTodo({
      title,
      description,
      dueAt,
      metadata: metadata ?? null,
    });
    return { ok: true, todo: toTodoPayload(todo) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function handleTodoUpdate(args: any) {
  const id = typeof args?.id === 'string' ? args.id.trim() : '';
  if (!id) {
    return { ok: false, error: 'todo_update requires { id }' };
  }
  const patch: any = {};
  if (typeof args?.title === 'string') patch.title = args.title;
  if (typeof args?.description === 'string') patch.description = args.description;
  const status = normalizeTodoStatus(args?.status);
  if (status) patch.status = status;
  const dueAt = parseDueAt(args?.due_at ?? args?.dueAt);
  if (dueAt !== null) patch.dueAt = dueAt;
  if (args?.due_at === null || args?.dueAt === null) patch.dueAt = null;
  if (args?.metadata === null) patch.metadata = null;
  else if (typeof args?.metadata === 'object') patch.metadata = args.metadata;

  try {
    const next = await store.updateTodo(id, patch);
    if (!next) {
      return { ok: false, error: `Todo not found: ${id}` };
    }
    return { ok: true, todo: toTodoPayload(next) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
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
