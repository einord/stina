import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDb = path.join(os.tmpdir(), `stina-state-test-${Date.now()}.db`);
let getStateRepository: typeof import('../src/index.js')['getStateRepository'];

describe('state smoke', () => {
  beforeEach(async () => {
    fs.rmSync(tmpDb, { force: true });
    process.env.STINA_DB_PATH = tmpDb;
    vi.resetModules();
    ({ getStateRepository } = await import('../src/index.js'));
  });

  it('sets and increments values', async () => {
    const repo = getStateRepository();
    await repo.set('foo', 'bar');
    expect(await repo.get('foo')).toBe('bar');

    const next = await repo.increment('count', 2);
    expect(next).toBe(2);
    const next2 = await repo.increment('count', 3);
    expect(next2).toBe(5);
  });
});
