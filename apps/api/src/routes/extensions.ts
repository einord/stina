import type { FastifyPluginAsync } from 'fastify'
import { extensionRegistry } from '@stina/core'
import type { ExtensionSummary } from '@stina/shared'

export const extensionRoutes: FastifyPluginAsync = async (fastify) => {
  // List all extensions
  fastify.get<{ Reply: ExtensionSummary[] }>('/extensions', async () => {
    const extensions = extensionRegistry.list()
    return extensions.map((e) => ({
      id: e.id,
      name: e.name,
      version: e.version,
      type: e.type,
    }))
  })
}
