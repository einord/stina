import type { NodeExtensionHost } from '@stina/extension-host'
import type { DecisionTurnProducer, ChatStreamDispatcher } from '@stina/orchestrator'
import { createProviderProducer } from '@stina/orchestrator'
import { ModelConfigRepository, UserSettingsRepository } from '@stina/chat/db'
import { getDatabase } from '@stina/adapters-node'
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

  return createProviderProducer({
    dispatcher,
    model: config.modelId,
    ...(config.settingsOverride ? { settings: config.settingsOverride } : {}),
  })
}
