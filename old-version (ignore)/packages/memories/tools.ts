import type { Memory, MemoryUpdate } from './index.js';
import { getMemoryRepository } from './index.js';
import { t } from '@stina/i18n';

import type { ToolDefinition } from '@stina/core';

const DEFAULT_MEMORY_LIMIT = 50;

/**
 * Maps a MemoryItem into the JSON-friendly payload returned to tools.
 * For list operations, only include id and title to keep responses compact.
 */
function toMemorySummary(item: Memory) {
  return {
    id: item.id,
    title: item.title,
    tags: item.tags ?? null,
    valid_until: item.validUntil ?? null,
    valid_until_iso: item.validUntil ? new Date(item.validUntil).toISOString() : null,
    created_at_iso: new Date(item.createdAt).toISOString(),
  };
}

/**
 * Maps a MemoryItem into the full JSON-friendly payload with details.
 */
function toMemoryDetails(item: Memory) {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    metadata: item.metadata ?? null,
    source: item.source ?? null,
    tags: item.tags ?? null,
    valid_until: item.validUntil ?? null,
    valid_until_iso: item.validUntil ? new Date(item.validUntil).toISOString() : null,
    created_at: item.createdAt,
    created_at_iso: new Date(item.createdAt).toISOString(),
    updated_at: item.updatedAt,
    updated_at_iso: new Date(item.updatedAt).toISOString(),
  };
}

/**
 * Helper to safely extract an unknown value into a Record, unwrapping common envelopes.
 */
function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return unwrapPayload(parsed);
    } catch {
      return {};
    }
    return {};
  }
  if (isRecord(value)) return unwrapPayload(value);
  return {};
}

/**
 * Helper to check if a value is a record object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapPayload(record: Record<string, unknown>): Record<string, unknown> {
  const unwrapKeys = ['message', 'payload', 'parameters', 'args', 'arguments'];
  for (const key of unwrapKeys) {
    const candidate = record[key];
    if (isRecord(candidate)) return candidate;
    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate);
        if (isRecord(parsed)) return parsed;
      } catch {
        /* ignore */
      }
    }
  }
  return record;
}

function parseTags(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const tags = value.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
    return tags.length ? tags : [];
  }
  if (typeof value === 'string') {
    const parsed = value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return parsed.length ? parsed : [];
  }
  return undefined;
}

function parseTimestamp(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value.trim());
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Converts errors to user-friendly strings.
 */
function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Implements the memory_get_all tool by reading all memories from the store.
 * Returns only id and title for compact responses.
 */
async function handleMemoryGetAll(args: unknown) {
  const payload = toRecord(args);
  const limitRaw = typeof payload.limit === 'number' ? Math.floor(payload.limit) : undefined;
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_MEMORY_LIMIT;
  const repo = getMemoryRepository();
  const memories = await repo.list(limit);
  return {
    ok: true,
    memories: memories.map((memory: Memory) => toMemorySummary(memory)),
  };
}

/**
 * Implements the memory_add tool by creating a new memory entry in the store.
 */
async function handleMemoryAdd(args: unknown) {
  const payload = toRecord(args);
  const title = typeof payload.title === 'string' ? payload.title : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!title.trim()) {
    return { ok: false, error: 'memory_add requires non-empty title' };
  }
  if (!content.trim()) {
    return { ok: false, error: 'memory_add requires non-empty content' };
  }
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const tags = parseTags(payload.tags);
  const validUntil = parseTimestamp(payload.valid_until);
  try {
    const repo = getMemoryRepository();
    const memory = await repo.insert({
      title,
      content,
      metadata: metadata ?? null,
      tags: tags ?? undefined,
      validUntil: validUntil === undefined ? undefined : validUntil,
    });
    console.log('[memory_add] inserted', memory.id);
    return { ok: true, memory: toMemoryDetails(memory) };
  } catch (err) {
    console.warn('[memory_add] failed', err);
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

  const repo = getMemoryRepository();
  let target: Memory | null = null;
  if (id) {
    // Update by ID
    const patch: MemoryUpdate = {};
    if (typeof payload.title === 'string') patch.title = payload.title;
    if (typeof payload.content === 'string') patch.content = payload.content;
    if (payload.metadata === null) patch.metadata = null;
    else if (isRecord(payload.metadata)) patch.metadata = payload.metadata;
    const tags = parseTags(payload.tags);
    if (tags !== undefined) patch.tags = tags;
    const validUntil = parseTimestamp(payload.valid_until);
    if (validUntil !== undefined) patch.validUntil = validUntil;

    target = await repo.update(id, patch);
  } else if (searchContent) {
    // Find by content and update
    const found = await repo.findByContent(searchContent);
    if (!found) {
      return { ok: false, error: `Memory not found: ${searchContent}` };
    }
    const patch: MemoryUpdate = {};
    if (typeof payload.title === 'string') patch.title = payload.title;
    if (typeof payload.content === 'string') patch.content = payload.content;
    if (payload.metadata === null) patch.metadata = null;
    else if (isRecord(payload.metadata)) patch.metadata = payload.metadata;
    const tags = parseTags(payload.tags);
    if (tags !== undefined) patch.tags = tags;
    const validUntil = parseTimestamp(payload.valid_until);
    if (validUntil !== undefined) patch.validUntil = validUntil;

    target = await repo.update(found.id, patch);
  }

  if (!target) {
    return { ok: false, error: 'memory_update requires { id } or { search_content }' };
  }

  return { ok: true, memory: toMemoryDetails(target) };
}

