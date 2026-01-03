import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { quickCommands } from './schema.js'
import { eq, asc } from 'drizzle-orm'

/**
 * Quick command data type
 */
export interface QuickCommand {
  id: string
  icon: string
  command: string
  sortOrder: number
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
 */
export class QuickCommandRepository {
  constructor(private db: BetterSQLite3Database<any>) {}

  /**
   * List all quick commands ordered by sortOrder
   */
  async list(): Promise<QuickCommand[]> {
    const results = await this.db.select().from(quickCommands).orderBy(asc(quickCommands.sortOrder))

    return results.map((row) => ({
      id: row.id,
      icon: row.icon,
      command: row.command,
      sortOrder: row.sortOrder,
    }))
  }

  /**
   * Get a specific quick command by ID
   */
  async get(id: string): Promise<QuickCommand | null> {
    const results = await this.db
      .select()
      .from(quickCommands)
      .where(eq(quickCommands.id, id))
      .limit(1)

    const row = results[0]
    if (!row) return null

    return {
      id: row.id,
      icon: row.icon,
      command: row.command,
      sortOrder: row.sortOrder,
    }
  }

  /**
   * Create a new quick command
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
    })

    return {
      id,
      ...input,
    }
  }

  /**
   * Update a quick command
   */
  async update(id: string, input: UpdateQuickCommandInput): Promise<QuickCommand | null> {
    const existing = await this.get(id)
    if (!existing) return null

    const now = new Date()

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    }

    if (input.icon !== undefined) updateData['icon'] = input.icon
    if (input.command !== undefined) updateData['command'] = input.command
    if (input.sortOrder !== undefined) updateData['sortOrder'] = input.sortOrder

    await this.db
      .update(quickCommands)
      .set(updateData as any)
      .where(eq(quickCommands.id, id))

    return this.get(id)
  }

  /**
   * Delete a quick command
   * @returns true if a row was deleted, false otherwise
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(quickCommands).where(eq(quickCommands.id, id))
    return result.changes > 0
  }

  /**
   * Reorder quick commands by providing an ordered list of IDs
   */
  async reorder(ids: string[]): Promise<void> {
    const now = new Date()

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      if (id) {
        await this.db
          .update(quickCommands)
          .set({ sortOrder: i, updatedAt: now })
          .where(eq(quickCommands.id, id))
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
