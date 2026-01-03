import type { FastifyPluginAsync } from 'fastify'
import { ModelConfigRepository } from '@stina/chat/db'
import type { ModelConfigDTO } from '@stina/shared'
import { getDatabase } from '../db.js'
import { randomUUID } from 'node:crypto'

/**
 * Settings routes for AI model configurations
 */
export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const repository = new ModelConfigRepository(db)

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
    const configs = await repository.list()
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
    const config = await repository.get(request.params.id)

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
    return repository.getDefault()
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
    const config = await repository.create(id, {
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
    const updated = await repository.update(request.params.id, request.body)

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
  }>('/settings/ai/models/:id', async (request, reply) => {
    const deleted = await repository.delete(request.params.id)
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
    const success = await repository.setDefault(request.params.id)

    if (!success) {
      return reply.status(404).send({ success: false })
    }

    return { success: true }
  })
}
