/**
 * Greeting response from the hello endpoint/function
 */
export interface Greeting {
  message: string
  timestamp: string
}

/**
 * Health check response
 */
export interface HealthResponse {
  ok: boolean
}

/**
 * API error response
 */
export interface ApiError {
  error: {
    code: string
    message: string
  }
}

/**
 * Theme summary for listing
 */
export interface ThemeSummary {
  id: string
  label: string
}

/**
 * Extension summary for listing
 */
export interface ExtensionSummary {
  id: string
  name: string
  version: string
  type: 'feature' | 'theme'
}

/**
 * Chat message DTO (data transfer object for API)
 */
export interface ChatMessageDTO {
  type: 'user' | 'stina' | 'instruction' | 'information' | 'thinking' | 'tools'
  text?: string
  tools?: Array<{
    name: string
    /** User-friendly display name (localized) */
    displayName?: string
    payload: string
    result: string
  }>
  createdAt: string
}

/**
 * Chat interaction DTO
 */
export interface ChatInteractionDTO {
  id: string
  messages: ChatMessageDTO[]
  informationMessages: Array<{ text: string; createdAt: string }>
  createdAt: string
  /** Whether this interaction encountered an error */
  error: boolean
  /** Error message if the interaction failed */
  errorMessage?: string
}

/**
 * Chat conversation summary DTO (for listing)
 */
export interface ChatConversationSummaryDTO {
  id: string
  title?: string
  lastMessage?: string
  lastMessageAt: string
  active: boolean
}

/**
 * Chat conversation detail DTO (with full interactions)
 */
export interface ChatConversationDTO {
  id: string
  title?: string
  interactions: ChatInteractionDTO[]
  active: boolean
  createdAt: string
}

/**
 * Model configuration DTO
 * Represents a globally configured AI model that can be used for chat.
 * Admin manages model configs; user's default model choice is stored separately in user settings.
 */
export interface ModelConfigDTO {
  /** Unique identifier */
  id: string
  /** User-defined display name for this model configuration */
  name: string
  /** Provider ID (e.g., "ollama") */
  providerId: string
  /** Extension ID that provides this provider (e.g., "ollama-provider") */
  providerExtensionId: string
  /** Model ID within the provider (e.g., "llama3.2:8b") */
  modelId: string
  /** Provider-specific settings overrides */
  settingsOverride?: Record<string, unknown>
  /** Creation timestamp */
  createdAt: string
  /** Last update timestamp */
  updatedAt: string
}

/**
 * Application settings DTO
 * General user preferences for the application
 */
export interface AppSettingsDTO {
  /** Display language */
  language: 'en' | 'sv'
  /** IANA timezone (e.g., "Europe/Stockholm") */
  timezone: string
  /** UI theme */
  theme: 'light' | 'dark'
  /** Notification sound identifier or path */
  notificationSound: string
  /** User's first name (null to clear) */
  firstName?: string | null
  /** User's nickname (null to clear) */
  nickname?: string | null
  /** Enable debug mode */
  debugMode: boolean
  /** AI personality preset ID */
  personalityPreset: string
  /** Custom personality system prompt (when preset is "custom") */
  customPersonalityPrompt?: string
}

/**
 * Quick command DTO
 * User-defined shortcuts for common AI prompts
 */
export interface QuickCommandDTO {
  /** Unique identifier */
  id: string
  /** Icon name (from Hugeicons) */
  icon: string
  /** Command text/prompt to send */
  command: string
  /** Sort order for display */
  sortOrder: number
}
