import type {
  ExtensionManifest as ApiExtensionManifest,
  ToolSettingsViewDefinition,
  PanelDefinition,
  SchedulerJobRequest,
  ChatInstructionMessage,
  UserProfile,
} from '@stina/extension-api'
import type {
  ExtensionManifest as CoreExtensionManifest,
  ExtensionCommand,
  ExtensionPromptContribution,
  ExtensionTheme,
  Logger,
} from '@stina/core'
import type { InstalledExtension, Platform } from '@stina/extension-installer'
import { ExtensionInstaller } from '@stina/extension-installer'
import {
  NodeExtensionHost,
  ExtensionProviderBridge,
  ExtensionToolBridge,
  createSecretsManager,
  deriveEncryptionKey,
  type AdaptedTool,
  type ChatAIProvider,
} from '@stina/extension-host'
import { getExtensionsPath } from '../paths.js'
import { createStorageExecutor } from './storageExecutor.js'
import { join } from 'node:path'

export interface ToolSettingsViewInfo extends ToolSettingsViewDefinition {
  extensionId: string
  extensionName: string
}

export interface PanelViewInfo extends PanelDefinition {
  extensionId: string
  extensionName: string
}

export interface NodeExtensionRuntimeCallbacks {
  onProviderRegistered?: (provider: ChatAIProvider) => void
  onProviderUnregistered?: (providerId: string) => void
  onToolRegistered?: (tool: AdaptedTool) => void
  onToolUnregistered?: (toolId: string) => void
  onLog?: (args: {
    extensionId: string
    level: string
    message: string
    context?: Record<string, unknown>
  }) => void
}

export interface NodeExtensionRuntimeOptions {
  logger: Logger
  stinaVersion: string
  platform: Platform
  extensionsPath?: string
  scheduler?: {
    schedule: (extensionId: string, job: SchedulerJobRequest) => Promise<void>
    cancel: (extensionId: string, jobId: string) => Promise<void>
  }
  chat?: {
    appendInstruction: (extensionId: string, message: ChatInstructionMessage) => Promise<void>
  }
  user?: {
    getProfile: (extensionId: string) => Promise<UserProfile>
  }
  callbacks?: NodeExtensionRuntimeCallbacks
  /** Callback to delete extension data from the database when uninstalling */
  onDeleteExtensionData?: (extensionId: string) => Promise<void>
}

export interface NodeExtensionRuntime {
  extensionInstaller: ExtensionInstaller
  extensionHost: NodeExtensionHost
  providerBridge?: ExtensionProviderBridge
  toolBridge?: ExtensionToolBridge
  enabledExtensions: Array<{ installed: InstalledExtension; manifest: ApiExtensionManifest }>
}

export interface SyncEnabledExtensionsOptions {
  extensionInstaller: ExtensionInstaller
  extensionHost: NodeExtensionHost
  logger?: Logger
}

export interface SyncEnabledExtensionsResult {
  enabledExtensions: Array<{ installed: InstalledExtension; manifest: ApiExtensionManifest }>
  loaded: string[]
  unloaded: string[]
}

/**
 * Create and load a Node-based extension runtime (host + installer).
 */
