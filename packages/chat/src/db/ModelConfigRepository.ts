import { modelConfigs } from './schema.js'
import type { ChatDb } from './schema.js'
import { eq } from 'drizzle-orm'

/**
 * Model configuration data type
 */
export interface ModelConfig {
  id: string
  name: string
  providerId: string
  providerExtensionId: string
  modelId: string
  settingsOverride?: Record<string, unknown>
  createdAt: string
  updatedAt: string
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
 * Manages globally configured AI models from provider extensions.
 * Model configs are global (managed by admins); user's default model is stored in user_settings.
 * @param db - The chat database instance.
 */
export class ModelConfigRepository {
  constructor(private db: ChatDb) {}

  /**
   * List all model configurations.
   * Returns all globally available model configurations.
   */
  async list(): Promise<ModelConfig[]> {
    const results = await this.db.select().from(modelConfigs)

    return results.map((row) => ({
      id: row.id,
      name: row.name,
      providerId: row.providerId,
      providerExtensionId: row.providerExtensionId,
      modelId: row.modelId,
      settingsOverride: row.settingsOverride ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
  }

  /**
   * Get a specific model configuration by ID.
   */
  async get(id: string): Promise<ModelConfig | null> {
    const results = await this.db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, id))
      .limit(1)

    const row = results[0]
    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      providerId: row.providerId,
      providerExtensionId: row.providerExtensionId,
      modelId: row.modelId,
      settingsOverride: row.settingsOverride ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Create a new model configuration.
   */
  async create(id: string, input: CreateModelConfigInput): Promise<ModelConfig> {
    const now = new Date()

    await this.db.insert(modelConfigs).values({
      id,
      name: input.name,
      providerId: input.providerId,
      providerExtensionId: input.providerExtensionId,
      modelId: input.modelId,
      settingsOverride: input.settingsOverride ?? null,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      ...input,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
  }

  /**
   * Update a model configuration.
   */
  async update(id: string, input: UpdateModelConfigInput): Promise<ModelConfig | null> {
    const existing = await this.get(id)
    if (!existing) return null

    const now = new Date()

    const updateData: Partial<typeof modelConfigs.$inferInsert> = {
      updatedAt: now,
    }

    if (input['name'] !== undefined) updateData['name'] = input['name']
    if (input['providerId'] !== undefined) updateData['providerId'] = input['providerId']
    if (input['providerExtensionId'] !== undefined)
      updateData['providerExtensionId'] = input['providerExtensionId']
    if (input['modelId'] !== undefined) updateData['modelId'] = input['modelId']
    if (input['settingsOverride'] !== undefined)
      updateData['settingsOverride'] = input['settingsOverride']

    await this.db.update(modelConfigs).set(updateData).where(eq(modelConfigs.id, id))

    return this.get(id)
  }

  /**
   * Delete a model configuration.
   * @returns true if a row was deleted, false otherwise.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(modelConfigs).where(eq(modelConfigs.id, id))
    return result.changes > 0
  }
}
