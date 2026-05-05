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
 * Electron mirror of `apps/api/src/redesignProvider.ts`. Same logic, same
 * fallbacks — duplicated here so we don't introduce a cross-app dep just
 * for ~30 lines of repository plumbing. Keep the two files in sync until a
 * shared package emerges (a candidate location is `@stina/orchestrator` if
 * we're willing to add the @stina/chat repos as a dep).
 */
export interface BuildElectronDecisionTurnProducerOptions {
  extensionHost: NodeExtensionHost | null
  userId: string
  logger: Logger
}

export async function buildElectronDecisionTurnProducer(
  opts: BuildElectronDecisionTurnProducerOptions
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

  if (!extensionHost.getProvider(config.providerId)) {
    logger.warn(
      `Default provider "${config.providerId}" is not registered — decision turn falls back to canned stub`
    )
    return null
  }

  const dispatcher: ChatStreamDispatcher = (messages, options) => {
    return extensionHost.chat(config.providerId, messages, {
      ...options,
      context: { ...(options.context ?? {}), userId },
    })
  }

  // See apps/api/src/redesignProvider.ts for why we go through the chat
  // ToolRegistry rather than extensionHost directly — it's the canonical
  // hub that has both builtin tools and extension-registered tools.
  const toolDefs = toolRegistry.getToolDefinitions()
  const tools = toolDefs.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))

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
