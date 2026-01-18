import { modelConfigs } from './schema.js'
import type { ChatDb } from './schema.js'
import { eq, and } from 'drizzle-orm'

/**
 * Model configuration data type
 */
export interface ModelConfig {
  id: string
  name: string
  providerId: string
  providerExtensionId: string
  modelId: string
  isDefault: boolean
  settingsOverride?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /** User ID for multi-user support */
  userId?: string
}

/**
 * Input for creating a model config
 */
export type CreateModelConfigInput = Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Input for updating a model config
 */
export type UpdateModelConfigInput = Partial<CreateModelConfigInput>

/**
 * Database repository for model configurations.
 * Manages user-configured AI models from provider extensions.
 * @param db - The chat database instance.
 * @param userId - User ID for multi-user filtering (required).
 */
export class ModelConfigRepository {
  constructor(
    private db: ChatDb,
    private userId: string
  ) {}

  /**
   * Build a user filter condition.
   * Returns a filter for the current user's data.
   */
  private getUserFilter() {
    return eq(modelConfigs.userId, this.userId)
  }

  /**
   * List all model configurations.
   * Only returns configurations belonging to the current user.
   */
  async list(): Promise<ModelConfig[]> {
    const results = await this.db
      .select()
      .from(modelConfigs)
      .where(this.getUserFilter())

    return results.map((row) => ({
      id: row.id,
      name: row.name,
      providerId: row.providerId,
      providerExtensionId: row.providerExtensionId,
      modelId: row.modelId,
      isDefault: row.isDefault,
      settingsOverride: row.settingsOverride ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      userId: row.userId ?? undefined,
    }))
  }

  /**
   * Get a specific model configuration by ID.
   * Only returns if it belongs to the current user.
   */
  async get(id: string): Promise<ModelConfig | null> {
    const results = await this.db
      .select()
      .from(modelConfigs)
      .where(and(eq(modelConfigs.id, id), this.getUserFilter()))
      .limit(1)

    const row = results[0]
    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      providerId: row.providerId,
      providerExtensionId: row.providerExtensionId,
      modelId: row.modelId,
      isDefault: row.isDefault,
      settingsOverride: row.settingsOverride ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      userId: row.userId ?? undefined,
    }
  }

  /**
   * Get the default model configuration.
   * Only returns if it belongs to the current user.
   */
  async getDefault(): Promise<ModelConfig | null> {
    const results = await this.db
      .select()
      .from(modelConfigs)
      .where(and(eq(modelConfigs.isDefault, true), this.getUserFilter()))
      .limit(1)

    const row = results[0]
    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      providerId: row.providerId,
      providerExtensionId: row.providerExtensionId,
      modelId: row.modelId,
      isDefault: row.isDefault,
      settingsOverride: row.settingsOverride ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      userId: row.userId ?? undefined,
    }
  }

  /**
   * Create a new model configuration.
   * The configuration is stored with the repository's userId.
   */
  async create(id: string, input: CreateModelConfigInput): Promise<ModelConfig> {
    const now = new Date()

    // If this is set as default, clear other defaults first
    if (input.isDefault) {
      await this.clearDefaults()
    }

    await this.db.insert(modelConfigs).values({
      id,
      name: input.name,
      providerId: input.providerId,
      providerExtensionId: input.providerExtensionId,
      modelId: input.modelId,
      isDefault: input.isDefault,
      settingsOverride: input.settingsOverride ?? null,
      createdAt: now,
      updatedAt: now,
      userId: this.userId,
    })

    return {
      id,
      ...input,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      userId: this.userId,
    }
  }

  /**
   * Update a model configuration.
   * Only updates if the configuration belongs to the current user.
   */
  async update(id: string, input: UpdateModelConfigInput): Promise<ModelConfig | null> {
    const existing = await this.get(id)
    if (!existing) return null

    const now = new Date()

    // If setting as default, clear other defaults first
    if (input.isDefault) {
      await this.clearDefaults()
    }

    const updateData: Partial<typeof modelConfigs.$inferInsert> = {
      updatedAt: now,
    }

    if (input['name'] !== undefined) updateData['name'] = input['name']
    if (input['providerId'] !== undefined) updateData['providerId'] = input['providerId']
    if (input['providerExtensionId'] !== undefined)
      updateData['providerExtensionId'] = input['providerExtensionId']
    if (input['modelId'] !== undefined) updateData['modelId'] = input['modelId']
    if (input['isDefault'] !== undefined) updateData['isDefault'] = input['isDefault']
    if (input['settingsOverride'] !== undefined)
      updateData['settingsOverride'] = input['settingsOverride']

    await this.db
      .update(modelConfigs)
      .set(updateData)
      .where(and(eq(modelConfigs.id, id), this.getUserFilter()))

    return this.get(id)
  }

  /**
   * Delete a model configuration.
   * Only deletes if the configuration belongs to the current user.
   * @returns true if a row was deleted, false otherwise.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(modelConfigs)
      .where(and(eq(modelConfigs.id, id), this.getUserFilter()))
    return result.changes > 0
  }

  /**
   * Set a model as the default (clears other defaults).
   * Only sets as default if the configuration belongs to the current user.
   */
  async setDefault(id: string): Promise<boolean> {
    const existing = await this.get(id)
    if (!existing) return false

    await this.clearDefaults()

    await this.db
      .update(modelConfigs)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(modelConfigs.id, id), this.getUserFilter()))

    return true
  }

  /**
   * Clear all default flags.
   * Only clears defaults for the current user's configurations.
   */
  private async clearDefaults(): Promise<void> {
    await this.db
      .update(modelConfigs)
      .set({ isDefault: false })
      .where(and(eq(modelConfigs.isDefault, true), this.getUserFilter()))
  }
}
