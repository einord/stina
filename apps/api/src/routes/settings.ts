import type { FastifyPluginAsync } from 'fastify'
import { ModelConfigRepository, AppSettingsRepository, QuickCommandRepository } from '@stina/chat/db'
import { updateAppSettingsStore } from '@stina/chat/db'
import type { ModelConfigDTO, AppSettingsDTO, QuickCommandDTO } from '@stina/shared'
import { getDatabase } from '@stina/adapters-node'
import { randomUUID } from 'node:crypto'

/**
 * Settings routes for AI model configurations and app settings
 */
export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const modelConfigRepo = new ModelConfigRepository(db)
  const appSettingsRepo = new AppSettingsRepository(db)
  const quickCommandRepo = new QuickCommandRepository(db)

  // ===========================================================================
  // Model Configurations
  // ===========================================================================

  /**
   * List all model configurations
   * GET /settings/ai/models
   */
  fastify.get<{
    Reply: ModelConfigDTO[]
  }>('/settings/ai/models', async () => {
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
  }>('/settings/ai/models/:id', async (request, reply) => {
    const config = await modelConfigRepo.get(request.params.id)

    if (!config) {
      return reply.status(404).send({ error: 'Model config not found' } as unknown as ModelConfigDTO)
    }

    return config
  })

  /**
   * Get the default model configuration
   * GET /settings/ai/models/default
   */
  fastify.get<{
    Reply: ModelConfigDTO | null
  }>('/settings/ai/models/default', async () => {
    return modelConfigRepo.getDefault()
  })

  /**
   * Create a new model configuration
   * POST /settings/ai/models
   */
  fastify.post<{
    Body: Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>
    Reply: ModelConfigDTO
  }>('/settings/ai/models', async (request, reply) => {
    const { name, providerId, providerExtensionId, modelId, isDefault, settingsOverride } = request.body

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
      isDefault: isDefault ?? false,
      settingsOverride,
    })

    return config
  })

  /**
   * Update a model configuration
   * PUT /settings/ai/models/:id
   */
  fastify.put<{
    Params: { id: string }
    Body: Partial<Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>>
    Reply: ModelConfigDTO
  }>('/settings/ai/models/:id', async (request, reply) => {
    const updated = await modelConfigRepo.update(request.params.id, request.body)

    if (!updated) {
      return reply.status(404).send({ error: 'Model config not found' } as unknown as ModelConfigDTO)
    }

    return updated
  })

  /**
   * Delete a model configuration
   * DELETE /settings/ai/models/:id
   */
  fastify.delete<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/settings/ai/models/:id', async (request, _reply) => {
    const deleted = await modelConfigRepo.delete(request.params.id)
    return { success: deleted }
  })

  /**
   * Set a model as the default
   * POST /settings/ai/models/:id/default
   */
  fastify.post<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/settings/ai/models/:id/default', async (request, reply) => {
    const success = await modelConfigRepo.setDefault(request.params.id)

    if (!success) {
      return reply.status(404).send({ success: false })
    }

    return { success: true }
  })

  // ===========================================================================
  // App Settings
  // ===========================================================================

  /**
   * Get all app settings
   * GET /settings/app
   */
  fastify.get<{
    Reply: AppSettingsDTO
  }>('/settings/app', async () => {
    return appSettingsRepo.get()
  })

  /**
   * Update app settings (partial update)
   * PUT /settings/app
   */
  fastify.put<{
    Body: Partial<AppSettingsDTO>
    Reply: AppSettingsDTO
  }>('/settings/app', async (request) => {
    const updated = await appSettingsRepo.update(request.body)
    updateAppSettingsStore(updated)
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
   * List all quick commands
   * GET /settings/quick-commands
   */
  fastify.get<{
    Reply: QuickCommandDTO[]
  }>('/settings/quick-commands', async () => {
    return quickCommandRepo.list()
  })

  /**
   * Get a specific quick command
   * GET /settings/quick-commands/:id
   */
  fastify.get<{
    Params: { id: string }
    Reply: QuickCommandDTO
  }>('/settings/quick-commands/:id', async (request, reply) => {
    const command = await quickCommandRepo.get(request.params.id)

    if (!command) {
      return reply.status(404).send({ error: 'Quick command not found' } as unknown as QuickCommandDTO)
    }

    return command
  })

  /**
   * Create a new quick command
   * POST /settings/quick-commands
   */
  fastify.post<{
    Body: Omit<QuickCommandDTO, 'id'>
    Reply: QuickCommandDTO
  }>('/settings/quick-commands', async (request, reply) => {
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
  }>('/settings/quick-commands/:id', async (request, reply) => {
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
  }>('/settings/quick-commands/:id', async (request) => {
    const deleted = await quickCommandRepo.delete(request.params.id)
    return { success: deleted }
  })

  /**
   * Reorder quick commands
   * PUT /settings/quick-commands/reorder
   */
  fastify.put<{
    Body: { ids: string[] }
    Reply: { success: boolean }
  }>('/settings/quick-commands/reorder', async (request) => {
    await quickCommandRepo.reorder(request.body.ids)
    return { success: true }
  })
}
