import { quickCommands } from './schema.js'
import type { ChatDb } from './schema.js'
import { eq, asc, and } from 'drizzle-orm'

/**
 * Quick command data type
 */
export interface QuickCommand {
  id: string
  icon: string
  command: string
  sortOrder: number
  /** User ID for multi-user support */
  userId?: string
}

/**
 * Input for creating a quick command
 */
export type CreateQuickCommandInput = Omit<QuickCommand, 'id'>

/**
 * Input for updating a quick command
 */
export type UpdateQuickCommandInput = Partial<CreateQuickCommandInput>

/**
 * Database repository for quick commands.
 * Manages user-defined shortcuts for common AI prompts.
 * @param db - The chat database instance.
 * @param userId - User ID for multi-user filtering (required).
 */
export class QuickCommandRepository {
  constructor(
    private db: ChatDb,
    private userId: string
  ) {}

  /**
   * Build a user filter condition.
   * Returns a filter for the current user's data.
   */
  private getUserFilter() {
    return eq(quickCommands.userId, this.userId)
  }

  /**
   * List all quick commands ordered by sortOrder.
   * Only returns commands belonging to the current user.
   */
  async list(): Promise<QuickCommand[]> {
    const results = await this.db
      .select()
      .from(quickCommands)
      .where(this.getUserFilter())
      .orderBy(asc(quickCommands.sortOrder))

    return results.map((row) => ({
      id: row.id,
      icon: row.icon,
      command: row.command,
      sortOrder: row.sortOrder,
      userId: row.userId ?? undefined,
    }))
  }

  /**
   * Get a specific quick command by ID.
   * Only returns if it belongs to the current user.
   */
  async get(id: string): Promise<QuickCommand | null> {
    const results = await this.db
      .select()
      .from(quickCommands)
      .where(and(eq(quickCommands.id, id), this.getUserFilter()))
      .limit(1)

    const row = results[0]
    if (!row) return null

    return {
      id: row.id,
      icon: row.icon,
      command: row.command,
      sortOrder: row.sortOrder,
      userId: row.userId ?? undefined,
    }
  }

  /**
   * Create a new quick command.
   * The command is stored with the repository's userId.
   */
  async create(id: string, input: CreateQuickCommandInput): Promise<QuickCommand> {
    const now = new Date()

    await this.db.insert(quickCommands).values({
      id,
      icon: input.icon,
      command: input.command,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now,
      userId: this.userId,
    })

    return {
      id,
      ...input,
      userId: this.userId,
    }
  }

  /**
   * Update a quick command.
   * Only updates if the command belongs to the current user.
   */
  async update(id: string, input: UpdateQuickCommandInput): Promise<QuickCommand | null> {
    const existing = await this.get(id)
    if (!existing) return null

    const now = new Date()

    const updateData: Partial<typeof quickCommands.$inferInsert> = {
      updatedAt: now,
    }

    if (input.icon !== undefined) updateData['icon'] = input.icon
    if (input.command !== undefined) updateData['command'] = input.command
    if (input.sortOrder !== undefined) updateData['sortOrder'] = input.sortOrder

    await this.db
      .update(quickCommands)
      .set(updateData)
      .where(and(eq(quickCommands.id, id), this.getUserFilter()))

    return this.get(id)
  }

  /**
   * Delete a quick command.
   * Only deletes if the command belongs to the current user.
   * @returns true if a row was deleted, false otherwise.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(quickCommands)
      .where(and(eq(quickCommands.id, id), this.getUserFilter()))
    return result.changes > 0
  }

  /**
   * Reorder quick commands by providing an ordered list of IDs.
   * Only reorders commands belonging to the current user.
   */
  async reorder(ids: string[]): Promise<void> {
    const now = new Date()

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      if (id) {
        await this.db
          .update(quickCommands)
          .set({ sortOrder: i, updatedAt: now })
          .where(and(eq(quickCommands.id, id), this.getUserFilter()))
      }
    }
  }

  /**
   * Get the next available sort order
   */
  async getNextSortOrder(): Promise<number> {
    const results = await this.list()
    if (results.length === 0) return 0
    return Math.max(...results.map((r) => r.sortOrder)) + 1
  }
}
