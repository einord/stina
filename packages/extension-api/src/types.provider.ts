/**
 * AI Provider Types
 *
 * Types for AI providers, models, and chat interactions.
 */

import type { ToolDefinition } from './types.contributions.js'

/**
 * AI provider implementation
 */
export interface AIProvider {
  /** Provider ID (must match manifest) */
  id: string
  /** Display name */
  name: string

  /**
   * Get available models from this provider
   * @param options Optional settings for the provider (e.g., URL)
   */
  getModels(options?: GetModelsOptions): Promise<ModelInfo[]>

  /**
   * Chat completion with streaming
   */
  chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent, void, unknown>

  /**
   * Optional: Generate embeddings
   */
  embed?(texts: string[]): Promise<number[][]>
}

/**
 * Model information
 */
export interface ModelInfo {
  /** Model ID */
  id: string
  /** Display name */
  name: string
  /** Description */
  description?: string
  /** Context window size */
  contextLength?: number
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  /** For assistant messages: tool calls made by the model */
  tool_calls?: ToolCall[]
  /** For tool messages: the ID of the tool call this is a response to */
  tool_call_id?: string
}

/**
 * A tool call made by the model
 */
export interface ToolCall {
  /** Unique ID for this tool call */
  id: string
  /** Tool name/ID to invoke */
  name: string
  /** Arguments for the tool (as parsed object) */
  arguments: Record<string, unknown>
}

/**
 * Options for chat completion
 */
export interface ChatOptions {
  /** Model to use */
  model?: string
  /** Temperature (0-1) */
  temperature?: number
  /** Maximum tokens to generate */
  maxTokens?: number
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Provider-specific settings from model configuration */
  settings?: Record<string, unknown>
  /** Request context (user info, session metadata — not provider config) */
  context?: { userId?: string; [key: string]: unknown }
  /** Available tools for this request */
  tools?: ToolDefinition[]
}

/**
 * Options for getModels
 */
export interface GetModelsOptions {
  /** Provider-specific settings (e.g., URL for Ollama) */
  settings?: Record<string, unknown>
}

/**
 * Streaming events from chat
 */
export type StreamEvent =
  | { type: 'content'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_start'; name: string; input: unknown; toolCallId: string }
  | { type: 'tool_end'; name: string; output: unknown; toolCallId: string }
  | { type: 'done'; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; message: string }
