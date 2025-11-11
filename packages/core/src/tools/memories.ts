import type { MemoryItem, MemoryUpdate } from '@stina/store';
import {
  deleteMemoryById,
  findMemoryByContent,
  insertMemory,
  listMemories,
  updateMemoryById,
} from '@stina/store/memories';

import type { ToolDefinition } from './base.js';

const DEFAULT_MEMORY_LIMIT = 50;

/**
 * Maps a MemoryItem into the JSON-friendly payload returned to tools.
 */
function toMemoryPayload(item: MemoryItem) {
  return {
    id: item.id,
    content: item.content,
    metadata: item.metadata ?? null,
    source: item.source ?? null,
    created_at: item.createdAt,
    created_at_iso: new Date(item.createdAt).toISOString(),
    updated_at: item.updatedAt,
    updated_at_iso: new Date(item.updatedAt).toISOString(),
  };
}

/**
 * Helper to safely extract an unknown value into a Record.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Helper to check if a value is a record object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Converts errors to user-friendly strings.
 */
function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Implements the memory_get_all tool by reading all memories from the store.
 */
async function handleMemoryGetAll(args: unknown) {
  const payload = toRecord(args);
  const limitRaw = typeof payload.limit === 'number' ? Math.floor(payload.limit) : undefined;
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_MEMORY_LIMIT;
  const memories = listMemories(limit);
  return {
    ok: true,
    memories: memories.map((memory: MemoryItem) => toMemoryPayload(memory)),
  };
}

/**
 * Implements the memory_add tool by creating a new memory entry in the store.
 */
async function handleMemoryAdd(args: unknown) {
  const payload = toRecord(args);
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!content.trim()) {
    return { ok: false, error: 'memory_add requires non-empty content' };
  }
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  try {
    const memory = await insertMemory({
      content,
      metadata: metadata ?? null,
    });
    return { ok: true, memory: toMemoryPayload(memory) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Implements the memory_update tool by patching existing memory fields.
 */
async function handleMemoryUpdate(args: unknown) {
  const payload = toRecord(args);
  const id = typeof payload.id === 'string' ? payload.id : undefined;
  const searchContent =
    typeof payload.search_content === 'string' ? payload.search_content : undefined;

  let target: MemoryItem | null = null;
  if (id) {
    // Update by ID
    const patch: MemoryUpdate = {};
    if (typeof payload.content === 'string') patch.content = payload.content;
    if (payload.metadata === null) patch.metadata = null;
    else if (isRecord(payload.metadata)) patch.metadata = payload.metadata;

    target = updateMemoryById(id, patch);
  } else if (searchContent) {
    // Find by content and update
    const found = findMemoryByContent(searchContent);
    if (!found) {
      return { ok: false, error: `Memory not found: ${searchContent}` };
    }
    const patch: MemoryUpdate = {};
    if (typeof payload.content === 'string') patch.content = payload.content;
    if (payload.metadata === null) patch.metadata = null;
    else if (isRecord(payload.metadata)) patch.metadata = payload.metadata;

    target = updateMemoryById(found.id, patch);
  }

  if (!target) {
    return { ok: false, error: 'memory_update requires { id } or { search_content }' };
  }

  return { ok: true, memory: toMemoryPayload(target) };
}

/**
 * Implements the memory_delete tool by removing a memory from the store.
 */
async function handleMemoryDelete(args: unknown) {
  const payload = toRecord(args);
  const id = typeof payload.id === 'string' ? payload.id : undefined;
  const searchContent =
    typeof payload.search_content === 'string' ? payload.search_content : undefined;

  let deleted = false;
  if (id) {
    deleted = deleteMemoryById(id);
  } else if (searchContent) {
    const found = findMemoryByContent(searchContent);
    if (found) {
      deleted = deleteMemoryById(found.id);
    }
  }

  if (!deleted) {
    return { ok: false, error: 'Memory not found or could not be deleted' };
  }

  return { ok: true, message: 'Memory deleted successfully' };
}

/**
 * Exported tool definitions for memories.
 */
export const memoryTools: ToolDefinition[] = [
  {
    spec: {
      name: 'memory_get_all',
      description:
        'Retrieves all saved memories. Use this to recall information saved in previous conversations.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Maximum number of memories to return (default 50, max 200)',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleMemoryGetAll,
  },
  {
    spec: {
      name: 'memory_add',
      description:
        'Saves a new memory for future reference. Use this when you learn something important about the user or their preferences that should be remembered.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The information to remember',
          },
          metadata: {
            type: 'object',
            description: 'Optional additional structured data',
            additionalProperties: true,
          },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
    handler: handleMemoryAdd,
  },
  {
    spec: {
      name: 'memory_update',
      description: 'Updates an existing memory by ID or by searching for content',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the memory to update',
          },
          search_content: {
            type: 'string',
            description: 'Search for memory by content (used if id is not provided)',
          },
          content: {
            type: 'string',
            description: 'New content for the memory',
          },
          metadata: {
            type: 'object',
            description: 'Updated metadata',
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleMemoryUpdate,
  },
  {
    spec: {
      name: 'memory_delete',
      description: 'Deletes a memory by ID or by searching for content',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The ID of the memory to delete',
          },
          search_content: {
            type: 'string',
            description: 'Search for memory by content (used if id is not provided)',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleMemoryDelete,
  },
];
