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
import type {
  User,
  DeviceInfo,
  Invitation,
  SetupStatus,
  RegistrationOptionsResponse,
  AuthResponse,
  InvitationValidation,
} from '../types/auth.js'
import type { ThemeTokens } from '@stina/core'
import type {
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtension,
  InstallResult,
} from '@stina/extension-installer'
import type {
  SettingDefinition,
  ModelInfo,
  ProviderConfigSchema,
  ToolSettingsViewDefinition,
  PanelDefinition,
  ToolResult,
  ActionResult,
  LocalizedString,
} from '@stina/extension-api'

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
  /** Schema for provider-specific configuration UI */
  configSchema?: ProviderConfigSchema
  /** Default settings for this provider */
  defaultSettings?: Record<string, unknown>
}

/**
 * Tool settings view from extension host
 */
export interface ToolSettingsViewInfo extends ToolSettingsViewDefinition {
  extensionId: string
  extensionName: string
}

/**
 * Panel view from extension host
 */
export interface PanelViewInfo extends PanelDefinition {
  extensionId: string
  extensionName: string
}

/**
 * Tool info from extension host
 */
export interface ExtensionToolInfo {
  id: string
  name: LocalizedString
  description: LocalizedString
  parameters?: Record<string, unknown>
}

/**
 * Action info from extension host
 */
export interface ActionInfo {
  id: string
  extensionId: string
}

/**
 * Extension event payload
 */
export interface ExtensionEvent {
  extensionId: string
  name: string
  payload?: Record<string, unknown>
}

/**
 * Chat stream event types
 */
export type ChatStreamEvent =
  | { type: 'thinking-update'; text: string; queueId?: string }
  | { type: 'content-update'; text: string; queueId?: string }
  | { type: 'tool-start'; name: string; queueId?: string }
  | { type: 'tool-complete'; tool: unknown; queueId?: string }
  | { type: 'stream-complete'; messages: unknown[]; queueId?: string }
  | { type: 'stream-error'; error: string; queueId?: string }
  | { type: 'interaction-saved'; interaction: ChatInteractionDTO; queueId?: string }
  | { type: 'conversation-created'; conversation: ChatConversationDTO; queueId?: string }
  | { type: 'interaction-started'; interactionId: string; conversationId: string; role: string; text: string; queueId?: string }
  | { type: 'queue-update'; queue: unknown; queueId?: string }

/**
 * Options for streaming a chat message
 */
export interface ChatStreamOptions {
  queueId: string
  role?: 'user' | 'instruction'
  context?: 'conversation-start' | 'settings-update'
  sessionId?: string
  onEvent: (event: ChatStreamEvent) => void
}

/**
 * API client interface that can be implemented differently for web (HTTP) and Electron (IPC)
 */
export interface ApiClient {
  /**
   * Authentication endpoints
   */
  auth: {
    /** Get setup status - check if this is first user */
    getSetupStatus(): Promise<SetupStatus>

    /** Complete domain setup (first time configuration) */
    completeSetup(rpId: string, rpOrigin: string): Promise<{ success: boolean }>

    /** Get registration options for WebAuthn */
    getRegistrationOptions(
      username: string,
      displayName?: string,
      invitationToken?: string
    ): Promise<RegistrationOptionsResponse>

    /** Verify registration and create user */
    verifyRegistration(
      username: string,
      credential: unknown,
      invitationToken?: string
    ): Promise<AuthResponse>

    /** Get login options for WebAuthn */
    getLoginOptions(username?: string): Promise<unknown>

    /** Verify login and get tokens */
    verifyLogin(credential: unknown, deviceInfo?: DeviceInfo): Promise<AuthResponse>

    /** Refresh access token using refresh token */
    refresh(refreshToken: string): Promise<AuthResponse>

    /** Logout and invalidate refresh token */
    logout(refreshToken: string): Promise<{ success: boolean }>

    /** Get current user info */
    getMe(): Promise<User>

    /** List all users (admin only) */
    listUsers(): Promise<User[]>

    /** Update user role (admin only) */
    updateUserRole(id: string, role: 'admin' | 'user'): Promise<User>

    /** Delete a user (admin only) */
    deleteUser(id: string): Promise<{ success: boolean }>

    /** Create an invitation for a new user (admin only) */
    createInvitation(
      username: string,
      role?: 'admin' | 'user'
    ): Promise<{ token: string; expiresAt: Date }>

    /** List all invitations (admin only) */
    listInvitations(): Promise<Invitation[]>

    /** Validate an invitation token */
    validateInvitation(token: string): Promise<InvitationValidation>

    /** Delete an invitation (admin only) */
    deleteInvitation(id: string): Promise<{ success: boolean }>
  }

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

    /** Send a message (starts streaming) - legacy, use streamMessage instead */
    sendMessage(conversationId: string | null, message: string): Promise<void>

    /**
     * Stream a chat message and receive events via callback.
     * Returns a cleanup function to abort the stream.
     * This is the preferred method for chat streaming as it works across platforms.
     */
    streamMessage?(
      conversationId: string | null,
      message: string,
      options: ChatStreamOptions
    ): Promise<() => void>

    /**
     * Abort current streaming (optional, Electron-specific).
     */
    abortStream?(sessionId?: string, conversationId?: string): Promise<{ success: boolean }>

    /**
     * Get current queue state (optional, Electron-specific).
     * Returns QueueState compatible type.
     */
    getQueueState?(sessionId?: string, conversationId?: string): Promise<{
      queued: Array<{ id: string; role: 'user' | 'instruction'; preview: string }>
      isProcessing: boolean
    }>

    /**
     * Remove a queued message (optional, Electron-specific).
     */
    removeQueued?(id: string, sessionId?: string, conversationId?: string): Promise<{ success: boolean }>

    /**
     * Reset conversation and clear queue (optional, Electron-specific).
     */
    resetQueue?(sessionId?: string, conversationId?: string): Promise<{ success: boolean }>

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

    /** Get tools registered by an extension */
    getTools(extensionId: string): Promise<ExtensionToolInfo[]>
  }

  /**
   * Model configuration endpoints (global - admin managed)
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
  }

  /**
   * User's default model endpoints (per-user setting)
   */
  userDefaultModel: {
    /** Get the user's default model configuration */
    get(): Promise<ModelConfigDTO | null>

    /** Set the user's default model configuration */
    set(modelConfigId: string | null): Promise<{ success: boolean }>
  }

  /**
   * Tool settings endpoints
   */
  tools: {
    /** List tool settings views for enabled extensions */
    getSettingsViews(): Promise<ToolSettingsViewInfo[]>

    /** Execute a tool */
    executeTool(
      extensionId: string,
      toolId: string,
      params: Record<string, unknown>
    ): Promise<ToolResult>
  }

  /**
   * Panel endpoints
   */
  panels: {
    /** List right panel definitions for enabled extensions */
    list(): Promise<PanelViewInfo[]>
  }

  /**
   * Actions endpoints
   */
  actions: {
    /** List registered actions from enabled extensions */
    list(): Promise<ActionInfo[]>

    /** Execute an action */
    execute(
      extensionId: string,
      actionId: string,
      params: Record<string, unknown>
    ): Promise<ActionResult>
  }

  /**
   * Extension event stream
   */
  events: {
    /** Subscribe to extension events */
    subscribe(handler: (event: ExtensionEvent) => void): () => void
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
