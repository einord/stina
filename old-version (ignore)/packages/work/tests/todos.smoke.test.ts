import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDb = path.join(os.tmpdir(), `stina-todos-test-${Date.now()}.db`);
let getTodoRepository: typeof import('../index.js')['getTodoRepository'];

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

    // Test comment deletion
    const deleted = await repo.deleteComment(comment.id);
    expect(deleted).toBe(true);
    
    const commentsAfterDelete = await repo.listComments(todo.id);
    expect(commentsAfterDelete.length).toBe(0);
    
    // Deleting again returns false
    const deletedAgain = await repo.deleteComment(comment.id);
    expect(deletedAgain).toBe(false);

    const updatedProject = await repo.updateProject(project.id, { name: 'Renamed project' });
    expect(updatedProject?.name).toBe('Renamed project');

    const projectDeleted = await repo.deleteProject(project.id);
    expect(projectDeleted).toBe(true);
    const refreshed = await repo.findByIdentifier(todo.id);
    expect(refreshed?.projectId).toBeNull();
  });

  it('lists active todos by default and allows opting into archived ones', async () => {
    const repo = getTodoRepository();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayTs = todayStart.getTime() - 60_000;
    const morningTs = todayStart.getTime() + 8 * 60 * 60 * 1000;
    const noonTs = todayStart.getTime() + 12 * 60 * 60 * 1000;
    let nowMock = yesterdayTs;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMock);

    nowMock = yesterdayTs;
    await repo.insert({ title: 'Completed yesterday', status: 'completed' });
    await repo.insert({ title: 'Cancelled yesterday', status: 'cancelled' });

    nowMock = morningTs;
    await repo.insert({ title: 'Open todo' });
    await repo.insert({ title: 'Completed today', status: 'completed' });
    await repo.insert({ title: 'Cancelled today', status: 'cancelled' });

    nowMock = noonTs;
    const defaultList = await repo.list();
    const defaultTitles = defaultList.map((t) => t.title).sort();
    expect(defaultTitles).toEqual(['Cancelled today', 'Completed today', 'Open todo'].sort());
    expect(defaultTitles).not.toContain('Completed yesterday');
    expect(defaultTitles).not.toContain('Cancelled yesterday');

    const archivedList = await repo.list({ includeArchived: true });
    const archivedTitles = archivedList.map((t) => t.title);
    expect(archivedTitles).toContain('Completed yesterday');
    expect(archivedTitles).toContain('Cancelled yesterday');

    nowSpy.mockRestore();
  });
});
