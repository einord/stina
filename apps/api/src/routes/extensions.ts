import type { FastifyPluginAsync } from 'fastify'
import { extensionRegistry } from '@stina/core'
import type { ExtensionSummary } from '@stina/shared'
import { getExtensionInstaller, getExtensionHost, syncExtensions } from '../setup.js'
import { getPanelViews } from '@stina/adapters-node'
import type { RegistryEntry, ExtensionDetails, InstalledExtensionInfo, InstallLocalResult } from '@stina/extension-installer'
import { requireAuth, requireAdmin } from '@stina/auth'

export const extensionRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================================================
  // Local Extensions (currently loaded)
  // ===========================================================================

  /**
   * List all loaded extensions (built-in + user)
   */
  fastify.get<{ Reply: ExtensionSummary[] }>('/extensions', { preHandler: requireAuth }, async () => {
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
  }>('/extensions/providers', { preHandler: requireAuth }, async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    return extensionHost.getProviders()
  })

  /**
   * Stream extension events via SSE
   */
  fastify.get('/extensions/events', { preHandler: requireAuth }, async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    reply.hijack()

    // Set SSE headers (including CORS since we're bypassing Fastify's CORS plugin)
    const origin = request.headers.origin
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // CORS headers - required since reply.hijack() bypasses Fastify's CORS plugin
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
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
  fastify.get('/extensions/panels', { preHandler: requireAuth }, async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    return getPanelViews(extensionHost)
  })

  /**
   * List registered actions from extensions
   */
  fastify.get<{
    Reply: Array<{ id: string; extensionId: string }>
  }>('/extensions/actions', { preHandler: requireAuth }, async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    return extensionHost.getActions()
  })

  /**
   * Execute an action from an extension
   */
  fastify.post<{
    Params: { extensionId: string; actionId: string }
    Body: { params?: Record<string, unknown> }
    Reply: { success: boolean; data?: unknown; error?: string }
  }>('/extensions/actions/:extensionId/:actionId', { preHandler: requireAuth }, async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send({ success: false, error: 'Extension host not initialized' })
    }

    const { extensionId, actionId } = request.params
    const params = request.body?.params ?? {}

    try {
      // Pass userId from authenticated user for user context in extensions
      const result = await extensionHost.executeAction(extensionId, actionId, params, request.user?.id)
      return result
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Action execution failed',
      })
    }
  })

  // ===========================================================================
  // Registry (available extensions)
  // ===========================================================================

  /**
   * List all available extensions from the registry
   */
  fastify.get<{ Reply: RegistryEntry[] }>('/extensions/available', { preHandler: requireAuth }, async (request, reply) => {
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
  }>('/extensions/search', { preHandler: requireAuth }, async (request, reply) => {
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
  }>('/extensions/registry/:id', { preHandler: requireAuth }, async (request, reply) => {
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
   * List installed extensions with validation status
   */
  fastify.get<{ Reply: InstalledExtensionInfo[] }>('/extensions/installed', { preHandler: requireAuth }, async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ error: 'Extension installer not initialized' } as unknown as InstalledExtensionInfo[])
    }

    return installer.getInstalledExtensionsWithValidation()
  })

  /**
   * Install an extension (admin only)
   */
  fastify.post<{
    Body: { extensionId: string; version?: string }
    Reply: { success: boolean; extensionId: string; version: string; error?: string }
  }>('/extensions/install', { preHandler: requireAdmin }, async (request, reply) => {
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
   * Uninstall an extension (admin only)
   */
  fastify.delete<{
    Params: { id: string }
    Querystring: { deleteData?: string }
    Reply: { success: boolean; error?: string }
  }>('/extensions/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({
        success: false,
        error: 'Extension installer not initialized',
      })
    }

    const deleteData = request.query.deleteData === 'true'
    const result = await installer.uninstall(request.params.id, deleteData)

    if (!result.success) {
      return reply.status(400).send(result)
    }

    await syncExtensions()
    return result
  })

  /**
   * Enable an extension (admin only)
   */
  fastify.post<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/extensions/:id/enable', { preHandler: requireAdmin }, async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({ success: false })
    }

    installer.enable(request.params.id)
    await syncExtensions()
    return { success: true }
  })

  /**
   * Disable an extension (admin only)
   */
  fastify.post<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/extensions/:id/disable', { preHandler: requireAdmin }, async (request, reply) => {
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
  }>('/extensions/updates', { preHandler: requireAuth }, async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send([])
    }

    return installer.checkForUpdates()
  })

  /**
   * Update an extension (admin only)
   */
  fastify.post<{
    Params: { id: string }
    Body: { version?: string }
    Reply: { success: boolean; extensionId: string; version: string; error?: string }
  }>('/extensions/:id/update', { preHandler: requireAdmin }, async (request, reply) => {
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
  // Local Extensions (upload)
  // ===========================================================================

  /**
   * Upload and install a local extension from ZIP file (admin only)
   */
  fastify.post<{
    Reply: InstallLocalResult
  }>('/extensions/upload', { preHandler: requireAdmin }, async (request, reply) => {
    const installer = getExtensionInstaller()
    if (!installer) {
      return reply.status(503).send({
        success: false,
        extensionId: 'unknown',
        error: 'Extension installer not initialized',
      })
    }

    // Get uploaded file
    const data = await request.file()
    if (!data) {
      return reply.status(400).send({
        success: false,
        extensionId: 'unknown',
        error: 'No file uploaded',
      })
    }

    // Validate file type (filename, MIME type, and magic bytes)
    const filename = data.filename.toLowerCase()
    if (!filename.endsWith('.zip')) {
      return reply.status(400).send({
        success: false,
        extensionId: 'unknown',
        error: 'Only ZIP files are allowed',
      })
    }

    // Validate MIME type
    const mimeType = data.mimetype
    if (mimeType !== 'application/zip' && mimeType !== 'application/x-zip-compressed') {
      return reply.status(400).send({
        success: false,
        extensionId: 'unknown',
        error: 'Invalid file type. Only ZIP files are allowed.',
      })
    }

    // Read first 4 bytes to validate ZIP magic bytes (PK\x03\x04)
    const fileStream = data.file
    const firstChunk = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      let totalLength = 0

      const onData = (chunk: Buffer) => {
        chunks.push(chunk)
        totalLength += chunk.length
        if (totalLength >= 4) {
          fileStream.removeListener('data', onData)
          fileStream.removeListener('error', onError)
          fileStream.pause()
          resolve(Buffer.concat(chunks))
        }
      }

      const onError = (err: Error) => {
        fileStream.removeListener('data', onData)
        fileStream.removeListener('error', onError)
        reject(err)
      }

      fileStream.on('data', onData)
      fileStream.on('error', onError)
      fileStream.on('end', () => {
        fileStream.removeListener('data', onData)
        fileStream.removeListener('error', onError)
        if (totalLength > 0) {
          resolve(Buffer.concat(chunks))
        } else {
          reject(new Error('Empty file'))
        }
      })
    })

    // Validate ZIP magic bytes (PK\x03\x04 = 0x50 0x4B 0x03 0x04)
    if (
      firstChunk.length < 4 ||
      firstChunk[0] !== 0x50 ||
      firstChunk[1] !== 0x4b ||
      firstChunk[2] !== 0x03 ||
      firstChunk[3] !== 0x04
    ) {
      return reply.status(400).send({
        success: false,
        extensionId: 'unknown',
        error: 'Invalid ZIP file format',
      })
    }

    // Create a new stream that includes the consumed bytes
    const { Readable } = await import('stream')
    const completeStream = Readable.from(
      (async function* () {
        yield firstChunk
        for await (const chunk of fileStream) {
          yield chunk
        }
      })(),
    )

    const result = await installer.installLocalExtension(completeStream)

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
  }>('/extensions/:id/settings', { preHandler: requireAuth }, async (request, reply) => {
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
   * Update a setting for an extension (admin only)
   */
  fastify.put<{
    Params: { id: string }
    Body: { key: string; value: unknown }
    Reply: { success: boolean }
  }>('/extensions/:id/settings', { preHandler: requireAdmin }, async (request, reply) => {
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
   * Get tools registered by an extension
   */
  fastify.get<{
    Params: { id: string }
    Reply: Array<{ id: string; name: unknown; description: unknown; parameters?: Record<string, unknown> }>
  }>('/extensions/:id/tools', { preHandler: requireAuth }, async (request, reply) => {
    const extensionHost = getExtensionHost()
    if (!extensionHost) {
      return reply.status(503).send([])
    }

    return extensionHost.getToolsForExtension(request.params.id)
  })

  /**
   * Get available models from a provider extension (simple GET without settings)
   */
  fastify.get<{
    Params: { providerId: string }
    Reply: Array<{ id: string; name: string; description?: string; contextLength?: number }>
  }>('/extensions/providers/:providerId/models', { preHandler: requireAuth }, async (request, reply) => {
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
  }>('/extensions/providers/:providerId/models', { preHandler: requireAuth }, async (request, reply) => {
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
