import type { FastifyPluginAsync } from 'fastify'
import type { HealthResponse } from '@stina/shared'

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>('/health', async () => {
    return { ok: true }
  })
}
