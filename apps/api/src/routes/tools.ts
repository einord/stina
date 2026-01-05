import type { FastifyPluginAsync } from 'fastify'
import type { ToolResult } from '@stina/extension-api'
import { getToolSettingsViews } from '@stina/adapters-node'
import { getExtensionHost } from '../setup.js'

export const toolsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get tool settings views for enabled extensions
   */
  fastify.get('/tools/settings', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    return getToolSettingsViews(extensionHost)
  })

  /**
   * Execute a tool via extension host
   */
  fastify.post<{
    Body: { extensionId: string; toolId: string; params?: Record<string, unknown> }
    Reply: ToolResult
  }>('/tools/execute', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send({
        success: false,
        error: 'Extension host not initialized',
      })
    }

    const { extensionId, toolId, params } = request.body

    if (!extensionId || !toolId) {
      return reply.status(400).send({
        success: false,
        error: 'extensionId and toolId are required',
      })
    }

    try {
      return await extensionHost.executeTool(extensionId, toolId, params ?? {})
    } catch (error) {
      return reply.status(404).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
