import type {
  SettingDefinition,
  ProviderConfigSchema,
  ToolSettingsViewDefinition,
  PanelDefinition,
  LocalizedString,
  ModelInfo,
  ToolResult,
  ActionResult,
} from '@stina/extension-api'
import type { ThemeTokens } from '@stina/core'
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
  ScheduledJobSummaryDTO,
  ScheduledJobDetailDTO,
  ServerTimeResponse,
} from '@stina/shared'
import type {
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtensionInfo,
  InstallResult,
  InstallLocalResult,
} from '@stina/extension-installer'

/**
 * Configuration options for creating an HTTP API client.
 * Allows dependency injection of platform-specific behavior
 * (token storage, base URL, etc.).
 */
export interface ApiClientOptions {
  /**
   * Base URL for API requests (e.g., '/api' for web or 'https://example.com/api' for remote).
   */
  baseUrl: string

  /**
   * Retrieve the current access token, or null if not authenticated.
   */
  getAccessToken: () => string | null
}

// ── Auth types ──────────────────────────────────────────────────────────────

/**
 * User information
 */
export interface User {
  id: string
  username: string
  displayName?: string
  role: 'admin' | 'user'
  createdAt: Date
  lastLoginAt?: Date
}

/**
 * JWT token pair for authentication
 */
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Authentication state managed by useAuth composable
 */
export interface AuthState {
  user: User | null
  tokens: TokenPair | null
  isAuthenticated: boolean
  isLoading: boolean
}

/**
 * Device information sent during login
 */
export interface DeviceInfo {
  userAgent?: string
  platform?: string
  language?: string
}

/**
 * Invitation for new users
 */
export interface Invitation {
  id: string
  token: string
  username: string
  role: 'admin' | 'user'
  createdBy: string
  expiresAt: Date
  createdAt: Date
  usedAt?: Date
  usedBy?: string
}

/**
 * Setup status response
 */
export interface SetupStatus {
  isFirstUser: boolean
  setupCompleted: boolean
}

/**
 * Registration options response
 */
export interface RegistrationOptionsResponse {
  options: unknown
  isFirstUser: boolean
}

/**
 * Auth response with user and tokens
 */
export interface AuthResponse {
  user: User
  tokens: TokenPair
}

/**
 * Invitation validation response
 */
export interface InvitationValidation {
  valid: boolean
  username?: string
  role?: string
}

// ── API interface types ─────────────────────────────────────────────────────

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
  /** Whether this tool requires user confirmation before execution */
  requiresConfirmation: boolean
  /** Optional custom confirmation prompt */
  confirmationPrompt?: LocalizedString
}

/**
 * Tool confirmation override set by user
 */
export interface ToolConfirmationOverride {
  extensionId: string
  toolId: string
  requiresConfirmation: boolean
  updatedAt: string
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
 * Chat event payload for SSE notifications
 */
export interface ChatEvent {
  type: 'instruction-received' | 'conversation-updated' | 'interaction-saved' | 'conversation-created'
  userId: string
  conversationId?: string
  sessionId?: string
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
  | {
      type: 'interaction-started'
      interactionId: string
      conversationId: string
      role: string
      text: string
      queueId?: string
    }
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
  health(): Promise<{ ok: boolean; version?: string }>

  /** Get server time with timezone */
  getServerTime(): Promise<ServerTimeResponse>

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
    getQueueState?(
      sessionId?: string,
      conversationId?: string
    ): Promise<{
      queued: Array<{ id: string; role: 'user' | 'instruction'; preview: string }>
      isProcessing: boolean
    }>

    /**
     * Remove a queued message (optional, Electron-specific).
     */
    removeQueued?(
      id: string,
      sessionId?: string,
      conversationId?: string
    ): Promise<{ success: boolean }>

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

    /** Mark all interactions in a conversation as read */
    markRead(conversationId: string): Promise<void>

    /**
     * Subscribe to a conversation's event stream for real-time multi-client synchronization.
     * Returns an unsubscribe function to clean up the subscription.
     * This is optional - only implemented in platforms that support multi-client viewing.
     */
    subscribeToConversation?(
      conversationId: string,
      onEvent: (event: ChatStreamEvent) => void
    ): () => void

    /**
     * Respond to a pending tool confirmation.
     * This enables cross-client tool confirmation where any client viewing
     * the conversation can respond to the confirmation dialog.
     */
    respondToToolConfirmation?(
      toolCallName: string,
      response: { approved: boolean; denialReason?: string },
      sessionId?: string,
      conversationId?: string
    ): Promise<{ success: boolean; error?: string }>
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

    /** List installed extensions with validation status */
    getInstalled(): Promise<InstalledExtensionInfo[]>

    /** Install an extension */
    install(extensionId: string, version?: string): Promise<InstallResult>

    /** Uninstall an extension */
    uninstall(extensionId: string, deleteData?: boolean): Promise<{ success: boolean; error?: string }>

    /** Enable an extension */
    enable(extensionId: string): Promise<{ success: boolean }>

    /** Disable an extension */
    disable(extensionId: string): Promise<{ success: boolean }>

    /** Check for updates */
    checkUpdates(): Promise<
      Array<{ extensionId: string; currentVersion: string; latestVersion: string }>
    >

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

    /** Get tool confirmation overrides for an extension */
    getToolConfirmations(extensionId: string): Promise<ToolConfirmationOverride[]>

    /** Set tool confirmation override for a specific tool */
    setToolConfirmation(
      extensionId: string,
      toolId: string,
      requiresConfirmation: boolean
    ): Promise<{ success: boolean }>

    /** Remove tool confirmation override (revert to default) */
    removeToolConfirmation(extensionId: string, toolId: string): Promise<{ success: boolean }>

    /** Reset all tool confirmation overrides for an extension */
    resetToolConfirmations(extensionId: string): Promise<{ success: boolean }>

    /** Upload and install a local extension from a file */
    uploadLocal(file: File): Promise<InstallLocalResult>
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
    update(
      id: string,
      config: Partial<Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<ModelConfigDTO>

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
   * Chat event stream (optional, for real-time notifications)
   */
  chatEvents?: {
    /** Subscribe to chat events (instruction messages, conversation updates) */
    subscribe(handler: (event: ChatEvent) => void): () => void
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

  /**
   * Scheduled jobs endpoints
   */
  scheduledJobs: {
    /** List all scheduled jobs for the current user */
    list(): Promise<ScheduledJobSummaryDTO[]>

    /** Get details for a specific scheduled job */
    get(id: string): Promise<ScheduledJobDetailDTO>

    /** Delete a scheduled job */
    delete(id: string): Promise<{ success: boolean }>
  }
}
