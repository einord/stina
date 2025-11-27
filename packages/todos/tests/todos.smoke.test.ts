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
    vi.resetModules?.();
    ({ getTodoRepository } = await import('../index.js'));
  });

  it('creates and updates todos with comments', async () => {
    const repo = getTodoRepository();
    const project = await repo.insertProject({ name: 'Test project', description: 'desc' });
    const todo = await repo.insert({
      title: 'Test todo',
      description: 'desc',
      projectId: project.id,
      dueAt: Date.now() + 60_000,
      isAllDay: false,
      reminderMinutes: 5,
    });
    expect(todo.title).toBe('Test todo');
    expect(todo.projectId).toBe(project.id);
    expect(todo.projectName).toBe(project.name);
    expect(todo.isAllDay).toBe(false);
    expect(todo.reminderMinutes).toBe(5);

    const updated = await repo.update(todo.id, { status: 'in_progress', isAllDay: true, reminderMinutes: null });
    expect(updated?.status).toBe('in_progress');
    expect(updated?.isAllDay).toBe(true);
    expect(updated?.reminderMinutes).toBeNull();

    const comment = await repo.insertComment(todo.id, 'note');
    expect(comment.todoId).toBe(todo.id);

    const comments = await repo.listComments(todo.id);
    expect(comments.length).toBe(1);

    const updatedProject = await repo.updateProject(project.id, { name: 'Renamed project' });
    expect(updatedProject?.name).toBe('Renamed project');

    const projectDeleted = await repo.deleteProject(project.id);
    expect(projectDeleted).toBe(true);
    const refreshed = await repo.findByIdentifier(todo.id);
    expect(refreshed?.projectId).toBeNull();
  });
});
