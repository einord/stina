import { inject } from 'vue'
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
import type { SettingDefinition, ModelInfo } from '@stina/extension-api'

/**
 * Extension settings response
 */
export interface ExtensionSettingsResponse {
  settings: Record<string, unknown>
  definitions: SettingDefinition[]
}

/**
 * Provider info from extension host
 */
export interface ProviderInfo {
  id: string
  name: string
  extensionId: string
}

/**
 * API client interface that can be implemented differently for web (HTTP) and Electron (IPC)
 */
export interface ApiClient {
  /** Get a greeting message */
  getGreeting(name?: string): Promise<Greeting>

  /** Get list of available themes */
  getThemes(): Promise<ThemeSummary[]>

  /** Get theme tokens by id */
  getThemeTokens(id: string): Promise<ThemeTokens>

  /** Get list of registered extensions */
  getExtensions(): Promise<ExtensionSummary[]>

  /** Health check */
  health(): Promise<{ ok: boolean }>

  /**
   * Reload themes in the backend (optional).
   * Implemented in Electron to rebuild theme registry during development.
   */
  reloadThemes?: () => Promise<void>

  /**
   * Chat endpoints
   */
  chat: {
    /** List active conversations */
    listConversations(): Promise<ChatConversationSummaryDTO[]>

    /** Get conversation with interactions */
    getConversation(id: string): Promise<ChatConversationDTO>

    /** Get latest active conversation (without interactions) */
    getLatestActiveConversation(): Promise<ChatConversationDTO | null>

    /** Get interactions for a conversation with pagination */
    getConversationInteractions(
      conversationId: string,
      limit: number,
      offset: number
    ): Promise<ChatInteractionDTO[]>

    /** Count total interactions for a conversation */
    countConversationInteractions(conversationId: string): Promise<number>

    /** Send a message (starts streaming) */
    sendMessage(conversationId: string | null, message: string): Promise<void>

    /** Archive a conversation */
    archiveConversation(id: string): Promise<void>

    /** Create a new conversation */
    createConversation(
      id: string,
      title: string | undefined,
      createdAt: string
    ): Promise<ChatConversationDTO>

    /** Save an interaction */
    saveInteraction(conversationId: string, interaction: ChatInteractionDTO): Promise<void>
  }

  /**
   * Extension management endpoints
   */
  extensions: {
    /** List available extensions from registry */
    getAvailable(): Promise<ExtensionListItem[]>

    /** Search extensions in registry */
    search(query?: string, category?: string, verified?: boolean): Promise<ExtensionListItem[]>

    /** Get extension details from registry */
    getDetails(id: string): Promise<ExtensionDetails>

    /** List installed extensions */
    getInstalled(): Promise<InstalledExtension[]>

    /** Install an extension */
    install(extensionId: string, version?: string): Promise<InstallResult>

    /** Uninstall an extension */
    uninstall(extensionId: string): Promise<{ success: boolean; error?: string }>

    /** Enable an extension */
    enable(extensionId: string): Promise<{ success: boolean }>

    /** Disable an extension */
    disable(extensionId: string): Promise<{ success: boolean }>

    /** Check for updates */
    checkUpdates(): Promise<Array<{ extensionId: string; currentVersion: string; latestVersion: string }>>

    /** Update an extension */
    update(extensionId: string, version?: string): Promise<InstallResult>

    /** Get settings for an extension */
    getSettings(extensionId: string): Promise<ExtensionSettingsResponse>

    /** Update a setting for an extension */
    updateSetting(extensionId: string, key: string, value: unknown): Promise<{ success: boolean }>

    /** Get registered providers */
    getProviders(): Promise<ProviderInfo[]>

    /** Get available models from a provider */
    getProviderModels(
      providerId: string,
      options?: { settings?: Record<string, unknown> }
    ): Promise<ModelInfo[]>
  }

  /**
   * Model configuration endpoints
   */
  modelConfigs: {
    /** List all configured models */
    list(): Promise<ModelConfigDTO[]>

    /** Get a specific model config */
    get(id: string): Promise<ModelConfigDTO>

    /** Create a new model config */
    create(config: Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelConfigDTO>

    /** Update a model config */
    update(id: string, config: Partial<Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ModelConfigDTO>

    /** Delete a model config */
    delete(id: string): Promise<{ success: boolean }>

    /** Set a model as default */
    setDefault(id: string): Promise<{ success: boolean }>
  }

  /**
   * App settings endpoints
   */
  settings: {
    /** Get all app settings */
    get(): Promise<AppSettingsDTO>

    /** Update app settings (partial update) */
    update(settings: Partial<AppSettingsDTO>): Promise<AppSettingsDTO>

    /** Get available timezones */
    getTimezones(): Promise<Array<{ id: string; label: string }>>

    /** Quick commands */
    quickCommands: {
      /** List all quick commands */
      list(): Promise<QuickCommandDTO[]>

      /** Get a specific quick command */
      get(id: string): Promise<QuickCommandDTO>

      /** Create a new quick command */
      create(cmd: Omit<QuickCommandDTO, 'id'>): Promise<QuickCommandDTO>

      /** Update a quick command */
      update(id: string, cmd: Partial<Omit<QuickCommandDTO, 'id'>>): Promise<QuickCommandDTO>

      /** Delete a quick command */
      delete(id: string): Promise<{ success: boolean }>

      /** Reorder quick commands */
      reorder(ids: string[]): Promise<{ success: boolean }>
    }
  }
}

/** Injection key for ApiClient */
export const apiClientKey = Symbol('apiClient') as symbol

/**
 * Composable to access the API client
 * The actual implementation is provided by the app (web or electron)
 */
export function useApi(): ApiClient {
  const client = inject<ApiClient>(apiClientKey)
  if (!client) {
    throw new Error('ApiClient not provided. Make sure to provide it in the app root.')
  }
  return client
}
