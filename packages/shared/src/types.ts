import type { NotificationSoundId } from './notifications.js'

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
  version?: string
}

/**
 * Server time response with timezone information
 */
export interface ServerTimeResponse {
  /** ISO 8601 timestamp with timezone offset */
  iso: string
  /** Unix timestamp in milliseconds */
  epochMs: number
  /** IANA timezone identifier (e.g., "Europe/Stockholm") */
  timezone: string
  /** Display language */
  language: 'en' | 'sv'
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
    /** Confirmation status - only set for tools that require confirmation */
    confirmationStatus?: 'pending' | 'approved' | 'denied'
    /** Prompt shown to user (from tool definition or AI custom message) */
    confirmationPrompt?: string
    /** User's response when denied with text */
    confirmationDenialReason?: string
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
  /** Provider ID (e.g., "my-provider") */
  providerId: string
  /** Extension ID that provides this provider (e.g., "my-provider-extension") */
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
  notificationSound: NotificationSoundId
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

/**
 * Scheduled job summary DTO (for listing)
 */
export interface ScheduledJobSummaryDTO {
  /** Composite ID "extensionId:jobId" */
  id: string
  /** Extension that registered the job */
  extensionId: string
  /** Job identifier within the extension */
  jobId: string
  /** User who owns the job */
  userId: string
  /** Type of schedule */
  scheduleType: 'at' | 'cron' | 'interval'
  /** Human-readable schedule description */
  scheduleDescription: string
  /** Next scheduled run time (ISO string) */
  nextRunAt: string | null
  /** Last run time (ISO string) */
  lastRunAt: string | null
  /** Whether the job is enabled */
  enabled: boolean
  /** Creation timestamp (ISO string) */
  createdAt: string
}

/**
 * Scheduled job detail DTO (with full information)
 */
export interface ScheduledJobDetailDTO extends ScheduledJobSummaryDTO {
  /** Raw schedule value (date/cron/ms) */
  scheduleValue: string
  /** Timezone for cron jobs */
  timezone: string | null
  /** Misfire policy */
  misfirePolicy: 'run_once' | 'skip'
  /** Job payload data */
  payload: Record<string, unknown> | null
  /** Resolved extension name */
  extensionName: string | null
}
