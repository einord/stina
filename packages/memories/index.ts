import { desc, eq, lt, and, isNotNull } from 'drizzle-orm';
import crypto from 'node:crypto';

import store from '@stina/store';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

import { memoriesTable, memoryTables } from './schema.js';
import { Memory, MemoryInput, MemoryRow, MemoryUpdate, NewMemory } from './types.js';

const MODULE = 'memories';
const PURGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class MemoryRepository {
  constructor(private readonly db = store.getDatabase(), private readonly emitChange: (p: unknown) => void) {}

  onChange(listener: (payload: unknown) => void) {
    return store.onChange(MODULE, listener);
  }

  /** Reloads memories after an external change (e.g. another process). */
  watchExternalChanges() {
    return store.on('external-change', () => {
      this.emitChange({ kind: 'external' });
    });
  }

  async list(limit = 100): Promise<Memory[]> {
    const rows = await this.db
      .select()
      .from(memoriesTable)
      .orderBy(desc(memoriesTable.createdAt))
      .limit(limit);
    return rows.map((row) => this.mapRow(row));
  }

  async insert(input: MemoryInput): Promise<Memory> {
    const now = Date.now();
    const record: NewMemory = {
      id: crypto.randomUUID(),
      title: input.title,
      content: input.content,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      source: input.source ?? null,
      tags: input.tags?.length ? JSON.stringify(input.tags) : null,
      validUntil: input.validUntil ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(memoriesTable).values(record);
    this.emitChange({ kind: 'memory', id: record.id });
    return this.mapRow(record as MemoryRow);
  }

  async update(id: string, patch: MemoryUpdate): Promise<Memory | null> {
    const existing = await this.db.select().from(memoriesTable).where(eq(memoriesTable.id, id)).limit(1);
    if (!existing[0]) return null;
    const updates: Partial<NewMemory> = { updatedAt: Date.now() };
    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.content !== undefined) updates.content = patch.content;
    if (patch.metadata !== undefined) updates.metadata = patch.metadata ? JSON.stringify(patch.metadata) : null;
    if (patch.source !== undefined) updates.source = patch.source ?? null;
    if (patch.tags !== undefined) updates.tags = patch.tags?.length ? JSON.stringify(patch.tags) : null;
    if (patch.validUntil !== undefined) updates.validUntil = patch.validUntil ?? null;
    await this.db.update(memoriesTable).set(updates).where(eq(memoriesTable.id, id));
    const next = await this.db.select().from(memoriesTable).where(eq(memoriesTable.id, id)).limit(1);
    if (!next[0]) return null;
    this.emitChange({ kind: 'memory', id });
    return this.mapRow(next[0]);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.delete(memoriesTable).where(eq(memoriesTable.id, id));
    const changes =
      (res as { changes?: number; rowsAffected?: number }).changes ??
      (res as { rowsAffected?: number }).rowsAffected ??
      0;
    if (changes > 0) {
      this.emitChange({ kind: 'memory', id });
      return true;
    }
    return false;
  }

  async findByContent(content: string): Promise<Memory | null> {
    const rows = await this.db
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.content, content))
      .limit(1);
    const row = rows[0];
    return row ? this.mapRow(row as MemoryRow) : null;
  }

  private mapRow(row: MemoryRow): Memory {
    let metadata: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    }
    let tags: string[] | null = null;
    if (row.tags) {
      try {
        const parsed = JSON.parse(row.tags) as unknown;
        if (Array.isArray(parsed)) {
          tags = parsed.filter((t) => typeof t === 'string') as string[];
        }
      } catch {
        tags = null;
      }
    }
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      metadata,
      source: row.source ?? null,
      tags,
      validUntil: row.validUntil ?? null,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
    };
  }

  /** Removes expired memories that passed grace period to keep the table lean. */
  async purgeExpired(graceMs = PURGE_GRACE_MS) {
    const cutoff = Date.now() - graceMs;
    await this.db.delete(memoriesTable).where(
      and(isNotNull(memoriesTable.validUntil), lt(memoriesTable.validUntil, cutoff)),
    );
  }
}

let repo: MemoryRepository | null = null;

/**
 * Returns the singleton memories repository, registering schema + events on first use.
 * Call this from any process that reads/writes memories.
 */
export function getMemoryRepository(): MemoryRepository {
  if (repo) return repo;
  const { api } = store.registerModule({
    name: MODULE,
    schema: () => memoryTables as unknown as Record<string, SQLiteTableWithColumns<TableConfig>>,
    migrations: [
      {
        id: 'memories-add-tags-and-valid-until',
        run: async () => {
          const raw = store.getRawDatabase();
          const hasTags = raw
            .prepare("SELECT 1 FROM pragma_table_info('memories') WHERE name = 'tags' LIMIT 1")
            .get();
          if (!hasTags) {
            try {
              raw.exec('ALTER TABLE memories ADD COLUMN tags TEXT;');
            } catch (err) {
              console.warn('[memories] failed to add tags column (may already exist)', err);
            }
          }
          const hasValidUntil = raw
            .prepare("SELECT 1 FROM pragma_table_info('memories') WHERE name = 'valid_until' LIMIT 1")
            .get();
          if (!hasValidUntil) {
            try {
              raw.exec('ALTER TABLE memories ADD COLUMN valid_until INTEGER;');
            } catch (err) {
              console.warn('[memories] failed to add valid_until column (may already exist)', err);
            }
          }
        },
      },
    ],
    bootstrap: ({ db, emitChange }) => new MemoryRepository(db, emitChange),
  });
  repo = (api as MemoryRepository | undefined) ?? new MemoryRepository(store.getDatabase(), () => undefined);
  repo.watchExternalChanges?.();
  void repo.purgeExpired();
  return repo;
}

export { memoriesTable, memoryTables };
export type { Memory, MemoryInput, MemoryUpdate };
