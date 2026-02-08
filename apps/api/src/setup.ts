import { extensionRegistry, themeRegistry } from '@stina/core'
import type { ExtensionManifest as ApiExtensionManifest, UserProfile } from '@stina/extension-api'
import {
  builtinExtensions,
  createNodeExtensionRuntime,
  mapExtensionManifestToCore,
  syncEnabledExtensions,
  deleteExtensionData,
  getRawDb,
} from '@stina/adapters-node'
import { NodeExtensionHost, ExtensionProviderBridge, ExtensionToolBridge } from '@stina/extension-host'
import { ExtensionInstaller } from '@stina/extension-installer'
import type { InstalledExtension } from '@stina/extension-installer'
import { providerRegistry, toolRegistry } from '@stina/chat'
import { registerBuiltinTools } from '@stina/builtin-tools'
import { APP_NAMESPACE } from '@stina/core'
import type { Logger } from '@stina/core'
import { getAppSettingsStore } from '@stina/chat/db'
import type { SchedulerJobRequest, ChatInstructionMessage, Platform } from '@stina/extension-api'

// Global extension host instance
let extensionHost: NodeExtensionHost | null = null
let providerBridge: ExtensionProviderBridge | null = null
let toolBridge: ExtensionToolBridge | null = null
let extensionInstaller: ExtensionInstaller | null = null
let storageExecutor: { close(): void } | null = null
let secretsManager: { close(): void } | null = null

// App version for compatibility checking
const STINA_VERSION = '0.5.0'
let setupLogger: Logger | null = null

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

export interface ExtensionSetupOptions {
  /** Platform identifier reported to extensions (default: 'web') */
  platform?: Platform
  scheduler?: {
    schedule: (extensionId: string, job: SchedulerJobRequest) => Promise<void>
    cancel: (extensionId: string, jobId: string) => Promise<void>
    updateJobResult: (extensionId: string, jobId: string, success: boolean, error?: string) => Promise<void>
  }
  chat?: {
    appendInstruction: (extensionId: string, message: ChatInstructionMessage) => Promise<void>
  }
}

/**
 * Setup extensions and themes
 */
