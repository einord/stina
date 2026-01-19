import type { FastifyPluginAsync } from 'fastify'
import { ModelConfigRepository, UserSettingsRepository, QuickCommandRepository } from '@stina/chat/db'
import type { ChatDb } from '@stina/chat/db'
import type { ModelConfigDTO, AppSettingsDTO, QuickCommandDTO } from '@stina/shared'
import { getDatabase } from '@stina/adapters-node'
import { randomUUID } from 'node:crypto'
import { requireAuth, requireAdmin } from '@stina/auth'
import { invalidateUserSessionManager } from './chatStream.js'

/**
 * Settings routes for AI model configurations and app settings
 */
export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // Cast to ChatDb since adapters-node DB is compatible but has different schema type
  const db = getDatabase() as unknown as ChatDb

  // Model configs are now global (no userId required)
  const modelConfigRepo = new ModelConfigRepository(db)

  /**
   * Helper to create a UserSettingsRepository scoped to the authenticated user.
   */
  const getUserSettingsRepository = (userId: string) => new UserSettingsRepository(db, userId)

  /**
   * Helper to create a QuickCommandRepository scoped to the authenticated user.
   */
  const getQuickCommandRepository = (userId: string) => new QuickCommandRepository(db, userId)

  // ===========================================================================
  // Model Configurations (Global - Admin manages, all users can read)
  // ===========================================================================

  /**
   * List all model configurations
   * GET /settings/ai/models
   */
  fastify.get<{
    Reply: ModelConfigDTO[]
  }>('/settings/ai/models', { preHandler: requireAuth }, async () => {
    const configs = await modelConfigRepo.list()
    return configs
  })

  /**
   * Get a specific model configuration
   * GET /settings/ai/models/:id
   */
  fastify.get<{
    Params: { id: string }
    Reply: ModelConfigDTO
  }>('/settings/ai/models/:id', { preHandler: requireAuth }, async (request, reply) => {
    const config = await modelConfigRepo.get(request.params.id)

    if (!config) {
      return reply.status(404).send({ error: 'Model config not found' } as unknown as ModelConfigDTO)
    }

    return config
  })

  /**
   * Create a new model configuration (admin only)
   * POST /settings/ai/models
   */
  fastify.post<{
    Body: Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>
    Reply: ModelConfigDTO
  }>('/settings/ai/models', { preHandler: requireAdmin }, async (request, reply) => {
    const { name, providerId, providerExtensionId, modelId, settingsOverride } = request.body

    if (!name || !providerId || !providerExtensionId || !modelId) {
      return reply.status(400).send({
        error: 'Missing required fields: name, providerId, providerExtensionId, modelId',
      } as unknown as ModelConfigDTO)
    }

    const id = randomUUID()
    const config = await modelConfigRepo.create(id, {
      name,
      providerId,
      providerExtensionId,
      modelId,
      settingsOverride,
    })

    return config
  })

  /**
   * Update a model configuration (admin only)
   * PUT /settings/ai/models/:id
   */
  fastify.put<{
    Params: { id: string }
    Body: Partial<Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>>
    Reply: ModelConfigDTO
  }>('/settings/ai/models/:id', { preHandler: requireAdmin }, async (request, reply) => {
    // Extract only the fields that can be updated (exclude isDefault which is now per-user)
    const { name, providerId, providerExtensionId, modelId, settingsOverride } = request.body
    const updated = await modelConfigRepo.update(request.params.id, {
      name,
      providerId,
      providerExtensionId,
      modelId,
      settingsOverride,
    })

    if (!updated) {
      return reply.status(404).send({ error: 'Model config not found' } as unknown as ModelConfigDTO)
    }

    return updated
  })

  /**
   * Delete a model configuration (admin only)
   * DELETE /settings/ai/models/:id
   */
  fastify.delete<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/settings/ai/models/:id', { preHandler: requireAdmin }, async (request) => {
    const deleted = await modelConfigRepo.delete(request.params.id)
    return { success: deleted }
  })

  // ===========================================================================
  // User's Default Model (Per-user setting)
  // ===========================================================================

  /**
   * Get the current user's default model configuration
   * GET /settings/user/default-model
   */
  fastify.get<{
    Reply: ModelConfigDTO | null
  }>('/settings/user/default-model', { preHandler: requireAuth }, async (request) => {
    const userSettingsRepo = getUserSettingsRepository(request.user!.id)
    const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()

    if (!defaultModelId) {
      return null
    }

    // Get the full model config
    const config = await modelConfigRepo.get(defaultModelId)
    return config
  })

  /**
   * Set the current user's default model configuration
   * PUT /settings/user/default-model
   */
  fastify.put<{
    Body: { modelConfigId: string | null }
    Reply: { success: boolean }
  }>('/settings/user/default-model', { preHandler: requireAuth }, async (request, reply) => {
    const { modelConfigId } = request.body
    const userSettingsRepo = getUserSettingsRepository(request.user!.id)

    // If setting a model, verify it exists
    if (modelConfigId !== null) {
      const config = await modelConfigRepo.get(modelConfigId)
      if (!config) {
        return reply.status(404).send({ success: false, error: 'Model config not found' } as unknown as { success: boolean })
      }
    }

    await userSettingsRepo.setDefaultModelConfigId(modelConfigId)
    return { success: true }
  })

  // ===========================================================================
  // App Settings (User-specific)
  // ===========================================================================

  /**
   * Get all app settings for the authenticated user
   * GET /settings/app
   */
  fastify.get<{
    Reply: AppSettingsDTO
  }>('/settings/app', { preHandler: requireAuth }, async (request) => {
    const userSettingsRepo = getUserSettingsRepository(request.user!.id)
    return userSettingsRepo.get()
  })

  /**
   * Update app settings for the authenticated user (partial update)
   * PUT /settings/app
   */
  fastify.put<{
    Body: Partial<AppSettingsDTO>
    Reply: AppSettingsDTO
  }>('/settings/app', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id
    const userSettingsRepo = getUserSettingsRepository(userId)
    const updated = await userSettingsRepo.update(request.body)

    // Invalidate the user's session manager so the next chat session uses updated settings
    await invalidateUserSessionManager(userId)

    return updated
  })

  /**
   * Get list of available timezones
   * GET /settings/timezones
   */
  fastify.get<{
    Reply: Array<{ id: string; label: string }>
  }>('/settings/timezones', async () => {
    // Get IANA timezones if supported
    try {
      const timezones = Intl.supportedValuesOf('timeZone')
      return timezones.map((tz) => ({
        id: tz,
        label: tz.replace(/_/g, ' '),
      }))
    } catch {
      // Fallback for older environments
      return [
        { id: 'UTC', label: 'UTC' },
        { id: 'Europe/Stockholm', label: 'Europe/Stockholm' },
        { id: 'Europe/London', label: 'Europe/London' },
        { id: 'America/New_York', label: 'America/New York' },
        { id: 'America/Los_Angeles', label: 'America/Los Angeles' },
        { id: 'Asia/Tokyo', label: 'Asia/Tokyo' },
      ]
    }
  })

  // ===========================================================================
  // Quick Commands
  // ===========================================================================

  /**
   * List all quick commands for the authenticated user
   * GET /settings/quick-commands
   */
  fastify.get<{
    Reply: QuickCommandDTO[]
  }>('/settings/quick-commands', { preHandler: requireAuth }, async (request) => {
    const quickCommandRepo = getQuickCommandRepository(request.user!.id)
    return quickCommandRepo.list()
  })

  /**
   * Get a specific quick command
   * GET /settings/quick-commands/:id
   */
  fastify.get<{
    Params: { id: string }
    Reply: QuickCommandDTO
  }>('/settings/quick-commands/:id', { preHandler: requireAuth }, async (request, reply) => {
    const quickCommandRepo = getQuickCommandRepository(request.user!.id)
    const command = await quickCommandRepo.get(request.params.id)

    if (!command) {
      return reply.status(404).send({ error: 'Quick command not found' } as unknown as QuickCommandDTO)
    }

    return command
  })

  /**
   * Create a new quick command for the authenticated user
   * POST /settings/quick-commands
   */
  fastify.post<{
    Body: Omit<QuickCommandDTO, 'id'>
    Reply: QuickCommandDTO
  }>('/settings/quick-commands', { preHandler: requireAuth }, async (request, reply) => {
    const quickCommandRepo = getQuickCommandRepository(request.user!.id)
    const { icon, command, sortOrder } = request.body

    if (!icon || !command) {
      return reply.status(400).send({
        error: 'Missing required fields: icon, command',
      } as unknown as QuickCommandDTO)
    }

    const id = randomUUID()
    const nextSortOrder = sortOrder ?? (await quickCommandRepo.getNextSortOrder())
    const result = await quickCommandRepo.create(id, {
      icon,
      command,
      sortOrder: nextSortOrder,
    })

    return result
  })

  /**
   * Update a quick command
   * PUT /settings/quick-commands/:id
   */
  fastify.put<{
    Params: { id: string }
    Body: Partial<Omit<QuickCommandDTO, 'id'>>
    Reply: QuickCommandDTO
  }>('/settings/quick-commands/:id', { preHandler: requireAuth }, async (request, reply) => {
    const quickCommandRepo = getQuickCommandRepository(request.user!.id)
    const updated = await quickCommandRepo.update(request.params.id, request.body)

    if (!updated) {
      return reply.status(404).send({ error: 'Quick command not found' } as unknown as QuickCommandDTO)
    }

    return updated
  })

  /**
   * Delete a quick command
   * DELETE /settings/quick-commands/:id
   */
  fastify.delete<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/settings/quick-commands/:id', { preHandler: requireAuth }, async (request) => {
    const quickCommandRepo = getQuickCommandRepository(request.user!.id)
    const deleted = await quickCommandRepo.delete(request.params.id)
    return { success: deleted }
  })

  /**
   * Reorder quick commands for the authenticated user
   * PUT /settings/quick-commands/reorder
   */
  fastify.put<{
    Body: { ids: string[] }
    Reply: { success: boolean }
  }>('/settings/quick-commands/reorder', { preHandler: requireAuth }, async (request) => {
    const quickCommandRepo = getQuickCommandRepository(request.user!.id)
    await quickCommandRepo.reorder(request.body.ids)
    return { success: true }
  })
}
