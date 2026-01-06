import type { ApiClient } from '@stina/ui-vue'

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
    },
    modelConfigs: {
      list: () => api.modelConfigsList(),
      get: (id: string) => api.modelConfigsGet(id),
      create: (config) => api.modelConfigsCreate(config),
      update: (id: string, config) => api.modelConfigsUpdate(id, config),
      delete: (id: string) => api.modelConfigsDelete(id),
      setDefault: (id: string) => api.modelConfigsSetDefault(id),
    },
    tools: {
      getSettingsViews: () => api.getToolSettingsViews(),
      executeTool: (extensionId: string, toolId: string, params: Record<string, unknown>) =>
        api.executeTool(extensionId, toolId, params),
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
