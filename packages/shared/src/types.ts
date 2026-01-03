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
 * Represents a user-configured AI model that can be used for chat
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
  /** Whether this is the default model */
  isDefault: boolean
  /** Provider-specific settings overrides */
  settingsOverride?: Record<string, unknown>
  /** Creation timestamp */
  createdAt: string
  /** Last update timestamp */
  updatedAt: string
}
