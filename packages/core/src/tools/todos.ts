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
  if (['in_progress', 'in-progress', 'ongoing', 'started'].includes(normalized))
    return 'in_progress';
  if (['completed', 'done', 'finished'].includes(normalized)) return 'completed';
  if (['cancelled', 'canceled', 'aborted'].includes(normalized)) return 'cancelled';
  return undefined;
}

/**
 * Maps a TodoItem into the JSON-friendly payload returned to tools.
 */
function toTodoPayload(
  item: TodoItem,
  comments?: ReturnType<typeof listCommentsByTodoIds>[string],
) {
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
      description: `**View the user's todo list stored in Stina.**

Returns todos with their status, description, due dates, and comments.

When to use:
- User asks "what's on my todo list?"
- User asks "show my tasks"
- Before updating a todo (to get its ID)
- To check if a todo already exists before creating it

Example:
User: "What do I need to do today?"
You: Call todo_list with no parameters (or status="not_started")`,
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description:
              "Filter by status. Options: 'not_started', 'in_progress', 'completed', 'cancelled'. Omit to see all todos.",
          },
          limit: {
            type: 'integer',
            description:
              'Maximum number of items to return. Default: 20, Maximum: 200. Use this to avoid overwhelming responses.',
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
      description: `**Create a new todo item for the user.**

Use this when the user asks you to remember a task or add something to their todo list.

When to use:
- User: "Add X to my todo list"
- User: "Remind me to do Y"
- User: "I need to remember to Z"

When NOT to use:
- If a similar todo already exists - use todo_update instead
- For general note-taking - todos are for actionable tasks

Always confirm after adding: "Added 'X' to your todo list."`,
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description:
              'Brief, actionable task description. Example: "Buy groceries" or "Call dentist"',
          },
          description: {
            type: 'string',
            description: 'Optional longer context, notes, or details about the task.',
          },
          status: {
            type: 'string',
            description:
              "Initial status. Usually 'not_started'. Options: 'not_started', 'in_progress', 'completed', 'cancelled'",
          },
          due_at: {
            type: 'string',
            description:
              'Optional due date in ISO 8601 format (e.g., "2025-11-15T14:00:00Z"). Only include if user specifies a deadline.',
          },
          metadata: {
            type: 'object',
            description:
              'Optional JSON metadata for advanced use cases. Usually omitted unless the user provides structured data.',
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
      description: `**Update an existing todo item.**

Use this to mark todos as complete, change their status, or modify details.

When to use:
- User: "Mark X as done"
- User: "Complete the Y task"
- User: "Change Z to in progress"
- User: "Update the title of X"

Workflow:
1. If you don't have the todo ID, call todo_list first to find it
2. Then call todo_update with the ID and fields to change

Always confirm: "Marked 'X' as completed." or "Updated 'X'."`,
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'Todo ID from a previous todo_list or todo_add response. Preferred over todo_title.',
          },
          todo_title: {
            type: 'string',
            description:
              'Alternative: match by title if ID is unknown. Case-insensitive partial match.',
          },
          title: {
            type: 'string',
            description: 'New title to replace the existing one.',
          },
          description: {
            type: 'string',
            description: 'New description to replace the existing one.',
          },
          status: {
            type: 'string',
            description:
              "Update status. Options: 'not_started', 'in_progress', 'completed', 'cancelled'",
          },
          due_at: {
            type: 'string',
            description: 'New due date in ISO 8601 format. Set to null to remove deadline.',
          },
          metadata: {
            type: 'object',
            description: 'Replace the metadata payload entirely.',
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
      description: `**Add a progress note or comment to a todo.**

Use this to track updates, notes, or progress on a specific task.

When to use:
- User provides an update: "Add note to X: made good progress"
- Tracking incremental work: "Log progress on Y"

When NOT to use:
- To mark complete - use todo_update with status="completed" instead
- For major changes - use todo_update to change the description

Workflow:
1. Get the todo_id from todo_list
2. Call todo_comment_add with the ID and comment text`,
      parameters: {
        type: 'object',
        properties: {
          todo_id: {
            type: 'string',
            description: 'ID of the todo to comment on (from todo_list or todo_add).',
          },
          content: {
            type: 'string',
            description: 'The comment or progress update to add. Keep it concise.',
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
