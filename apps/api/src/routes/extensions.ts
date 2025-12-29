import type { FastifyPluginAsync } from 'fastify'
import { extensionRegistry } from '@stina/core'
import type { ExtensionSummary } from '@stina/shared'
import { getExtensionInstaller, getExtensionHost } from '../setup.js'
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

    return result
  })
}
