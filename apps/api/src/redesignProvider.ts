import type { NodeExtensionHost } from '@stina/extension-host'
import type { DecisionTurnProducer, ChatStreamDispatcher } from '@stina/orchestrator'
import { createProviderProducer } from '@stina/orchestrator'
import {
  ModelConfigRepository,
  UserSettingsRepository,
  AppSettingsStore,
} from '@stina/chat/db'
import { toolRegistry } from '@stina/chat'
import { getDatabase } from '@stina/adapters-node'
import { APP_NAMESPACE } from '@stina/core'
import type { Logger } from '@stina/core'

/**
 * Production wiring for the redesign-2026 decision turn: per-user lookup of
 * the default model config, plus a `ChatStreamDispatcher` bound to the
 * extension host's `chat()` IPC.
 *
 * Returns null when:
 *   - no extension host is available (extensions disabled / setup skipped),
 *   - the user has no default model config,
 *   - the configured provider is not currently registered.
 *
 * In all of those cases the route falls back to the canned stub producer
 * from @stina/orchestrator. The fallback path is deliberate — Stina should
 * still produce *something* in the inbox when a model isn't wired, so the
 * UX surface stays usable during onboarding.
 */
export interface BuildRedesignDecisionTurnProducerOptions {
  extensionHost: NodeExtensionHost | null
  userId: string
  logger: Logger
}

export async function buildRedesignDecisionTurnProducer(
  opts: BuildRedesignDecisionTurnProducerOptions
): Promise<DecisionTurnProducer | null> {
  const { extensionHost, userId, logger } = opts
  if (!extensionHost) return null

  const db = getDatabase()
  const userSettings = new UserSettingsRepository(db, userId)
  const defaultId = await userSettings.getDefaultModelConfigId()
  if (!defaultId) return null

  const modelConfigs = new ModelConfigRepository(db)
  const config = await modelConfigs.get(defaultId)
  if (!config) return null

  // Confirm the provider extension is currently registered. If the user
  // configured a model whose extension is uninstalled or hasn't loaded yet,
  // we fall back to the canned stub rather than crashing on the first turn.
  if (!extensionHost.getProvider(config.providerId)) {
    logger.warn(
      `Default provider "${config.providerId}" is not registered — decision turn falls back to canned stub`
    )
    return null
  }

  const dispatcher: ChatStreamDispatcher = (messages, options) => {
    return extensionHost.chat(config.providerId, messages, {
      ...options,
      // The extension host accepts the same ChatOptions shape; we only
      // augment with userId context so logging / per-user tracking works.
      context: { ...(options.context ?? {}), userId },
    })
  }

  // Advertise the full tool surface (builtin + extension-registered) to
  // the model. The chat ToolRegistry is the canonical hub: extensions
  // register through it, and `registerBuiltinTools(toolRegistry, …)` in
  // setup.ts seeds builtins (datetime, etc.) before extensions load.
  const toolDefs = toolRegistry.getToolDefinitions()
  const tools = toolDefs.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    severity: t.severity,
  }))

  // Resolve user timezone for the execution context (builtin tools like
  // get_current_time use it). Falls back to undefined if not configured.
  const userSettingsRow = await userSettings.get()
  const settingsStore = new AppSettingsStore(userSettingsRow)
  const timezone = settingsStore.get<string>(APP_NAMESPACE, 'timezone')

  const executeTool = async (
    toolName: string,
    params: Record<string, unknown>
  ): Promise<import('@stina/extension-api').ToolResult> => {
    const tool = toolRegistry.get(toolName)
    if (!tool) {
      return { success: false, error: `Tool "${toolName}" not found in registry` }
    }
    try {
      return await tool.execute(params, { userId, ...(timezone ? { timezone } : {}) })
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return createProviderProducer({
    dispatcher,
    model: config.modelId,
    ...(config.settingsOverride ? { settings: config.settingsOverride } : {}),
    ...(tools.length > 0 ? { tools, executeTool } : {}),
  })
}
