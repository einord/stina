import type { ApiClient, ChatEvent, ChatStreamEvent, ChatStreamOptions } from '@stina/ui-vue'
import type { InstallLocalResult } from '@stina/extension-installer'

/**
 * Default user for local mode (no authentication required)
 */
const LOCAL_DEFAULT_USER = {
  id: 'local-default-user',
  username: 'local',
  displayName: 'Local User',
  role: 'admin' as const,
  createdAt: new Date(),
}

/**
 * Create a no-op auth client for local mode.
 * In Electron, no authentication is required - a default user is used automatically.
 */
function createLocalAuthClient(): ApiClient['auth'] {
  const notSupportedError = () =>
    Promise.reject(new Error('Authentication is not required in local mode'))

  return {
    getSetupStatus: () => Promise.resolve({ isFirstUser: false, setupCompleted: true }),
    completeSetup: () => Promise.resolve({ success: true }),
    getRegistrationOptions: notSupportedError,
    verifyRegistration: notSupportedError,
    getLoginOptions: notSupportedError,
    verifyLogin: notSupportedError,
    refresh: notSupportedError,
    logout: () => Promise.resolve({ success: true }),
    getMe: () => Promise.resolve(LOCAL_DEFAULT_USER),
    listUsers: () => Promise.resolve([LOCAL_DEFAULT_USER]),
    updateUserRole: notSupportedError,
    deleteUser: notSupportedError,
    createInvitation: notSupportedError,
    listInvitations: () => Promise.resolve([]),
    validateInvitation: () => Promise.resolve({ valid: false }),
    deleteInvitation: notSupportedError,
  }
}

/**
 * IPC-based API client for Electron renderer
 * Communicates with main process via preload-exposed electronAPI
 */