export async function createNodeExtensionRuntime(
  options: NodeExtensionRuntimeOptions
): Promise<NodeExtensionRuntime> {
  const extensionsPath = options.extensionsPath ?? getExtensionsPath()
  const proxyLogger = {
    debug: (...args: Parameters<Logger['debug']>) => options.logger.debug(...args),
    info: (...args: Parameters<Logger['info']>) => options.logger.info(...args),
    warn: (...args: Parameters<Logger['warn']>) => options.logger.warn(...args),
    error: (...args: Parameters<Logger['error']>) => options.logger.error(...args),
  }

  const extensionInstaller = new ExtensionInstaller({
    extensionsPath,
    stinaVersion: options.stinaVersion,
    platform: options.platform,
    logger: proxyLogger,
    onDeleteExtensionData: options.onDeleteExtensionData,
  })

  // Get enabled extensions to build collection configs
  const enabledExtensions = extensionInstaller.getEnabledExtensions()
  const extensionCollections = new Map<string, Record<string, { indexes?: string[] }>>()

  for (const ext of enabledExtensions) {
    const collections = ext.manifest.contributes?.storage?.collections
    if (collections) {
      extensionCollections.set(ext.manifest.id, collections)
    }
  }

  // Create storage executor
  const storageExecutor = createStorageExecutor({
    extensionsPath,
    extensionCollections,
  })

  // Create secrets manager
  const secretsDbPath = join(extensionsPath, 'secrets.sqlite')
  const masterSecret = process.env['STINA_MASTER_SECRET']
  if (!masterSecret) {
    options.logger.warn(
      'STINA_MASTER_SECRET environment variable not set. Using default encryption key. ' +
      'This is INSECURE for production use. Set STINA_MASTER_SECRET to a strong random value.'
    )
  }
  
  // Dynamic import of better-sqlite3 (native module)
  // We use dynamic import to avoid bundling issues with native modules
  const betterSqlite3Module = await import('better-sqlite3')
  const Database = betterSqlite3Module.default
  
  const secretsManager = createSecretsManager({
    databasePath: secretsDbPath,
    encryptionKey: deriveEncryptionKey(masterSecret || 'default-master-secret'),
    openDatabase: (path) => {
      const db = new Database(path)
      db.pragma('journal_mode = WAL')
      return db
    },
  })

  const extensionHost = new NodeExtensionHost({
    logger: proxyLogger,
    scheduler: options.scheduler,
    chat: options.chat,
    user: options.user,
    storageCallbacks: storageExecutor,
    secretsCallbacks: {
      // Extension-scoped
      set: async (extensionId: string, key: string, value: string) => {
        await secretsManager.set(extensionId, null, key, value)
      },
      get: async (extensionId: string, key: string) => {
        return secretsManager.get(extensionId, null, key)
      },
      delete: async (extensionId: string, key: string) => {
        return secretsManager.delete(extensionId, null, key)
      },
      list: async (extensionId: string) => {
        return secretsManager.list(extensionId, null)
      },
      // User-scoped
      setForUser: async (extensionId: string, userId: string, key: string, value: string) => {
        await secretsManager.set(extensionId, userId, key, value)
      },
      getForUser: async (extensionId: string, userId: string, key: string) => {
        return secretsManager.get(extensionId, userId, key)
      },
      deleteForUser: async (extensionId: string, userId: string, key: string) => {
        return secretsManager.delete(extensionId, userId, key)
      },
      listForUser: async (extensionId: string, userId: string) => {
        return secretsManager.list(extensionId, userId)
      },
    },
  })

  extensionHost.on('log', (payload) => {
    if (options.callbacks?.onLog) {
      options.callbacks.onLog(payload)
      return
    }

    const logContext = { extensionId: payload.extensionId, ...payload.context }
    switch (payload.level) {
      case 'debug':
        options.logger.debug(`[ExtHost] ${payload.message}`, logContext)
        break
      case 'info':
        options.logger.info(`[ExtHost] ${payload.message}`, logContext)
        break
      case 'warn':
        options.logger.warn(`[ExtHost] ${payload.message}`, logContext)
        break
      case 'error':
        options.logger.error(`[ExtHost] ${payload.message}`, logContext)
        break
    }
  })

  let providerBridge: ExtensionProviderBridge | undefined
  if (options.callbacks?.onProviderRegistered || options.callbacks?.onProviderUnregistered) {
    providerBridge = new ExtensionProviderBridge(
      extensionHost,
      (provider) => options.callbacks?.onProviderRegistered?.(provider),
      (providerId) => options.callbacks?.onProviderUnregistered?.(providerId)
    )
  }

  let toolBridge: ExtensionToolBridge | undefined
  if (options.callbacks?.onToolRegistered || options.callbacks?.onToolUnregistered) {
    toolBridge = new ExtensionToolBridge(
      extensionHost,
      (tool) => options.callbacks?.onToolRegistered?.(tool),
      (toolId) => options.callbacks?.onToolUnregistered?.(toolId)
    )
  }

  // Load enabled extensions
  for (const ext of enabledExtensions) {
    try {
      await extensionHost.loadExtensionFromPath(ext.installed.path)
      options.logger.info('Loaded extension', { id: ext.manifest.id })
    } catch (error) {
      options.logger.error('Failed to load extension', {
        id: ext.manifest.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    extensionInstaller,
    extensionHost,
    providerBridge,
    toolBridge,
    enabledExtensions,
  }
}

/**
 * Sync enabled extensions against what the host has loaded (load/unload as needed).
 */
export async function syncEnabledExtensions(
  options: SyncEnabledExtensionsOptions
): Promise<SyncEnabledExtensionsResult> {
  const { extensionInstaller, extensionHost, logger } = options
  const enabledExtensions = extensionInstaller.getEnabledExtensions()

  logger?.info('syncEnabledExtensions: starting', {
    enabledCount: enabledExtensions.length,
    enabledIds: enabledExtensions.map(e => e.manifest.id),
  })

  const enabledById = new Map(enabledExtensions.map((ext) => [ext.manifest.id, ext]))
  const loadedExtensions = extensionHost.getExtensions()
  const loadedById = new Map(loadedExtensions.map((ext) => [ext.id, ext]))

  const toUnload = new Set<string>()
  for (const loaded of loadedExtensions) {
    const enabled = enabledById.get(loaded.id)
    if (!enabled) {
      toUnload.add(loaded.id)
      continue
    }
    if (enabled.manifest.version !== loaded.manifest.version) {
      toUnload.add(loaded.id)
    }
  }

  const toLoad = enabledExtensions.filter((ext) => {
    if (!loadedById.has(ext.manifest.id)) return true
    return toUnload.has(ext.manifest.id)
  })

  const unloaded: string[] = []
  for (const extensionId of toUnload) {
    try {
      await extensionHost.unloadExtension(extensionId)
      unloaded.push(extensionId)
    } catch (error) {
      logger?.warn('Failed to unload extension', {
        id: extensionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const loaded: string[] = []
  for (const extension of toLoad) {
    try {
      logger?.info('syncEnabledExtensions: loading extension', {
        id: extension.manifest.id,
        path: extension.installed.path,
      })
      await extensionHost.loadExtensionFromPath(extension.installed.path)
      loaded.push(extension.manifest.id)
      logger?.info('syncEnabledExtensions: extension loaded', {
        id: extension.manifest.id,
      })
    } catch (error) {
      logger?.error('Failed to load extension', {
        id: extension.manifest.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger?.info('syncEnabledExtensions: complete', {
    loaded,
    unloaded,
  })

  return { enabledExtensions, loaded, unloaded }
}

/**
 * Collect tool settings views from active extensions.
 */
export function getToolSettingsViews(extensionHost: NodeExtensionHost): ToolSettingsViewInfo[] {
  const views: ToolSettingsViewInfo[] = []

  for (const extension of extensionHost.getExtensions()) {
    if (extension.status !== 'active') continue

    const definitions = extension.manifest.contributes?.toolSettings ?? []
    for (const definition of definitions) {
      views.push({
        ...definition,
        extensionId: extension.id,
        extensionName: extension.manifest.name,
      })
    }
  }

  return views
}

/**
 * Collect panel view definitions from active extensions.
 */
export function getPanelViews(extensionHost: NodeExtensionHost): PanelViewInfo[] {
  const panels: PanelViewInfo[] = []

  for (const extension of extensionHost.getExtensions()) {
    if (extension.status !== 'active') continue
    if (!extension.manifest.permissions?.includes('panels.register')) continue

    const definitions = extension.manifest.contributes?.panels ?? []
    for (const definition of definitions) {
      panels.push({
        ...definition,
        extensionId: extension.id,
        extensionName: extension.manifest.name,
      })
    }
  }

  return panels
}

/**
 * Map an extension manifest to the core extension manifest shape.
 */
export function mapExtensionManifestToCore(
  manifest: ApiExtensionManifest
): CoreExtensionManifest {
  const manifestWithType = manifest as ApiExtensionManifest & {
    type?: string
    engines?: { stina?: string }
    contributes?: Record<string, unknown>
  }

  const themes = (manifestWithType.contributes as { themes?: ExtensionTheme[] } | undefined)
    ?.themes

  const isTheme = manifestWithType.type === 'theme' || (themes?.length ?? 0) > 0

  const commands = (manifestWithType.contributes as
    | { commands?: Array<{ id: string; title?: string; name?: string }> }
    | undefined)?.commands

  const prompts = (manifestWithType.contributes as { prompts?: ExtensionPromptContribution[] } | undefined)
    ?.prompts

  const mappedCommands: ExtensionCommand[] | undefined = commands?.map((command) => ({
    id: command.id,
    title: command.title ?? command.name ?? command.id,
  }))

  const coreManifest: CoreExtensionManifest = {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    type: isTheme ? 'theme' : 'feature',
    engines: {
      app: manifestWithType.engines?.stina ?? '>=0.0.0',
    },
    contributes: {
      themes,
      prompts,
      commands: mappedCommands,
    },
  }

  return coreManifest
}
