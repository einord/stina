import { randomUUID } from 'node:crypto'
import { ChatOrchestrator } from '@stina/chat/orchestrator'
import {
  ConversationRepository,
  ModelConfigRepository,
  UserSettingsRepository,
  AppSettingsStore,
  ToolConfirmationRepository,
} from '@stina/chat/db'
import type { ChatDb } from '@stina/chat/db'
import {
  providerRegistry,
  toolRegistry,
  ConversationEventBus,
  PendingConfirmationStore,
  ChatSessionManager,
} from '@stina/chat'
import { getDatabase } from '@stina/adapters-node'
import { asChatDb } from '../../asChatDb.js'
import { resolveLocalizedString } from '@stina/extension-api'
import { APP_NAMESPACE } from '@stina/core'
import { emitChatEvent } from './eventBroadcaster.js'

/**
 * Global event bus for broadcasting orchestrator events to multiple clients per conversation.
 */
export const conversationEventBus = new ConversationEventBus()

/**
 * Global store for pending tool confirmations.
 */
export const pendingConfirmationStore = new PendingConfirmationStore()

/**
 * Simple async mutex implementation to prevent race conditions.
 * Ensures only one async operation can proceed at a time per key.
 */
class AsyncMutex {
  private locks = new Map<string, Promise<void>>()

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key)
    }

    let releaseLock: () => void
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    this.locks.set(key, lockPromise)

    try {
      return await fn()
    } finally {
      this.locks.delete(key)
      releaseLock!()
    }
  }
}

/**
 * Map to hold session managers per user.
 */
const userSessionManagers = new Map<string, ChatSessionManager>()

/**
 * Track last access time per user for idle cleanup.
 */
const userSessionLastAccess = new Map<string, number>()

/** Idle timeout for session managers: 30 minutes */
const SESSION_MANAGER_IDLE_MS = 30 * 60 * 1000

/**
 * Periodically clean up session managers that haven't been accessed recently.
 * Runs every 5 minutes.
 */
const sessionCleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [userId, lastAccess] of userSessionLastAccess) {
    if (now - lastAccess > SESSION_MANAGER_IDLE_MS) {
      const manager = userSessionManagers.get(userId)
      if (manager) {
        manager.destroyAllSessions()
        userSessionManagers.delete(userId)
      }
      userSessionLastAccess.delete(userId)
    }
  }
}, 5 * 60 * 1000)
sessionCleanupInterval.unref()

const sessionManagerMutex = new AsyncMutex()

// Lazy-initialized database reference
let _db: ChatDb | null = null
const getDb = (): ChatDb => {
  if (!_db) {
    _db = asChatDb(getDatabase())
  }
  return _db
}

// Model config repo (singleton, global)
let _modelConfigRepo: ModelConfigRepository | null = null
const getModelConfigRepo = (): ModelConfigRepository => {
  if (!_modelConfigRepo) {
    _modelConfigRepo = new ModelConfigRepository(getDb())
  }
  return _modelConfigRepo
}

/**
 * Helper functions for session management
 */
const createUserRepository = (userId: string) => new ConversationRepository(getDb(), userId)
const createUserSettingsRepository = (userId: string) => new UserSettingsRepository(getDb(), userId)

const createUserModelConfigProvider = (userId: string) => ({
  async getDefault() {
    const userSettingsRepo = createUserSettingsRepository(userId)
    const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
    if (!defaultModelId) return null

    const config = await getModelConfigRepo().get(defaultModelId)
    if (!config) return null

    return {
      providerId: config.providerId,
      modelId: config.modelId,
      settingsOverride: config.settingsOverride,
    }
  },
})

export const createToolDisplayNameResolver = (userLanguage: string) => {
  return (toolId: string): string | undefined => {
    const tool = toolRegistry.get(toolId)
    if (!tool) return undefined
    return resolveLocalizedString(tool.name, userLanguage, 'en')
  }
}

function createSessionManager(userId: string, deps: {
  repository: ConversationRepository
  modelConfigProvider: ReturnType<typeof createUserModelConfigProvider>
  settingsStore: AppSettingsStore
  getToolDisplayName: ReturnType<typeof createToolDisplayNameResolver>
  userLanguage: string
}): ChatSessionManager {
  return new ChatSessionManager(
    () =>
      new ChatOrchestrator(
        {
          userId,
          repository: deps.repository,
          providerRegistry,
          modelConfigProvider: deps.modelConfigProvider,
          toolRegistry,
          settingsStore: deps.settingsStore,
          getToolDisplayName: deps.getToolDisplayName,
          userLanguage: deps.userLanguage,
          eventBus: conversationEventBus,
          confirmationStore: pendingConfirmationStore,
          subscriberId: randomUUID(),
          getToolConfirmationOverride: async (extensionId, toolId) => {
            const repo = new ToolConfirmationRepository(getDb(), userId)
            return repo.get(extensionId, toolId)
          },
        },
        { pageSize: 10 }
      )
  )
}

