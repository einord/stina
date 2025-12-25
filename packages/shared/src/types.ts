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
