import { inject } from 'vue'
import type {
  Greeting,
  ThemeSummary,
  ExtensionSummary,
  ChatConversationSummaryDTO,
  ChatConversationDTO,
  ChatInteractionDTO,
} from '@stina/shared'
import type { ThemeTokens } from '@stina/core'

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
