import crypto from 'node:crypto';
import { asc, eq, like } from 'drizzle-orm';

import store from '@stina/store';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

import { peopleTable, peopleTables } from './schema.js';
import type { Person, PersonInput, PersonUpdate } from './types.js';

const MODULE = 'people';

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

class PeopleRepository {
  constructor(
    private readonly db = store.getDatabase(),
    private readonly emitChange: (payload: unknown) => void,
  ) {}

  onChange(listener: (payload: unknown) => void) {
    return store.onChange(MODULE, listener);
  }

  watchExternalChanges() {
    return store.on('external-change', () => {
      this.emitChange({ kind: 'external' });
    });
  }

  async list(params: { query?: string; limit?: number } = {}): Promise<Person[]> {
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 100;
    const query = params.query?.trim();
    // SQLite doesn't support ILIKE; we store normalizedName in lower-case for case-insensitive match.
    const where = query ? like(peopleTable.normalizedName, `%${normalizeName(query)}%`) : undefined;
    const rows = await this.db
      .select()
      .from(peopleTable)
      .where(where)
      .orderBy(asc(peopleTable.name))
      .limit(limit);
    return rows.map((row) => this.mapRow(row));
  }

  async findById(id: string): Promise<Person | null> {
    const rows = await this.db.select().from(peopleTable).where(eq(peopleTable.id, id)).limit(1);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findByName(name: string): Promise<Person | null> {
    const normalized = normalizeName(name);
    const rows = await this.db
      .select()
      .from(peopleTable)
      .where(eq(peopleTable.normalizedName, normalized))
      .limit(1);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async upsert(input: PersonInput): Promise<Person> {
    const normalized = normalizeName(input.name);
    const now = Date.now();
    const existing = await this.findByName(input.name);

    if (existing) {
      const updates: Partial<typeof peopleTable.$inferInsert> = {
        updatedAt: now,
      };
      if (input.name && input.name.trim() && existing.name !== input.name.trim()) {
        updates.name = input.name.trim();
        updates.normalizedName = normalized;
      }
      if (input.description !== undefined) {
        updates.description = input.description ?? null;
      }
      if (input.metadata !== undefined) {
        updates.metadata = input.metadata ? JSON.stringify(input.metadata) : null;
      }
      await this.db.update(peopleTable).set(updates).where(eq(peopleTable.id, existing.id));
      const next = await this.findById(existing.id);
      if (!next) throw new Error('Failed to load updated person');
      this.emitChange({ kind: 'person', id: existing.id });
      return next;
    }

    const record: typeof peopleTable.$inferInsert = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      normalizedName: normalized,
      description: input.description ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(peopleTable).values(record);
    this.emitChange({ kind: 'person', id: record.id });
    return this.mapRow(record);
  }

  async update(id: string, patch: PersonUpdate): Promise<Person | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updates: Partial<typeof peopleTable.$inferInsert> = { updatedAt: Date.now() };
    if (patch.name && patch.name.trim()) {
      updates.name = patch.name.trim();
      updates.normalizedName = normalizeName(patch.name);
    }
    if (patch.description !== undefined) {
      updates.description = patch.description ?? null;
    }
    if (patch.metadata !== undefined) {
      updates.metadata = patch.metadata ? JSON.stringify(patch.metadata) : null;
    }
    await this.db.update(peopleTable).set(updates).where(eq(peopleTable.id, id));
    const next = await this.findById(id);
    if (!next) return null;
    this.emitChange({ kind: 'person', id });
    return next;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.delete(peopleTable).where(eq(peopleTable.id, id));
    const changes =
      (res as { changes?: number; rowsAffected?: number }).changes ??
      (res as { rowsAffected?: number }).rowsAffected ??
      0;
    if (changes > 0) {
      this.emitChange({ kind: 'person', id });
      return true;
    }
    return false;
  }

  private mapRow(row: typeof peopleTable.$inferSelect): Person {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      metadata: parseMetadata(row.metadata ?? null),
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
    };
  }
}

let repo: PeopleRepository | null = null;

export function getPeopleRepository(): PeopleRepository {
  if (repo) return repo;
  const { api } = store.registerModule({
    name: MODULE,
    schema: () => peopleTables as unknown as Record<string, SQLiteTableWithColumns<TableConfig>>,
    bootstrap: ({ db, emitChange }) => new PeopleRepository(db, emitChange),
  });
  repo = (api as PeopleRepository | undefined) ?? new PeopleRepository(store.getDatabase(), () => undefined);
  repo.watchExternalChanges?.();
  return repo;
}

export { peopleTable, peopleTables };
export type { Person, PersonInput, PersonUpdate };
