import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

let getPeopleRepository: typeof import('../index.js')['getPeopleRepository'];
let peopleTools: typeof import('../tools.js')['peopleTools'];
let toolHandlers: Record<string, (args: unknown) => Promise<unknown>>;

const tmpDb = path.join(os.tmpdir(), `stina-people-${Date.now()}.db`);

describe('people registry', () => {
  beforeEach(async () => {
    fs.rmSync(tmpDb, { force: true });
    process.env.STINA_DB_PATH = tmpDb;
    vi.resetModules?.();
    ({ getPeopleRepository } = await import('../index.js'));
    ({ peopleTools } = await import('../tools.js'));
    toolHandlers = Object.fromEntries(peopleTools.map((t) => [t.spec.name, t.handler]));
  });

  it('upserts and retrieves by name', async () => {
    const repo = getPeopleRepository();
    const created = await repo.upsert({ name: 'Anna Andersson', description: 'Kollega på HR' });
    expect(created.id).toBeTruthy();
    expect(created.description).toContain('Kollega');

    const found = await repo.findByName('anna andersson');
    expect(found?.id).toBe(created.id);
    expect(found?.description).toBe('Kollega på HR');

    const listed = await repo.list({ query: 'anna' });
    expect(listed.map((p) => p.id)).toContain(created.id);
  });

  it('updates individual fields', async () => {
    const repo = getPeopleRepository();
    const created = await repo.upsert({ name: 'Carl Test', description: 'Initial description' });
    
    // Update only description
    const updated = await repo.update(created.id, { description: 'Updated description' });
    expect(updated?.name).toBe('Carl Test');
    expect(updated?.description).toBe('Updated description');
    
    // Update only name
    const renamed = await repo.update(created.id, { name: 'Carl Updated' });
    expect(renamed?.name).toBe('Carl Updated');
    expect(renamed?.description).toBe('Updated description');
    
    // Non-existent ID returns null
    const notFound = await repo.update('nonexistent', { name: 'Test' });
    expect(notFound).toBeNull();
  });

  it('deletes person by id', async () => {
    const repo = getPeopleRepository();
    const created = await repo.upsert({ name: 'Diana Delete', description: 'To be deleted' });
    
    const deleted = await repo.delete(created.id);
    expect(deleted).toBe(true);
    
    const notFound = await repo.findById(created.id);
    expect(notFound).toBeNull();
    
    // Deleting again returns false
    const deletedAgain = await repo.delete(created.id);
    expect(deletedAgain).toBe(false);
  });

  it('tools can list, get, and upsert', async () => {
    const upsert = toolHandlers['people_upsert'];
    const list = toolHandlers['people_list'];
    const get = toolHandlers['people_get'];
    const created = await upsert({ name: 'Bo Test', description: 'Granne' });
    expect((created as { ok: boolean }).ok).toBe(true);

    const listed = await list({ query: 'bo' });
    expect((listed as { ok: boolean }).ok).toBe(true);
    const people = (listed as { people?: { name: string }[] }).people ?? [];
    expect(people.some((p) => p.name === 'Bo Test')).toBe(true);

    const fetched = await get({ name: 'Bo Test' });
    expect((fetched as { ok: boolean }).ok).toBe(true);
    expect((fetched as { person?: { description?: string } }).person?.description).toBe('Granne');
  });
});
