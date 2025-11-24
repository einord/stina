import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDb = path.join(os.tmpdir(), `stina-memories-test-${Date.now()}.db`);
let getMemoryRepository: typeof import('../index.ts')['getMemoryRepository'];

describe('memories smoke', () => {
  beforeEach(async () => {
    fs.rmSync(tmpDb, { force: true });
    process.env.STINA_DB_PATH = tmpDb;
    vi.resetModules();
    ({ getMemoryRepository } = await import('../index.ts'));
  });

  it('creates, updates, deletes memories', async () => {
    const repo = getMemoryRepository();
    const memory = await repo.insert({ title: 'title', content: 'body' });
    expect(memory.title).toBe('title');

    const updated = await repo.update(memory.id, { title: 'new title' });
    expect(updated?.title).toBe('new title');

    const found = await repo.findByContent?.('body');
    expect(found?.id).toBe(memory.id);

    const deleted = await repo.delete(memory.id);
    expect(deleted).toBe(true);
  });
});
