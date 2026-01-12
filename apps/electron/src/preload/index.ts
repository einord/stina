import { contextBridge, ipcRenderer } from 'electron'
import type {
  Greeting,
  ThemeSummary,
  ExtensionSummary,
  ChatConversationSummaryDTO,
  ChatConversationDTO,
  ChatInteractionDTO,
  ModelConfigDTO,
  AppSettingsDTO,
  QuickCommandDTO,
} from '@stina/shared'
import type { ThemeTokens } from '@stina/core'
import type {
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtension,
  InstallResult,
} from '@stina/extension-installer'
import type { ExtensionEvent, PanelViewInfo, ToolSettingsViewInfo } from '@stina/ui-vue'
import type { ModelInfo, ToolResult, SettingDefinition, ActionResult } from '@stina/extension-api'

/**
 * API exposed to renderer process via context bridge
 */
const electronAPI = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('get-version'),

  getGreeting: (name?: string): Promise<Greeting> => ipcRenderer.invoke('get-greeting', name),

  getThemes: (): Promise<ThemeSummary[]> => ipcRenderer.invoke('get-themes'),

  getThemeTokens: (id: string): Promise<ThemeTokens> => ipcRenderer.invoke('get-theme-tokens', id),

  getExtensions: (): Promise<ExtensionSummary[]> => ipcRenderer.invoke('get-extensions'),

  health: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('health'),

  getToolSettingsViews: (): Promise<ToolSettingsViewInfo[]> =>
    ipcRenderer.invoke('get-tools-settings'),

  getPanelViews: (): Promise<PanelViewInfo[]> => ipcRenderer.invoke('get-panel-views'),
  subscribeExtensionEvents: (handler: (event: ExtensionEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ExtensionEvent) => {
      handler(payload)
    }

    ipcRenderer.on('extensions-event', listener)
    ipcRenderer.send('extensions-events-subscribe')

    return () => {
      ipcRenderer.removeListener('extensions-event', listener)
      ipcRenderer.send('extensions-events-unsubscribe')
    }
  },

  executeTool: (
    extensionId: string,
    toolId: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> => ipcRenderer.invoke('execute-tool', extensionId, toolId, params),

  // Actions
  getExtensionActions: (): Promise<Array<{ id: string; extensionId: string }>> =>
    ipcRenderer.invoke('extensions-get-actions'),
  executeAction: (
    extensionId: string,
    actionId: string,
    params: Record<string, unknown>
  ): Promise<ActionResult> => ipcRenderer.invoke('execute-action', extensionId, actionId, params),

  // Chat
  chatListConversations: (): Promise<ChatConversationSummaryDTO[]> =>
    ipcRenderer.invoke('chat-list-conversations'),
  chatGetConversation: (id: string): Promise<ChatConversationDTO> =>
    ipcRenderer.invoke('chat-get-conversation', id),
  chatGetLatestConversation: (): Promise<ChatConversationDTO | null> =>
    ipcRenderer.invoke('chat-get-latest-conversation'),
  chatGetConversationInteractions: (
    conversationId: string,
    limit: number,
    offset: number
  ): Promise<ChatInteractionDTO[]> =>
    ipcRenderer.invoke('chat-get-interactions', conversationId, limit, offset),
  chatCountConversationInteractions: (conversationId: string): Promise<number> =>
    ipcRenderer.invoke('chat-count-interactions', conversationId),
  chatArchiveConversation: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke('chat-archive-conversation', conversationId),
  chatCreateConversation: (
    id: string,
    title: string | undefined,
    createdAt: string
  ): Promise<ChatConversationDTO> =>
    ipcRenderer.invoke('chat-create-conversation', id, title, createdAt),
  chatSaveInteraction: (conversationId: string, interaction: ChatInteractionDTO): Promise<void> =>
    ipcRenderer.invoke('chat-save-interaction', conversationId, interaction),
  chatSendMessage: (conversationId: string | null, message: string): Promise<void> =>
    ipcRenderer.invoke('chat-send-message', conversationId, message),

  // Extensions
  getAvailableExtensions: (): Promise<ExtensionListItem[]> =>
    ipcRenderer.invoke('extensions-get-available'),
  searchExtensions: (
    query?: string,
    category?: string,
    verified?: boolean
  ): Promise<ExtensionListItem[]> =>
    ipcRenderer.invoke('extensions-search', query, category, verified),
  getExtensionDetails: (id: string): Promise<ExtensionDetails> =>
    ipcRenderer.invoke('extensions-get-details', id),
  getInstalledExtensions: (): Promise<InstalledExtension[]> =>
    ipcRenderer.invoke('extensions-get-installed'),
  installExtension: (extensionId: string, version?: string): Promise<InstallResult> =>
    ipcRenderer.invoke('extensions-install', extensionId, version),
  uninstallExtension: (extensionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('extensions-uninstall', extensionId),
  enableExtension: (extensionId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('extensions-enable', extensionId),
  disableExtension: (extensionId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('extensions-disable', extensionId),
  checkExtensionUpdates: (): Promise<
    Array<{ extensionId: string; currentVersion: string; latestVersion: string }>
  > => ipcRenderer.invoke('extensions-check-updates'),
  updateExtension: (extensionId: string, version?: string): Promise<InstallResult> =>
    ipcRenderer.invoke('extensions-update', extensionId, version),
  getExtensionSettings: (extensionId: string): Promise<{
    settings: Record<string, unknown>
    definitions: SettingDefinition[]
  }> => ipcRenderer.invoke('extensions-get-settings', extensionId),
  updateExtensionSetting: (
    extensionId: string,
    key: string,
    value: unknown
  ): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('extensions-update-setting', extensionId, key, value),
  getExtensionProviders: (): Promise<Array<{ id: string; name: string; extensionId: string }>> =>
    ipcRenderer.invoke('extensions-get-providers'),
  getExtensionProviderModels: (
    providerId: string,
    options?: { settings?: Record<string, unknown> }
  ): Promise<ModelInfo[]> =>
    ipcRenderer.invoke('extensions-get-provider-models', providerId, options),

  // Model configs
  modelConfigsList: (): Promise<ModelConfigDTO[]> => ipcRenderer.invoke('model-configs-list'),
  modelConfigsGet: (id: string): Promise<ModelConfigDTO> =>
    ipcRenderer.invoke('model-configs-get', id),
  modelConfigsCreate: (
    config: Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ModelConfigDTO> => ipcRenderer.invoke('model-configs-create', config),
  modelConfigsUpdate: (
    id: string,
    config: Partial<Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<ModelConfigDTO> => ipcRenderer.invoke('model-configs-update', id, config),
  modelConfigsDelete: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('model-configs-delete', id),
  modelConfigsSetDefault: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('model-configs-set-default', id),

  // Settings
  settingsGet: (): Promise<AppSettingsDTO> => ipcRenderer.invoke('settings-get'),
  settingsUpdate: (settings: Partial<AppSettingsDTO>): Promise<AppSettingsDTO> =>
    ipcRenderer.invoke('settings-update', settings),
  settingsGetTimezones: (): Promise<Array<{ id: string; label: string }>> =>
    ipcRenderer.invoke('settings-timezones'),

  // Quick commands
  quickCommandsList: (): Promise<QuickCommandDTO[]> => ipcRenderer.invoke('quick-commands-list'),
  quickCommandsGet: (id: string): Promise<QuickCommandDTO> =>
    ipcRenderer.invoke('quick-commands-get', id),
  quickCommandsCreate: (cmd: Omit<QuickCommandDTO, 'id'>): Promise<QuickCommandDTO> =>
    ipcRenderer.invoke('quick-commands-create', cmd),
  quickCommandsUpdate: (
    id: string,
    cmd: Partial<Omit<QuickCommandDTO, 'id'>>
  ): Promise<QuickCommandDTO> => ipcRenderer.invoke('quick-commands-update', id, cmd),
  quickCommandsDelete: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('quick-commands-delete', id),
  quickCommandsReorder: (ids: string[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('quick-commands-reorder', ids),

  // Dev: re-register themes to pick up tokenSpec changes without full restart
  reloadThemes: (): Promise<void> => ipcRenderer.invoke('reload-themes'),
}

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration for the exposed API
export type ElectronAPI = typeof electronAPI

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
