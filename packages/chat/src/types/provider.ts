import type { Message } from './message.js'

/**
 * Streaming events from AI provider
 */
export type StreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; payload: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'content'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: Error }

/**
 * Options for sendMessage call
 */
export interface SendMessageOptions {
  /** Provider-specific settings (e.g., URL for Ollama) */
  settings?: Record<string, unknown>
  /** Model ID to use */
  modelId?: string
}

/**
 * AI Provider interface
 * Extensions implement this to provide AI functionality
 */
export interface AIProvider {
  /**
   * Provider identifier (e.g., 'anthropic', 'openai', 'echo')
   */
  id: string

  /**
   * Display name
   */
  name: string

  /**
   * Send a message and get streaming response
   * @param messages - Conversation history
   * @param systemPrompt - System prompt to use
   * @param onEvent - Callback for streaming events
   * @param options - Optional settings and model config
   */
  sendMessage(
    messages: Message[],
    systemPrompt: string,
    onEvent: (event: StreamEvent) => void,
    options?: SendMessageOptions
  ): Promise<void>
}