export async function setupExtensions(
  logger: Logger,
  options?: ExtensionSetupOptions
): Promise<void> {
  setupLogger = logger

  // Register built-in tools before extension runtime (so they're always available)
  const builtinCount = registerBuiltinTools(toolRegistry, {
    getTimezone: async () => {
      const settingsStore = getAppSettingsStore()
      return settingsStore?.get<string>(APP_NAMESPACE, 'timezone')
    },
  })
  logger.info('Registered built-in tools', { count: builtinCount })

  const runtime = await createNodeExtensionRuntime({
    logger,
    stinaVersion: STINA_VERSION,
    platform: options?.platform ?? 'web',
    scheduler: options?.scheduler,
    chat: options?.chat,
    user: {
      getProfile: async (_extensionId: string): Promise<UserProfile> => {
        const settingsStore = getAppSettingsStore()
        if (!settingsStore) return {}
        return {
          firstName: settingsStore.get<string>(APP_NAMESPACE, 'firstName'),
          nickname: settingsStore.get<string>(APP_NAMESPACE, 'nickname'),
          language: settingsStore.get<string>(APP_NAMESPACE, 'language'),
          timezone: settingsStore.get<string>(APP_NAMESPACE, 'timezone'),
        }
      },
    },
    callbacks: {
      onProviderRegistered: (provider) => {
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
      onProviderUnregistered: (providerId) => {
        providerRegistry.unregister(providerId)
        logger.info('Extension provider unregistered', { id: providerId })
      },
      onToolRegistered: (tool) => {
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
      onToolUnregistered: (toolId) => {
        toolRegistry.unregister(toolId)
        logger.info('Extension tool unregistered', { id: toolId })
      },
    },
    onDeleteExtensionData: async (extensionId: string) => {
      logger.info('onDeleteExtensionData called', { extensionId })
      const db = getRawDb()
      if (!db) {
        logger.warn('onDeleteExtensionData: database not available')
        return
      }
      const result = await deleteExtensionData(db, extensionId, logger)
      logger.info('Deleted extension data', {
        extensionId,
        tablesDropped: result.tablesDropped,
        modelConfigsDeleted: result.modelConfigsDeleted,
      })
    },
  })

  extensionInstaller = runtime.extensionInstaller
  extensionHost = runtime.extensionHost
  providerBridge = runtime.providerBridge ?? null
  toolBridge = runtime.toolBridge ?? null
  storageExecutor = runtime.storageExecutor
  secretsManager = runtime.secretsManager

  extensionHost.on('provider-registered', (info) => {
    logger.info('[ExtHost] Provider registered event', { provider: info.id, name: info.name })
  })

  extensionHost.on('extension-loaded', (info) => {
    logger.info('[ExtHost] Extension loaded event', { id: info.id })
  })

  extensionHost.on('extension-error', (extensionId, error) => {
    logger.error('[ExtHost] Extension error', { extensionId, error: error.message })
  })

  rebuildExtensionRegistry(runtime.enabledExtensions, logger)

  // Extensions with a `main` entry point run in worker threads. After the worker
  // signals "ready", the extension's activate() function runs asynchronously and
  // may call registerProvider/registerTool. There is currently no event that fires
  // once all providers have been registered, so we wait a fixed 500ms to let the
  // most common provider extensions (Ollama, OpenAI) finish activation.
  if (runtime.enabledExtensions.some((ext) => Boolean(ext.manifest.main))) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    logger.debug('Provider count after activation delay', {
      providers: extensionHost.getProviders().length,
    })
  }

  rebuildThemeRegistry(logger)

  logger.info('Extensions setup complete', {
    extensions: extensionRegistry.list().length,
    themes: themeRegistry.listThemes().length,
    providers: extensionHost.getProviders().length,
    tools: extensionHost.getTools().length,
  })
}

export async function syncExtensions(): Promise<void> {
  if (!extensionHost || !extensionInstaller) return

  const { enabledExtensions } = await syncEnabledExtensions({
    extensionInstaller,
    extensionHost,
    logger: setupLogger ?? undefined,
  })

  rebuildExtensionRegistry(enabledExtensions, setupLogger ?? undefined)
  rebuildThemeRegistry(setupLogger ?? undefined)
}

function rebuildExtensionRegistry(
  enabledExtensions: Array<{ installed: InstalledExtension; manifest: ApiExtensionManifest }>,
  logger?: Logger
): void {
  extensionRegistry.clear()
  for (const ext of builtinExtensions) {
    extensionRegistry.register(ext)
    logger?.debug('Registered built-in extension', { id: ext.id })
  }

  for (const ext of enabledExtensions) {
    try {
      extensionRegistry.register(mapExtensionManifestToCore(ext.manifest))
      logger?.debug('Registered enabled extension manifest', { id: ext.manifest.id })
    } catch (error) {
      logger?.warn('Failed to register enabled extension manifest', {
        id: ext.manifest.id,
        error: String(error),
      })
    }
  }
}

function rebuildThemeRegistry(logger?: Logger): void {
  themeRegistry.clear()
  for (const theme of extensionRegistry.getThemes()) {
    themeRegistry.registerTheme(theme.id, theme.label, theme.tokens)
    logger?.debug('Registered theme', { id: theme.id })
  }
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
    const extensions = extensionHost.getExtensions()
    for (const extension of extensions) {
      await extensionHost.unloadExtension(extension.id)
    }
    extensionHost = null
  }
  // Close storage and secrets database connections to prevent resource leaks
  if (storageExecutor) {
    storageExecutor.close()
    storageExecutor = null
  }
  if (secretsManager) {
    secretsManager.close()
    secretsManager = null
  }
}
