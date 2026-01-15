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
 * @param userId - Optional user ID for multi-user filtering. If not set, no user filtering is applied (backward compatible).
 */
export class QuickCommandRepository {
  constructor(
    private db: ChatDb,
    private userId?: string
  ) {}

  /**
   * Build a user filter condition.
   * If userId is set, filter by that user. Otherwise, no filter (backward compatible).
   */
  private getUserFilter() {
    if (this.userId === undefined) {
      return undefined
    }
    return eq(quickCommands.userId, this.userId)
  }

  /**
   * List all quick commands ordered by sortOrder.
   * If userId is set, only returns commands belonging to that user.
   */
  async list(): Promise<QuickCommand[]> {
    const userFilter = this.getUserFilter()
    const query = userFilter
      ? this.db.select().from(quickCommands).where(userFilter).orderBy(asc(quickCommands.sortOrder))
      : this.db.select().from(quickCommands).orderBy(asc(quickCommands.sortOrder))

    const results = await query

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
   * If userId is set, only returns if it belongs to that user.
   */
  async get(id: string): Promise<QuickCommand | null> {
    const userFilter = this.getUserFilter()
    const whereClause = userFilter
      ? and(eq(quickCommands.id, id), userFilter)
      : eq(quickCommands.id, id)

    const results = await this.db
      .select()
      .from(quickCommands)
      .where(whereClause)
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
   * If userId is set on the repository, it will be stored with the command.
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
      userId: this.userId ?? null,
    })

    return {
      id,
      ...input,
      userId: this.userId,
    }
  }

  /**
   * Update a quick command.
   * If userId is set, only updates if the command belongs to that user.
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

    const userFilter = this.getUserFilter()
    const whereClause = userFilter
      ? and(eq(quickCommands.id, id), userFilter)
      : eq(quickCommands.id, id)

    await this.db.update(quickCommands).set(updateData).where(whereClause)

    return this.get(id)
  }

  /**
   * Delete a quick command.
   * If userId is set, only deletes if the command belongs to that user.
   * @returns true if a row was deleted, false otherwise.
   */
  async delete(id: string): Promise<boolean> {
    const userFilter = this.getUserFilter()
    const whereClause = userFilter
      ? and(eq(quickCommands.id, id), userFilter)
      : eq(quickCommands.id, id)

    const result = await this.db.delete(quickCommands).where(whereClause)
    return result.changes > 0
  }

  /**
   * Reorder quick commands by providing an ordered list of IDs.
   * If userId is set, only reorders commands belonging to that user.
   */
  async reorder(ids: string[]): Promise<void> {
    const now = new Date()
    const userFilter = this.getUserFilter()

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      if (id) {
        const whereClause = userFilter
          ? and(eq(quickCommands.id, id), userFilter)
          : eq(quickCommands.id, id)

        await this.db
          .update(quickCommands)
          .set({ sortOrder: i, updatedAt: now })
          .where(whereClause)
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
