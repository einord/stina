import { toolConfirmationOverrides } from './schema.js'
import type { ChatDb } from './schema.js'
import { eq, and } from 'drizzle-orm'

/**
 * Tool confirmation override data
 */
export interface ToolConfirmationOverride {
  extensionId: string
  toolId: string
  requiresConfirmation: boolean
  updatedAt: Date
}

/**
 * Database repository for tool confirmation overrides.
 * Manages per-user, per-tool confirmation behavior overrides.
 * @param db - The chat database instance.
 * @param userId - User ID for multi-user filtering (required).
 */
export class ToolConfirmationRepository {
  constructor(
    private db: ChatDb,
    private userId: string
  ) {}

  /**
   * Get all overrides for an extension.
   * @param extensionId - The extension ID.
   * @returns Array of tool confirmation overrides.
   */
  async getForExtension(extensionId: string): Promise<ToolConfirmationOverride[]> {
    const rows = await this.db
      .select()
      .from(toolConfirmationOverrides)
      .where(
        and(
          eq(toolConfirmationOverrides.userId, this.userId),
          eq(toolConfirmationOverrides.extensionId, extensionId)
        )
      )
    return rows.map((row) => ({
      extensionId: row.extensionId,
      toolId: row.toolId,
      requiresConfirmation: row.requiresConfirmation,
      updatedAt: row.updatedAt,
    }))
  }

  /**
   * Get override for a specific tool.
   * @param extensionId - The extension ID.
   * @param toolId - The tool ID.
   * @returns The override value, or null if no override exists.
   */
  async get(extensionId: string, toolId: string): Promise<boolean | null> {
    const rows = await this.db
      .select()
      .from(toolConfirmationOverrides)
      .where(
        and(
          eq(toolConfirmationOverrides.userId, this.userId),
          eq(toolConfirmationOverrides.extensionId, extensionId),
          eq(toolConfirmationOverrides.toolId, toolId)
        )
      )
    if (rows.length === 0) return null
    return rows[0]!.requiresConfirmation
  }

  /**
   * Set override for a specific tool.
   * Uses INSERT OR REPLACE for upsert behavior.
   * @param extensionId - The extension ID.
   * @param toolId - The tool ID.
   * @param requiresConfirmation - Whether confirmation is required.
   */
  async set(extensionId: string, toolId: string, requiresConfirmation: boolean): Promise<void> {
    await this.db
      .insert(toolConfirmationOverrides)
      .values({
        userId: this.userId,
        extensionId,
        toolId,
        requiresConfirmation,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          toolConfirmationOverrides.userId,
          toolConfirmationOverrides.extensionId,
          toolConfirmationOverrides.toolId,
        ],
        set: {
          requiresConfirmation,
          updatedAt: new Date(),
        },
      })
  }

  /**
   * Remove override for a specific tool (revert to manifest default).
   * @param extensionId - The extension ID.
   * @param toolId - The tool ID.
   */
  async remove(extensionId: string, toolId: string): Promise<void> {
    await this.db
      .delete(toolConfirmationOverrides)
      .where(
        and(
          eq(toolConfirmationOverrides.userId, this.userId),
          eq(toolConfirmationOverrides.extensionId, extensionId),
          eq(toolConfirmationOverrides.toolId, toolId)
        )
      )
  }

  /**
   * Reset all overrides for an extension (revert all tools to manifest defaults).
   * @param extensionId - The extension ID.
   */
  async resetForExtension(extensionId: string): Promise<void> {
    await this.db
      .delete(toolConfirmationOverrides)
      .where(
        and(
          eq(toolConfirmationOverrides.userId, this.userId),
          eq(toolConfirmationOverrides.extensionId, extensionId)
        )
      )
  }
}
