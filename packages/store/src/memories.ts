import { registerToolSchema, withDatabase } from './toolkit.js';
import type { MemoryInput, MemoryItem, MemoryUpdate } from './types/memory.js';

const MEMORY_SCHEMA_NAME = 'store.memories';
const MEMORY_SELECT_COLUMNS = 'id, content, metadata, source, created_at, updated_at';

type ChangeListener = () => void;
let onMemoriesChanged: ChangeListener | null = null;

/**
 * Allows the main store singleton to subscribe to mutations triggered through this module.
 * Needed so inserts/updates performed within the same process immediately refresh caches.
 */
export function setMemoryChangeListener(listener: ChangeListener | null) {
  onMemoriesChanged = listener;
}

function notifyMemoriesChanged() {
  onMemoriesChanged?.();
}

type MemoryRow = {
  id: string;
  content: string;
  metadata?: string | null;
  source?: string | null;
  created_at: number;
  updated_at: number;
};

registerToolSchema(MEMORY_SCHEMA_NAME, (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      metadata TEXT,
      source TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
  `);
});

/**
 * Normalizes a database row into the MemoryItem type.
 */
function normalizeMemoryRow(row: MemoryRow): MemoryItem {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      /* ignore parse errors */
    }
  }
  return {
    id: row.id,
    content: row.content,
    metadata,
    source: row.source ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Executes a SELECT query for all memories, ordered by creation date (newest first).
 */
export function listMemories(limit?: number): MemoryItem[] {
  return withDatabase((db) => {
    let sql = `SELECT ${MEMORY_SELECT_COLUMNS} FROM memories ORDER BY created_at DESC`;
    const params: Record<string, unknown> = {};
    if (limit && limit > 0) {
      sql += ' LIMIT @limit';
      params.limit = limit;
    }
    const rows = db.prepare(sql).all(params) as MemoryRow[];
    return rows.map((row) => normalizeMemoryRow(row));
  });
}

/**
 * Inserts a new memory into the database and returns the created item.
 */
export function insertMemory(input: MemoryInput): Promise<MemoryItem> {
  return Promise.resolve(
    withDatabase((db) => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
      db.prepare(
        `INSERT INTO memories (id, content, metadata, source, created_at, updated_at)
         VALUES (@id, @content, @metadata, @source, @createdAt, @updatedAt)`,
      ).run({
        id,
        content: input.content,
        metadata: metadataJson,
        source: input.source ?? null,
        createdAt: now,
        updatedAt: now,
      });
      notifyMemoriesChanged();
      const row = db.prepare(`SELECT ${MEMORY_SELECT_COLUMNS} FROM memories WHERE id = @id`).get({
        id,
      }) as MemoryRow;
      return normalizeMemoryRow(row);
    }),
  );
}

/**
 * Updates an existing memory by ID.
 */
export function updateMemoryById(id: string, patch: MemoryUpdate): MemoryItem | null {
  return withDatabase((db) => {
    const existing = db
      .prepare(`SELECT ${MEMORY_SELECT_COLUMNS} FROM memories WHERE id = @id`)
      .get({ id }) as MemoryRow | undefined;
    if (!existing) return null;

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id, updatedAt: Date.now() };

    if (patch.content !== undefined) {
      setClauses.push('content = @content');
      params.content = patch.content;
    }
    if (patch.metadata !== undefined) {
      setClauses.push('metadata = @metadata');
      params.metadata = patch.metadata ? JSON.stringify(patch.metadata) : null;
    }
    if (patch.source !== undefined) {
      setClauses.push('source = @source');
      params.source = patch.source;
    }

    setClauses.push('updated_at = @updatedAt');

    if (setClauses.length > 1) {
      const sql = `UPDATE memories SET ${setClauses.join(', ')} WHERE id = @id`;
      db.prepare(sql).run(params);
      notifyMemoriesChanged();
    }

    const updated = db
      .prepare(`SELECT ${MEMORY_SELECT_COLUMNS} FROM memories WHERE id = @id`)
      .get({ id }) as MemoryRow;
    return normalizeMemoryRow(updated);
  });
}

/**
 * Deletes a memory by ID.
 */
export function deleteMemoryById(id: string): boolean {
  return withDatabase((db) => {
    const result = db.prepare('DELETE FROM memories WHERE id = @id').run({ id });
    if (result.changes > 0) {
      notifyMemoriesChanged();
      return true;
    }
    return false;
  });
}

/**
 * Finds a memory by exact content match or partial match.
 */
export function findMemoryByContent(searchContent: string): MemoryItem | null {
  return withDatabase((db) => {
    // Try exact match first
    let row = db
      .prepare(`SELECT ${MEMORY_SELECT_COLUMNS} FROM memories WHERE content = @content LIMIT 1`)
      .get({ content: searchContent }) as MemoryRow | undefined;

    // If not found, try partial match
    if (!row) {
      row = db
        .prepare(
          `SELECT ${MEMORY_SELECT_COLUMNS} FROM memories WHERE content LIKE @pattern LIMIT 1`,
        )
        .get({ pattern: `%${searchContent}%` }) as MemoryRow | undefined;
    }

    return row ? normalizeMemoryRow(row) : null;
  });
}
