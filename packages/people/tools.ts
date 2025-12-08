import type { ToolDefinition } from '@stina/core';

import { getPeopleRepository } from './index.js';

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      return {};
    }
    return {};
  }
  if (isRecord(value)) return value;
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

import type { Person } from './types.js';

function toPersonPayload(person: Person | null) {
  if (!person) return null;
  return {
    id: person.id,
    name: person.name,
    description: person.description,
    metadata: person.metadata,
    created_at: person.createdAt,
    created_at_iso: new Date(person.createdAt).toISOString(),
    updated_at: person.updatedAt,
    updated_at_iso: new Date(person.updatedAt).toISOString(),
  };
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function handlePeopleList(args: unknown) {
  const payload = toRecord(args);
  const query = typeof payload.query === 'string' ? payload.query.trim() : undefined;
  const limit = typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : undefined;
  try {
    const repo = getPeopleRepository();
    const people = await repo.list({ query, limit });
    return {
      ok: true,
      people: people.map((p) => toPersonPayload(p)),
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handlePeopleGet(args: unknown) {
  const payload = toRecord(args);
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!id && !name) return { ok: false, error: 'people_get requires id or name' };
  try {
    const repo = getPeopleRepository();
    const person = id ? await repo.findById(id) : await repo.findByName(name);
    if (!person) return { ok: false, error: 'Person not found' };
    return { ok: true, person: toPersonPayload(person) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

async function handlePeopleUpsert(args: unknown) {
  const payload = toRecord(args);
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) return { ok: false, error: 'people_upsert requires name' };
  const description =
    payload.description === undefined || payload.description === null
      ? null
      : typeof payload.description === 'string'
        ? payload.description.trim()
        : String(payload.description);
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  try {
    const repo = getPeopleRepository();
    const person = await repo.upsert({ name, description, metadata });
    return { ok: true, person: toPersonPayload(person) };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

export const peopleTools: ToolDefinition[] = [
  {
    spec: {
      name: 'people_list',
      description:
        'List known people in the registry. Use this whenever a person is mentioned to see if they are already known. Use the query parameter for partial name search before adding a new person.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional partial name to search for (case-insensitive).',
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of people to return (default 100, max 200).',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handlePeopleList,
  },
  {
    spec: {
      name: 'people_get',
      description:
        'Fetch details for a person by id or name. Use this right after matching a person mention so you reply with full context (role, relation, notes).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Person id.' },
          name: { type: 'string', description: 'Full name to match (case-insensitive).' },
        },
        additionalProperties: false,
      },
    },
    handler: handlePeopleGet,
  },
  {
    spec: {
      name: 'people_upsert',
      description:
        'Create or update a person. Always call this when you learn a new person or learn new details (e.g., last name, relation, role). Keep the description concise but useful for future replies.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Full name of the person (use what the user provided).',
          },
          description: {
            type: 'string',
            description:
              'Short description: relation to the user, role, and any key details that help future answers. Update this when new info appears.',
          },
          metadata: {
            type: 'object',
            description: 'Optional structured data to store alongside the person record.',
            additionalProperties: true,
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    handler: handlePeopleUpsert,
  },
];
