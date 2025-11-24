import { desc, eq } from 'drizzle-orm';
import crypto from 'node:crypto';

import store from '@stina/store/index_new';

import { memoriesTable, memoryTables } from './schema.js';
import { Memory, MemoryInput, MemoryUpdate, NewMemory } from './types.js';

const MODULE = 'memories';

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
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(memoriesTable).values(record);
    this.emitChange({ kind: 'memory', id: record.id });
    return this.mapRow(record as any);
  }

  async update(id: string, patch: MemoryUpdate): Promise<Memory | null> {
    const existing = await this.db.select().from(memoriesTable).where(eq(memoriesTable.id, id)).limit(1);
    if (!existing[0]) return null;
    const updates: Partial<NewMemory> = { updatedAt: Date.now() };
    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.content !== undefined) updates.content = patch.content;
    if (patch.metadata !== undefined) updates.metadata = patch.metadata ? JSON.stringify(patch.metadata) : null;
    if (patch.source !== undefined) updates.source = patch.source ?? null;
    await this.db.update(memoriesTable).set(updates).where(eq(memoriesTable.id, id));
    const next = await this.db.select().from(memoriesTable).where(eq(memoriesTable.id, id)).limit(1);
    if (!next[0]) return null;
    this.emitChange({ kind: 'memory', id });
    return this.mapRow(next[0] as any);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.delete(memoriesTable).where(eq(memoriesTable.id, id));
    const changes = (res as { changes?: number }).changes ?? (res as any).rowsAffected ?? 0;
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
    return rows[0] ? this.mapRow(rows[0] as any) : null;
  }

  private mapRow(row: {
    id: string;
    title: string;
    content: string;
    metadata: string | null;
    source: string | null;
    createdAt: number;
    updatedAt: number;
  }): Memory {
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
      content: row.content,
      metadata,
      source: row.source ?? null,
      createdAt: Number(row.createdAt) || 0,
      updatedAt: Number(row.updatedAt) || 0,
    };
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
    schema: () => memoryTables,
    bootstrap: ({ db, emitChange }) => new MemoryRepository(db, emitChange),
  });
  repo = api ?? new MemoryRepository(store.getDatabase(), () => undefined);
  repo.watchExternalChanges?.();
  return repo;
}

export { memoriesTable, memoryTables };
export type { Memory, MemoryInput, MemoryUpdate };
