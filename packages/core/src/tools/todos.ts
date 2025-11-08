import type { TodoItem, TodoStatus, TodoUpdate } from '@stina/store';
import {
  findTodoByIdentifier,
  insertTodo,
  insertTodoComment,
  listCommentsByTodoIds,
  listTodos,
  updateTodoById,
} from '@stina/store/todos';

import type { ToolDefinition } from './base.js';

const DEFAULT_TODO_LIMIT = 20;

/**
 * Converts user-provided status strings into the internal TodoStatus enum.
 */
function normalizeTodoStatus(value: unknown): TodoStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (['pending', 'not_started', 'not-started'].includes(normalized)) return 'not_started';
  if (['in_progress', 'in-progress', 'ongoing', 'started'].includes(normalized)) return 'in_progress';
  if (['completed', 'done', 'finished'].includes(normalized)) return 'completed';
  if (['cancelled', 'canceled', 'aborted'].includes(normalized)) return 'cancelled';
  return undefined;
}

/**
 * Maps a TodoItem into the JSON-friendly payload returned to tools.
 */
function toTodoPayload(item: TodoItem, comments?: ReturnType<typeof listCommentsByTodoIds>[string]) {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    status: item.status,
    status_label: formatStatusLabel(item.status),
    due_at: item.dueAt ?? null,
    due_at_iso: typeof item.dueAt === 'number' ? new Date(item.dueAt).toISOString() : null,
    metadata: item.metadata ?? null,
    source: item.source ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    comment_count: item.commentCount ?? 0,
    comments: (comments ?? []).map((comment) => ({
      id: comment.id,
      todo_id: comment.todoId,
      content: comment.content,
      created_at: comment.createdAt,
      created_at_iso: new Date(comment.createdAt).toISOString(),
    })),
  };
}

function formatStatusLabel(status: TodoStatus) {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Not started';
  }
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
  const todos = listTodos({ status, limit });
  const commentMap = listCommentsByTodoIds(todos.map((todo) => todo.id));
  return {
    ok: true,
    todos: todos.map((todo) => toTodoPayload(todo, commentMap[todo.id])),
  };
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
  const status = normalizeTodoStatus(payload.status) ?? 'not_started';
  try {
    const todo = await insertTodo({
      title,
      description,
      dueAt,
      metadata: metadata ?? null,
      status,
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
  const identifier = extractTodoIdentifier(payload);
  if (!identifier) {
    return { ok: false, error: 'todo_update requires { id } or { todo_title }' };
  }
  const target = findTodoByIdentifier(identifier);
  if (!target) {
    return { ok: false, error: `Todo not found: ${identifier}` };
  }
  const id = target.id;
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

async function handleTodoCommentAdd(args: unknown) {
  const payload = toRecord(args);
  const todoId = typeof payload.todo_id === 'string' ? payload.todo_id.trim() : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!todoId || !content.trim()) {
    return { ok: false, error: 'todo_comment_add requires { todo_id, content }' };
  }
  const todo = findTodoByIdentifier(todoId);
  if (!todo) {
    return { ok: false, error: `Todo not found: ${todoId}` };
  }
  try {
    const comment = await insertTodoComment(todo.id, content);
    return {
      ok: true,
      comment: {
        id: comment.id,
        todo_id: comment.todoId,
        content: comment.content,
        created_at: comment.createdAt,
        created_at_iso: new Date(comment.createdAt).toISOString(),
      },
    };
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
            description:
              "Optional status filter. Use 'not_started', 'in_progress', 'completed', or 'cancelled'.",
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
          status: {
            type: 'string',
            description: "Initial status. Use 'not_started', 'in_progress', 'completed', or 'cancelled'.",
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
          todo_title: {
            type: 'string',
            description: 'Optional title to match when id is unknown (case-insensitive).',
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
            description:
              "Set to 'not_started', 'in_progress', 'completed', or 'cancelled'.",
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
        required: [],
        additionalProperties: false,
      },
    },
    handler: handleTodoUpdate,
  },
  {
    spec: {
      name: 'todo_comment_add',
      description: 'Attach a progress update comment to an existing todo.',
      parameters: {
        type: 'object',
        properties: {
          todo_id: {
            type: 'string',
            description: 'Todo identifier returned from todo_list/todo_add.',
          },
          content: {
            type: 'string',
            description: 'Short update or note to append as a comment.',
          },
        },
        required: ['todo_id', 'content'],
        additionalProperties: false,
      },
    },
    handler: handleTodoCommentAdd,
  },
];

/**
 * Coerces arbitrary input into a plain record for easier property access.
 */
function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = parseJsonRecord(value);
    if (parsed) return unwrapPayload(parsed);
    return {};
  }
  if (isRecord(value)) {
    return unwrapPayload(value);
  }
  return {};
}

function unwrapPayload(record: Record<string, unknown>): Record<string, unknown> {
  const unwrapKeys = ['message', 'payload', 'parameters', 'args', 'arguments'];
  for (const key of unwrapKeys) {
    const candidate = record[key];
    if (isRecord(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = parseJsonRecord(candidate);
      if (parsed) return parsed;
    }
  }
  return record;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
function extractTodoIdentifier(payload: Record<string, unknown>): string {
  const candidates = ['id', 'todo_id', 'todoId', 'todo_title', 'title', 'name', 'label'];
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}