export function createIpcApiClient(): ApiClient {
  const api = window.electronAPI

  if (!api) {
    throw new Error('electronAPI not available. Are you running in Electron?')
  }

  return {
    auth: createLocalAuthClient(),
    getGreeting: (name?: string) => api.getGreeting(name),
    getThemes: () => api.getThemes(),
    getThemeTokens: (id: string) => api.getThemeTokens(id),
    getExtensions: () => api.getExtensions(),
    health: () => api.health(),
    reloadThemes: () => api.reloadThemes(),
    chat: {
      listConversations: () => api.chatListConversations(),
      getConversation: (id: string) => api.chatGetConversation(id),
      getLatestActiveConversation: () => api.chatGetLatestConversation(),
      getConversationInteractions: (conversationId: string, limit: number, offset: number) =>
        api.chatGetConversationInteractions(conversationId, limit, offset),
      countConversationInteractions: (conversationId: string) =>
        api.chatCountConversationInteractions(conversationId),
      sendMessage: (conversationId: string | null, message: string) =>
        api.chatSendMessage(conversationId, message),
      archiveConversation: (id: string) => api.chatArchiveConversation(id),
      createConversation: (id: string, title: string | undefined, createdAt: string) =>
        api.chatCreateConversation(id, title, createdAt),
      saveInteraction: (conversationId: string, interaction) =>
        api.chatSaveInteraction(conversationId, interaction),

      // Chat streaming via IPC events (Electron-specific)
      streamMessage: async (
        conversationId: string | null,
        message: string,
        options: ChatStreamOptions
      ): Promise<() => void> => {
        const { queueId, role, context, sessionId, onEvent } = options

        // Subscribe to stream events
        const unsubscribe = api.chatStreamSubscribe((event: ChatStreamEvent) => {
          // Only process events for this queue
          if (event.queueId !== queueId && event.type !== 'queue-update') {
            return
          }
          onEvent(event)
        })

        // Start the stream
        try {
          await api.chatStreamMessage(conversationId, message, {
            queueId,
            role,
            context,
            sessionId,
          })
        } catch (err) {
          unsubscribe()
          throw err
        }

        // Return cleanup function
        return () => {
          unsubscribe()
          // Optionally abort the stream
          void api.chatStreamAbort(sessionId, conversationId ?? undefined)
        }
      },

      // Queue operations (Electron-specific)
      abortStream: (sessionId?: string, conversationId?: string) =>
        api.chatStreamAbort(sessionId, conversationId),

      getQueueState: (sessionId?: string, conversationId?: string) =>
        api.chatQueueState(sessionId, conversationId),

      removeQueued: (id: string, sessionId?: string, conversationId?: string) =>
        api.chatQueueRemove(id, sessionId, conversationId),

      resetQueue: (sessionId?: string, conversationId?: string) =>
        api.chatQueueReset(sessionId, conversationId),

      // Multi-window synchronization
      subscribeToConversation: (
        conversationId: string,
        onEvent: (event: ChatStreamEvent) => void
      ) => api.chatConversationSubscribe(conversationId, onEvent),

      respondToToolConfirmation: (
        toolCallName: string,
        response: { approved: boolean; denialReason?: string },
        sessionId?: string,
        conversationId?: string
      ) => api.chatToolConfirmationRespond(toolCallName, response, sessionId, conversationId),
    },
    extensions: {
      getAvailable: () => api.getAvailableExtensions(),
      search: (query?: string, category?: string, verified?: boolean) =>
        api.searchExtensions(query, category, verified),
      getDetails: (id: string) => api.getExtensionDetails(id),
      getInstalled: () => api.getInstalledExtensions(),
      install: (extensionId: string, version?: string) =>
        api.installExtension(extensionId, version),
      uninstall: (extensionId: string) => api.uninstallExtension(extensionId),
      enable: (extensionId: string) => api.enableExtension(extensionId),
      disable: (extensionId: string) => api.disableExtension(extensionId),
      checkUpdates: () => api.checkExtensionUpdates(),
      update: (extensionId: string, version?: string) => api.updateExtension(extensionId, version),
      getSettings: (extensionId: string) => api.getExtensionSettings(extensionId),
      updateSetting: (extensionId: string, key: string, value: unknown) =>
        api.updateExtensionSetting(extensionId, key, value),
      getProviders: () => api.getExtensionProviders(),
      getProviderModels: (providerId: string, options?: { settings?: Record<string, unknown> }) =>
        api.getExtensionProviderModels(providerId, options),
      getTools: (extensionId: string) => api.getExtensionTools(extensionId),
      uploadLocal: async (file: File): Promise<InstallLocalResult> => {
        const buffer = await file.arrayBuffer()
        return api.uploadLocalExtension(buffer, file.name)
      },
    },
    modelConfigs: {
      list: () => api.modelConfigsList(),
      get: (id: string) => api.modelConfigsGet(id),
      create: (config) => api.modelConfigsCreate(config),
      update: (id: string, config) => api.modelConfigsUpdate(id, config),
      delete: (id: string) => api.modelConfigsDelete(id),
    },
    userDefaultModel: {
      get: () => api.userDefaultModelGet(),
      set: (modelConfigId: string | null) => api.userDefaultModelSet(modelConfigId),
    },
    tools: {
      getSettingsViews: () => api.getToolSettingsViews(),
      executeTool: (extensionId: string, toolId: string, params: Record<string, unknown>) =>
        api.executeTool(extensionId, toolId, params),
    },
    panels: {
      list: () => api.getPanelViews(),
    },
    actions: {
      list: () => api.getExtensionActions(),
      execute: (extensionId: string, actionId: string, params: Record<string, unknown>) =>
        api.executeAction(extensionId, actionId, params),
    },
    events: {
      subscribe: (handler) => api.subscribeExtensionEvents(handler),
    },
    chatEvents: {
      subscribe: (handler: (event: ChatEvent) => void) => api.chatEventsSubscribe(handler),
    },
    settings: {
      get: () => api.settingsGet(),
      update: async (settings) => {
        const updated = await api.settingsUpdate(settings)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('stina-settings-updated', { detail: updated }))
        }
        return updated
      },
      getTimezones: () => api.settingsGetTimezones(),
      quickCommands: {
        list: () => api.quickCommandsList(),
        get: (id: string) => api.quickCommandsGet(id),
        create: (cmd) => api.quickCommandsCreate(cmd),
        update: (id: string, cmd) => api.quickCommandsUpdate(id, cmd),
        delete: (id: string) => api.quickCommandsDelete(id),
        reorder: (ids: string[]) => api.quickCommandsReorder(ids),
      },
    },
  }
}
