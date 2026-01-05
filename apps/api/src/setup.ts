import { extensionRegistry, themeRegistry } from '@stina/core'
import { builtinExtensions, loadExtensions, getExtensionsPath } from '@stina/adapters-node'
import { NodeExtensionHost, ExtensionProviderBridge, ExtensionToolBridge } from '@stina/extension-host'
import { ExtensionInstaller } from '@stina/extension-installer'
import { providerRegistry, toolRegistry } from '@stina/chat'
import type { Logger } from '@stina/core'
import type { ExtensionManifest } from '@stina/extension-host'
import path from 'node:path'

// Global extension host instance
let extensionHost: NodeExtensionHost | null = null
let providerBridge: ExtensionProviderBridge | null = null
let toolBridge: ExtensionToolBridge | null = null
let extensionInstaller: ExtensionInstaller | null = null

// App version for compatibility checking
const STINA_VERSION = '0.5.0'

/**
 * Get the extension host instance
 */
export function getExtensionHost(): NodeExtensionHost | null {
  return extensionHost
}

/**
 * Get the extension installer instance
 */
export function getExtensionInstaller(): ExtensionInstaller | null {
  return extensionInstaller
}

/**
 * Setup extensions and themes
 */
export async function setupExtensions(logger: Logger): Promise<void> {
  // Clear registries
  extensionRegistry.clear()
  themeRegistry.clear()

  // Get extensions path
  const extensionsPath = getExtensionsPath()

  // Create extension installer
  extensionInstaller = new ExtensionInstaller({
    extensionsPath,
    stinaVersion: STINA_VERSION,
    platform: 'tui', // API runs in Node.js context
    logger: {
      debug: (msg, ctx) => logger.debug(msg, ctx),
      info: (msg, ctx) => logger.info(msg, ctx),
      warn: (msg, ctx) => logger.warn(msg, ctx),
      error: (msg, ctx) => logger.error(msg, ctx),
    },
  })

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

  extensionHost.on('extension-error', (extensionId, error) => {
    logger.error('[ExtHost] Extension error', { extensionId, error: error.message })
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

  // Create tool bridge to auto-register extension tools
  toolBridge = new ExtensionToolBridge(
    extensionHost,
    (tool) => {
      try {
        toolRegistry.register(tool)
        logger.info('Extension tool registered', { id: tool.id, name: tool.name })
      } catch (error) {
        logger.warn('Failed to register extension tool', {
          id: tool.id,
          error: String(error),
        })
      }
    },
    (toolId) => {
      toolRegistry.unregister(toolId)
      logger.info('Extension tool unregistered', { id: toolId })
    }
  )

  // Register built-in extensions (themes)
  for (const ext of builtinExtensions) {
    extensionRegistry.register(ext)
    logger.debug('Registered built-in extension', { id: ext.id })
  }

  // Load user extensions
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

  // Give extensions time to complete activation and register providers
  // Provider registration happens asynchronously after the worker is ready
  if (userExtensions.some((ext) => ext.main)) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    logger.debug('Provider count after activation delay', {
      providers: extensionHost.getProviders().length,
    })
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
    tools: extensionHost.getTools().length,
  })
}

/**
 * Cleanup extension host on shutdown
 */
export async function cleanupExtensions(): Promise<void> {
  if (toolBridge) {
    toolBridge.dispose()
    toolBridge = null
  }
  if (providerBridge) {
    providerBridge.dispose()
    providerBridge = null
  }
  if (extensionHost) {
    await extensionHost.dispose()
    extensionHost = null
  }
}
