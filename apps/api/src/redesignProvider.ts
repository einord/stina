import type { NodeExtensionHost } from '@stina/extension-host'
import type { DecisionTurnProducer, ChatStreamDispatcher } from '@stina/orchestrator'
import { createProviderProducer } from '@stina/orchestrator'
import { ModelConfigRepository, UserSettingsRepository } from '@stina/chat/db'
import { getDatabase } from '@stina/adapters-node'
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

  return createProviderProducer({
    dispatcher,
    model: config.modelId,
    ...(config.settingsOverride ? { settings: config.settingsOverride } : {}),
  })
}
