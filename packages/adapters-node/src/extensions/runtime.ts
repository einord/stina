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
  type AdaptedTool,
  type ChatAIProvider,
} from '@stina/extension-host'
import { getExtensionsPath } from '../paths.js'

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
  databaseExecutor?: (extensionId: string, sql: string, params?: unknown[]) => Promise<unknown[]>
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
  })

  const extensionHost = new NodeExtensionHost({
    logger: proxyLogger,
    databaseExecutor: options.databaseExecutor,
    scheduler: options.scheduler,
    chat: options.chat,
    user: options.user,
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

  const enabledExtensions = extensionInstaller.getEnabledExtensions()

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
      await extensionHost.loadExtensionFromPath(extension.installed.path)
      loaded.push(extension.manifest.id)
    } catch (error) {
      logger?.error('Failed to load extension', {
        id: extension.manifest.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

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