async function buildSessionDeps(userId: string, overrides?: {
  getRepository?: (userId: string) => ConversationRepository
  getUserSettingsRepo?: (userId: string) => UserSettingsRepository
  getModelConfigProvider?: (userId: string) => ReturnType<typeof createUserModelConfigProvider>
  getToolDisplayName?: (lang: string) => ReturnType<typeof createToolDisplayNameResolver>
}) {
  const repository = overrides?.getRepository
    ? overrides.getRepository(userId)
    : createUserRepository(userId)
  const modelConfigProvider = overrides?.getModelConfigProvider
    ? overrides.getModelConfigProvider(userId)
    : createUserModelConfigProvider(userId)

  const userSettingsRepo = overrides?.getUserSettingsRepo
    ? overrides.getUserSettingsRepo(userId)
    : createUserSettingsRepository(userId)
  const userSettings = await userSettingsRepo.get()
  const settingsStore = new AppSettingsStore(userSettings)

  const userLanguage = settingsStore.get<string>(APP_NAMESPACE, 'language') ?? 'en'
  const getToolDisplayName = overrides?.getToolDisplayName
    ? overrides.getToolDisplayName(userLanguage)
    : createToolDisplayNameResolver(userLanguage)

  return { repository, modelConfigProvider, settingsStore, getToolDisplayName, userLanguage }
}

/**
 * Get or create a session manager for a user (module-level for use outside routes).
 */
export async function getOrCreateSessionManager(userId: string): Promise<ChatSessionManager> {
  return sessionManagerMutex.acquire(userId, async () => {
    userSessionLastAccess.set(userId, Date.now())
    let manager = userSessionManagers.get(userId)
    if (!manager) {
      const deps = await buildSessionDeps(userId)
      manager = createSessionManager(userId, deps)
      userSessionManagers.set(userId, manager)
    }
    return manager
  })
}

/**
 * Get or create a session manager for a user (route-level, with overridable deps).
 */
export async function getSessionManager(userId: string, overrides?: Parameters<typeof buildSessionDeps>[1]): Promise<ChatSessionManager> {
  return sessionManagerMutex.acquire(userId, async () => {
    userSessionLastAccess.set(userId, Date.now())
    let manager = userSessionManagers.get(userId)
    if (!manager) {
      const deps = await buildSessionDeps(userId, overrides)
      manager = createSessionManager(userId, deps)
      userSessionManagers.set(userId, manager)
    }
    return manager
  })
}

/**
 * Invalidate a user's session manager when their settings change.
 */
export async function invalidateUserSessionManager(userId: string): Promise<void> {
  await sessionManagerMutex.acquire(userId, async () => {
    const manager = userSessionManagers.get(userId)
    if (manager) {
      manager.destroyAllSessions()
      userSessionManagers.delete(userId)
    }
    userSessionLastAccess.delete(userId)
  })
}

/**
 * Queue an instruction message through an existing session (if available) or create a new one.
 */
export async function queueInstructionForUser(
  userId: string,
  message: string,
  conversationId?: string,
  logger?: { error: (msg: string, context?: Record<string, unknown>) => void }
): Promise<{ queued: boolean; conversationId?: string }> {
  try {
    const manager = await getOrCreateSessionManager(userId)

    const session = manager.getSession({ conversationId })
    const orchestrator = session.orchestrator

    if (conversationId && orchestrator.conversation?.id !== conversationId) {
      await orchestrator.loadConversation(conversationId)
    } else if (!orchestrator.conversation) {
      const loaded = await orchestrator.loadLatestConversation()
      if (!loaded) {
        await orchestrator.createConversation()
      }
    }

    if (orchestrator.conversation && !session.conversationId) {
      manager.registerConversation(session.id, orchestrator.conversation.id)
    }

    await orchestrator.enqueueMessage(message, 'instruction')

    const resultConversationId = orchestrator.conversation?.id

    emitChatEvent({
      type: 'instruction-received',
      userId,
      conversationId: resultConversationId,
    })

    return {
      queued: true,
      conversationId: resultConversationId,
    }
  } catch (error) {
    logger?.error('Failed to queue instruction for user', { userId, error })
    return { queued: false }
  }
}
