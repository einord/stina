import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDb = path.join(os.tmpdir(), `stina-todos-test-${Date.now()}.db`);
let getTodoRepository: typeof import('../index.ts')['getTodoRepository'];

describe('todos smoke', () => {
  beforeEach(async () => {
    fs.rmSync(tmpDb, { force: true });
    process.env.STINA_DB_PATH = tmpDb;
    vi.resetModules();
    ({ getTodoRepository } = await import('../index.ts'));
  });

  it('creates and updates todos with comments', async () => {
    const repo = getTodoRepository();
    const todo = await repo.insert({ title: 'Test todo', description: 'desc' });
    expect(todo.title).toBe('Test todo');

    const updated = await repo.update(todo.id, { status: 'in_progress' });
    expect(updated?.status).toBe('in_progress');

    const comment = await repo.insertComment(todo.id, 'note');
    expect(comment.todoId).toBe(todo.id);

    const comments = await repo.listComments(todo.id);
    expect(comments.length).toBe(1);
  });
});
