import { extensionRegistry, themeRegistry } from '@stina/core'
import { builtinExtensions, loadExtensions, getExtensionsPath } from '@stina/adapters-node'
import { NodeExtensionHost, ExtensionProviderBridge } from '@stina/extension-host'
import { providerRegistry } from '@stina/chat'
import type { Logger } from '@stina/core'
import type { ExtensionManifest } from '@stina/extension-host'
import path from 'node:path'

// Global extension host instance
let extensionHost: NodeExtensionHost | null = null
let providerBridge: ExtensionProviderBridge | null = null

/**
 * Get the extension host instance
 */
export function getExtensionHost(): NodeExtensionHost | null {
  return extensionHost
}

/**
 * Setup extensions and themes
 */
export async function setupExtensions(logger: Logger): Promise<void> {
  // Clear registries
  extensionRegistry.clear()
  themeRegistry.clear()

  // Create extension host for provider extensions
  extensionHost = new NodeExtensionHost({
    logger: {
      debug: (msg, ctx) => logger.debug(msg, ctx),
      info: (msg, ctx) => logger.info(msg, ctx),
      warn: (msg, ctx) => logger.warn(msg, ctx),
      error: (msg, ctx) => logger.error(msg, ctx),
    },
  })

  // Listen for extension host events for debugging
  extensionHost.on('log', ({ extensionId, level, message, context }) => {
    const logContext = { extensionId, ...context }
    switch (level) {
      case 'debug':
        logger.debug(`[ExtHost] ${message}`, logContext)
        break
      case 'info':
        logger.info(`[ExtHost] ${message}`, logContext)
        break
      case 'warn':
        logger.warn(`[ExtHost] ${message}`, logContext)
        break
      case 'error':
        logger.error(`[ExtHost] ${message}`, logContext)
        break
    }
  })

  extensionHost.on('provider-registered', (info) => {
    logger.info('[ExtHost] Provider registered event', { provider: info.id, name: info.name })
  })

  extensionHost.on('extension-loaded', (info) => {
    logger.info('[ExtHost] Extension loaded event', { id: info.id })
  })

  // Create provider bridge to auto-register extension providers
  providerBridge = new ExtensionProviderBridge(
    extensionHost,
    (provider) => {
      try {
        providerRegistry.register(provider)
        logger.info('Extension provider registered', { id: provider.id, name: provider.name })
      } catch (error) {
        logger.warn('Failed to register extension provider', {
          id: provider.id,
          error: String(error),
        })
      }
    },
    (providerId) => {
      providerRegistry.unregister(providerId)
      logger.info('Extension provider unregistered', { id: providerId })
    }
  )

  // Register built-in extensions (themes)
  for (const ext of builtinExtensions) {
    extensionRegistry.register(ext)
    logger.debug('Registered built-in extension', { id: ext.id })
  }

  // Load user extensions
  const extensionsPath = getExtensionsPath()
  let userExtensions: ExtensionManifest[] = []

  try {
    userExtensions = loadExtensions(extensionsPath) as ExtensionManifest[]

    for (const ext of userExtensions) {
      extensionRegistry.register(ext)
      logger.debug('Registered user extension manifest', { id: ext.id })
    }
  } catch (error) {
    logger.warn('Failed to load user extensions', { error: String(error) })
  }

  // Load provider extensions into the extension host
  for (const ext of userExtensions) {
    // Only load extensions that have a main entry point (provider extensions)
    if (ext.main) {
      const extPath = path.join(extensionsPath, ext.id)
      try {
        await extensionHost.loadExtensionFromPath(extPath)
        logger.info('Loaded provider extension', { id: ext.id })
      } catch (error) {
        logger.error('Failed to load provider extension', {
          id: ext.id,
          error: String(error),
        })
      }
    }
  }

  // Register themes from all extensions
  for (const theme of extensionRegistry.getThemes()) {
    themeRegistry.registerTheme(theme.id, theme.label, theme.tokens)
    logger.debug('Registered theme', { id: theme.id })
  }

  logger.info('Extensions setup complete', {
    extensions: extensionRegistry.list().length,
    themes: themeRegistry.listThemes().length,
    providers: extensionHost.getProviders().length,
  })
}

/**
 * Cleanup extension host on shutdown
 */
export async function cleanupExtensions(): Promise<void> {
  if (providerBridge) {
    providerBridge.dispose()
    providerBridge = null
  }
  if (extensionHost) {
    await extensionHost.dispose()
    extensionHost = null
  }
}