/**
 * Implements the memory_delete tool by removing a memory from the store.
 */
async function handleMemoryDelete(args: unknown) {
  const payload = toRecord(args);
  const id = typeof payload.id === 'string' ? payload.id : undefined;
  const searchContent =
    typeof payload.search_content === 'string' ? payload.search_content : undefined;

  const repo = getMemoryRepository();
  let deleted = false;
  if (id) {
    deleted = await repo.delete(id);
  } else if (searchContent) {
    const found = await repo.findByContent(searchContent);
    if (found) {
      deleted = await repo.delete(found.id);
    }
  }

  if (!deleted) {
    return { ok: false, error: 'Memory not found or could not be deleted' };
  }

  return { ok: true, message: 'Memory deleted successfully' };
}

/**
 * Implements the memory_get_details tool to retrieve full content of specific memories.
 */
async function handleMemoryGetDetails(args: unknown) {
  const payload = toRecord(args);
  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (ids.length === 0) {
    return { ok: false, error: 'memory_get_details requires at least one memory id' };
  }

  const allMemories = await getMemoryRepository().list();
  const requestedMemories = allMemories.filter((m) => ids.includes(m.id));

  if (requestedMemories.length === 0) {
    return { ok: false, error: 'No memories found with the provided ids' };
  }

  return {
    ok: true,
    memories: requestedMemories.map((memory) => toMemoryDetails(memory)),
  };
}

/**
 * Exported tool definitions for memories.
 */
export const memoryTools: ToolDefinition[] = [
  {
    spec: {
      name: 'memory_get_all',
      description:
        'Retrieves a list of all saved memory titles. Use this to see what information has been saved. To get the full content of specific memories, use memory_get_details.',
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
      name: 'memory_get_details',
      description:
        'Retrieves the full content of one or more memories by their IDs. Use this after memory_get_all to read the detailed information.',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of memory IDs to retrieve details for',
          },
        },
        required: ['ids'],
        additionalProperties: false,
      },
    },
    handler: handleMemoryGetDetails,
  },
  {
    spec: {
      name: 'memory_add',
      description:
        'Saves a new memory for future reference. Use this when you learn something important about the user or their preferences that should be remembered. Provide both a short title and detailed content. Do NOT use this for people (names, relations); use people_upsert instead. This is a great tool to remember important facts, how to quickly perform certain tasks, or other information that may be useful later. Use this as much as you need to make your work easier for future conversations. Be as descriptive as possible in the content, but short and on topic in the titles.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A short, descriptive title for the memory (e.g., "Dislikes Thursdays")',
          },
          content: {
            type: 'string',
            description:
              'The detailed information to remember (e.g., "User really dislikes Thursdays because it\'s the most stressful day and it usually rains. This is probably due to the user often being overwhelmed with work on that day. I should be extra kind to them on Thursdays."). Be as descriptive as possible. Do not be afraid to ask the user for more details if needed.',
          },
          valid_until: {
            type: 'number',
            description: t('chat.tool_valid_until_epoch_ms_description'),
          },
          tags: {
            type: 'array',
            description: 'Optional tags to categorize the memory (e.g., ["ephemeral", "day-note"]).',
            items: { type: 'string' },
          },
          metadata: {
            type: 'object',
            description: 'Optional additional structured data',
            additionalProperties: true,
          },
        },
        required: ['title', 'content'],
        additionalProperties: false,
      },
    },
    handler: handleMemoryAdd,
  },
  {
    spec: {
      name: 'memory_update',
      description:
        'Updates an existing memory by ID or by searching for content. Can update title, content, or metadata.',
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
          title: {
            type: 'string',
            description: 'New title for the memory',
          },
          content: {
            type: 'string',
            description: 'New content for the memory',
          },
          valid_until: {
            type: 'number',
            description: t('chat.tool_valid_until_epoch_ms_description'),
          },
          tags: {
            type: 'array',
            description: 'Optional tags to categorize the memory (e.g., ["ephemeral", "day-note"]).',
            items: { type: 'string' },
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
