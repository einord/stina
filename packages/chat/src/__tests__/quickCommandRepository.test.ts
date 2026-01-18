import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { QuickCommandRepository } from '../db/QuickCommandRepository.js'
import { chatSchema } from '../db/schema.js'

/**
 * Creates an in-memory SQLite database with the quick commands schema for testing
 */
function createTestDb(): BetterSQLite3Database<typeof chatSchema> {
  const sqlite = new Database(':memory:')

  // Create tables
  sqlite.exec(`
    CREATE TABLE quick_commands (
      id TEXT PRIMARY KEY,
      icon TEXT NOT NULL,
      command TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      user_id TEXT NOT NULL
    );

    CREATE INDEX idx_quick_commands_sort ON quick_commands(sort_order);
    CREATE INDEX idx_quick_commands_user ON quick_commands(user_id);
  `)

  return drizzle(sqlite, { schema: chatSchema })
}

describe('QuickCommandRepository - User Isolation', () => {
  let db: BetterSQLite3Database<typeof chatSchema>
  const USER_A = 'user-a-id'
  const USER_B = 'user-b-id'

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    // DB is in-memory so it gets cleaned up automatically
  })

  it('should only return quick commands for the specified user', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)
    const repoB = new QuickCommandRepository(db, USER_B)

    // User A creates quick commands
    await repoA.create('cmd-a1', { icon: 'star', command: 'User A Command 1', sortOrder: 0 })
    await repoA.create('cmd-a2', { icon: 'heart', command: 'User A Command 2', sortOrder: 1 })

    // User B creates quick commands
    await repoB.create('cmd-b1', { icon: 'moon', command: 'User B Command 1', sortOrder: 0 })

    // User A should only see their own commands
    const userACommands = await repoA.list()
    expect(userACommands).toHaveLength(2)
    expect(userACommands.map((c) => c.id)).toContain('cmd-a1')
    expect(userACommands.map((c) => c.id)).toContain('cmd-a2')
    expect(userACommands.map((c) => c.id)).not.toContain('cmd-b1')

    // User B should only see their own commands
    const userBCommands = await repoB.list()
    expect(userBCommands).toHaveLength(1)
    expect(userBCommands[0]?.id).toBe('cmd-b1')
  })

  it('should not return other users quick commands', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)
    const repoB = new QuickCommandRepository(db, USER_B)

    // User A creates multiple commands
    await repoA.create('cmd-1', { icon: 'a', command: 'A1', sortOrder: 0 })
    await repoA.create('cmd-2', { icon: 'b', command: 'A2', sortOrder: 1 })
    await repoA.create('cmd-3', { icon: 'c', command: 'A3', sortOrder: 2 })

    // User B should see no commands
    const userBCommands = await repoB.list()
    expect(userBCommands).toHaveLength(0)
  })

  it('should create quick commands with correct userId', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)

    const created = await repoA.create('new-cmd', {
      icon: 'test',
      command: 'Test command',
      sortOrder: 0,
    })

    expect(created.userId).toBe(USER_A)

    // Verify via get
    const fetched = await repoA.get('new-cmd')
    expect(fetched?.userId).toBe(USER_A)
  })

  it('should not allow updating another users quick command', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)
    const repoB = new QuickCommandRepository(db, USER_B)

    // User A creates a command
    await repoA.create('cmd-update', {
      icon: 'original',
      command: 'Original Command',
      sortOrder: 0,
    })

    // User B tries to update User A's command
    const result = await repoB.update('cmd-update', {
      icon: 'hacked',
      command: 'Hacked Command',
    })

    // Update should return null (command not found for User B)
    expect(result).toBeNull()

    // Verify the command is unchanged
    const command = await repoA.get('cmd-update')
    expect(command?.icon).toBe('original')
    expect(command?.command).toBe('Original Command')
  })

  it('should not allow deleting another users quick command', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)
    const repoB = new QuickCommandRepository(db, USER_B)

    // User A creates a command
    await repoA.create('cmd-delete', {
      icon: 'keep',
      command: 'Do Not Delete',
      sortOrder: 0,
    })

    // User B tries to delete User A's command
    const deleted = await repoB.delete('cmd-delete')
    expect(deleted).toBe(false)

    // Verify the command still exists
    const command = await repoA.get('cmd-delete')
    expect(command).not.toBeNull()
    expect(command?.id).toBe('cmd-delete')
  })

  it('should not allow accessing another users quick command by ID', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)
    const repoB = new QuickCommandRepository(db, USER_B)

    // User A creates a command
    await repoA.create('private-cmd', {
      icon: 'private',
      command: 'Private Command',
      sortOrder: 0,
    })

    // User A can access their own command
    const accessedByA = await repoA.get('private-cmd')
    expect(accessedByA).not.toBeNull()
    expect(accessedByA?.id).toBe('private-cmd')

    // User B cannot access User A's command
    const accessedByB = await repoB.get('private-cmd')
    expect(accessedByB).toBeNull()
  })

  it('should isolate reorder operation by user', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)
    const repoB = new QuickCommandRepository(db, USER_B)

    // User A creates commands
    await repoA.create('cmd-a1', { icon: 'a', command: 'A1', sortOrder: 0 })
    await repoA.create('cmd-a2', { icon: 'b', command: 'A2', sortOrder: 1 })
    await repoA.create('cmd-a3', { icon: 'c', command: 'A3', sortOrder: 2 })

    // User B tries to reorder User A's commands (should have no effect)
    await repoB.reorder(['cmd-a3', 'cmd-a2', 'cmd-a1'])

    // Verify User A's commands are still in original order
    const commands = await repoA.list()
    expect(commands[0]?.id).toBe('cmd-a1')
    expect(commands[0]?.sortOrder).toBe(0)
    expect(commands[1]?.id).toBe('cmd-a2')
    expect(commands[1]?.sortOrder).toBe(1)
    expect(commands[2]?.id).toBe('cmd-a3')
    expect(commands[2]?.sortOrder).toBe(2)
  })

  it('should allow user to reorder their own commands', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)

    // User A creates commands
    await repoA.create('cmd-1', { icon: 'a', command: 'First', sortOrder: 0 })
    await repoA.create('cmd-2', { icon: 'b', command: 'Second', sortOrder: 1 })
    await repoA.create('cmd-3', { icon: 'c', command: 'Third', sortOrder: 2 })

    // User A reorders their commands
    await repoA.reorder(['cmd-3', 'cmd-1', 'cmd-2'])

    // Verify new order
    const commands = await repoA.list()
    expect(commands[0]?.id).toBe('cmd-3')
    expect(commands[0]?.sortOrder).toBe(0)
    expect(commands[1]?.id).toBe('cmd-1')
    expect(commands[1]?.sortOrder).toBe(1)
    expect(commands[2]?.id).toBe('cmd-2')
    expect(commands[2]?.sortOrder).toBe(2)
  })

  it('should isolate getNextSortOrder by user', async () => {
    const repoA = new QuickCommandRepository(db, USER_A)
    const repoB = new QuickCommandRepository(db, USER_B)

    // User A creates commands with sort orders 0, 1, 2
    await repoA.create('cmd-a1', { icon: 'a', command: 'A1', sortOrder: 0 })
    await repoA.create('cmd-a2', { icon: 'b', command: 'A2', sortOrder: 1 })
    await repoA.create('cmd-a3', { icon: 'c', command: 'A3', sortOrder: 2 })

    // User A's next sort order should be 3
    const nextA = await repoA.getNextSortOrder()
    expect(nextA).toBe(3)

    // User B has no commands, so next sort order should be 0
    const nextB = await repoB.getNextSortOrder()
    expect(nextB).toBe(0)
  })
})
