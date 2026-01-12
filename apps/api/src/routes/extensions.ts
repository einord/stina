import type { FastifyPluginAsync } from 'fastify'
import { extensionRegistry } from '@stina/core'
import type { ExtensionSummary } from '@stina/shared'
import { getExtensionInstaller, getExtensionHost, syncExtensions } from '../setup.js'
import { getPanelViews } from '@stina/adapters-node'
import type { RegistryEntry, ExtensionDetails, InstalledExtension } from '@stina/extension-installer'

export const extensionRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================================================
  // Local Extensions (currently loaded)
  // ===========================================================================

  /**
   * List all loaded extensions (built-in + user)
   */
  fastify.get<{ Reply: ExtensionSummary[] }>('/extensions', async () => {
    const extensions = extensionRegistry.list()
    return extensions.map((e) => ({
      id: e.id,
      name: e.name,
      version: e.version,
      type: e.type,
    }))
  })

  /**
   * List registered providers from extensions
   */
  fastify.get<{
    Reply: Array<{ id: string; name: string; extensionId: string }>
  }>('/extensions/providers', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    return extensionHost.getProviders()
  })

  /**
   * Stream extension events via SSE
   */
  fastify.get('/extensions/events', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    reply.hijack()

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    reply.raw.write('retry: 2000\n\n')

    let ended = false
    const keepalive = setInterval(() => {
      if (ended) return
      try {
        reply.raw.write(': keepalive\n\n')
      } catch {
        // Ignore write errors (client disconnected)
      }
    }, 15000)

    const onEvent = (event: { extensionId: string; name: string; payload?: Record<string, unknown> }) => {
      if (ended) return
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        // Ignore write errors (client disconnected)
      }
    }

    const cleanup = () => {
      if (ended) return
      ended = true
      clearInterval(keepalive)
      extensionHost.off('extension-event', onEvent)
    }

    reply.raw.on('close', cleanup)
    extensionHost.on('extension-event', onEvent)
  })

  /**
   * List panel views from extensions
   */
  fastify.get('/extensions/panels', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    return getPanelViews(extensionHost)
  })

  // ===========================================================================
  // Registry (available extensions)
  // ===========================================================================

  /**
   * List all available extensions from the registry
   */
  fastify.get<{ Reply: RegistryEntry[] }>('/extensions/available', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ error: 'Extension installer not initialized' } as unknown as RegistryEntry[])
    }

    return installer.getAvailableExtensions()
  })

  /**
   * Search extensions in the registry
   */
  fastify.get<{
    Querystring: { q?: string; category?: string; verified?: string }
    Reply: RegistryEntry[]
  }>('/extensions/search', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ error: 'Extension installer not initialized' } as unknown as RegistryEntry[])
    }

    const { q, category, verified } = request.query

    return installer.searchExtensions({
      query: q,
      category: category as 'ai-provider' | 'tool' | 'theme' | 'utility' | undefined,
      verified: verified !== undefined ? verified === 'true' : undefined,
    })
  })

  /**
   * Get details of a specific extension from the registry
   */
  fastify.get<{
    Params: { id: string }
    Reply: ExtensionDetails
  }>('/extensions/registry/:id', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ error: 'Extension installer not initialized' } as unknown as ExtensionDetails)
    }

    try {
      return await installer.getExtensionDetails(request.params.id)
    } catch (error) {
      return reply.status(404).send({
        error: error instanceof Error ? error.message : 'Extension not found',
      } as unknown as ExtensionDetails)
    }
  })

  // ===========================================================================
  // Installed Extensions
  // ===========================================================================

  /**
   * List installed extensions
   */
  fastify.get<{ Reply: InstalledExtension[] }>('/extensions/installed', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ error: 'Extension installer not initialized' } as unknown as InstalledExtension[])
    }

    return installer.getInstalledExtensions()
  })

  /**
   * Install an extension
   */
  fastify.post<{
    Body: { extensionId: string; version?: string }
    Reply: { success: boolean; extensionId: string; version: string; error?: string }
  }>('/extensions/install', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({
        success: false,
        extensionId: request.body.extensionId,
        version: 'unknown',
        error: 'Extension installer not initialized',
      })
    }

    const { extensionId, version } = request.body

    if (!extensionId) {
      return reply.status(400).send({
        success: false,
        extensionId: '',
        version: 'unknown',
        error: 'extensionId is required',
      })
    }

    const result = await installer.install(extensionId, version)

    if (!result.success) {
      return reply.status(400).send(result)
    }

    await syncExtensions()
    return result
  })

  /**
   * Uninstall an extension
   */
  fastify.delete<{
    Params: { id: string }
    Reply: { success: boolean; error?: string }
  }>('/extensions/:id', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({
        success: false,
        error: 'Extension installer not initialized',
      })
    }

    const result = await installer.uninstall(request.params.id)

    if (!result.success) {
      return reply.status(400).send(result)
    }

    await syncExtensions()
    return result
  })

  /**
   * Enable an extension
   */
  fastify.post<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/extensions/:id/enable', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ success: false })
    }

    installer.enable(request.params.id)
    await syncExtensions()
    return { success: true }
  })

  /**
   * Disable an extension
   */
  fastify.post<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/extensions/:id/disable', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ success: false })
    }

    installer.disable(request.params.id)
    await syncExtensions()
    return { success: true }
  })

  /**
   * Check for updates
   */
  fastify.get<{
    Reply: Array<{ extensionId: string; currentVersion: string; latestVersion: string }>
  }>('/extensions/updates', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send([])
    }

    return installer.checkForUpdates()
  })

  /**
   * Update an extension
   */
  fastify.post<{
    Params: { id: string }
    Body: { version?: string }
    Reply: { success: boolean; extensionId: string; version: string; error?: string }
  }>('/extensions/:id/update', async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({
        success: false,
        extensionId: request.params.id,
        version: 'unknown',
        error: 'Extension installer not initialized',
      })
    }

    const result = await installer.update(request.params.id, request.body?.version)

    if (!result.success) {
      return reply.status(400).send(result)
    }

    await syncExtensions()
    return result
  })

  // ===========================================================================
  // Extension Settings
  // ===========================================================================

  /**
   * Get settings for an extension
   */
  fastify.get<{
    Params: { id: string }
    Reply: { settings: Record<string, unknown>; definitions: unknown[] }
  }>('/extensions/:id/settings', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send({ error: 'Extension host not initialized' } as unknown as { settings: Record<string, unknown>; definitions: unknown[] })
    }

    const extension = extensionHost.getExtension(request.params.id)
    if (!extension) {
      return reply.status(404).send({ error: 'Extension not found' } as unknown as { settings: Record<string, unknown>; definitions: unknown[] })
    }

    return {
      settings: extension.settings,
      definitions: extension.manifest.contributes?.settings ?? [],
    }
  })

  /**
   * Update a setting for an extension
   */
  fastify.put<{
    Params: { id: string }
    Body: { key: string; value: unknown }
    Reply: { success: boolean }
  }>('/extensions/:id/settings', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send({ success: false })
    }

    const { key, value } = request.body
    if (!key) {
      return reply.status(400).send({ success: false })
    }

    try {
      await extensionHost.updateSettings(request.params.id, key, value)
      return { success: true }
    } catch {
      return reply.status(404).send({ success: false })
    }
  })

  /**
   * Get available models from a provider extension (simple GET without settings)
   */
  fastify.get<{
    Params: { providerId: string }
    Reply: Array<{ id: string; name: string; description?: string; contextLength?: number }>
  }>('/extensions/providers/:providerId/models', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    try {
      const models = await extensionHost.getModels(request.params.providerId)
      return models
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : 'Failed to get models' } as unknown as Array<{ id: string; name: string; description?: string; contextLength?: number }>)
    }
  })

  /**
   * Get available models from a provider extension with custom settings (e.g., URL for Ollama)
   */
  fastify.post<{
    Params: { providerId: string }
    Body: { settings?: Record<string, unknown> }
    Reply: Array<{ id: string; name: string; description?: string; contextLength?: number }>
  }>('/extensions/providers/:providerId/models', async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    try {
      const options = request.body?.settings ? { settings: request.body.settings } : undefined
      const models = await extensionHost.getModels(request.params.providerId, options)
      return models
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : 'Failed to get models' } as unknown as Array<{ id: string; name: string; description?: string; contextLength?: number }>)
    }
  })
}
