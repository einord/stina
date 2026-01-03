import type { Conversation, Interaction, Message, ToolCall } from '../types/index.js'
import type { SettingsStore } from '@stina/core'
import type { IConversationRepository } from './IConversationRepository.js'
import type { ProviderRegistry } from '../providers/ProviderRegistry.js'

/**
 * Model configuration for chat
 */
export interface ChatModelConfig {
  providerId: string
  modelId: string
  settingsOverride?: Record<string, unknown>
}

/**
 * Interface for fetching model configuration
 */
export interface IModelConfigProvider {
  /** Get the default model configuration */
  getDefault(): Promise<ChatModelConfig | null>
}

/**
 * Events emitted by ChatOrchestrator during streaming
 */
export type OrchestratorEvent =
  | { type: 'thinking-update'; text: string }
  | { type: 'content-update'; text: string }
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; tool: ToolCall }
  | { type: 'stream-complete'; messages: Message[] }
  | { type: 'stream-error'; error: Error }
  | { type: 'interaction-saved'; interaction: Interaction }
  | { type: 'conversation-created'; conversation: Conversation }
  | { type: 'state-change' }

/**
 * State snapshot from orchestrator
 */
export interface ChatState {
  conversation: Conversation | null
  currentInteraction: Interaction | null
  loadedInteractions: Interaction[]
  totalInteractionsCount: number
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  streamingTools: string[]
  error: Error | null
}

/**
 * Options for ChatOrchestrator
 */
export interface ChatOrchestratorOptions {
  /** Number of interactions to load per page */
  pageSize?: number
}

/**
 * Dependencies injected into ChatOrchestrator
 */
export interface ChatOrchestratorDeps {
  /** Repository for persistence */
  repository: IConversationRepository
  /** Registry of AI providers */
  providerRegistry: ProviderRegistry
  /** Optional settings store for system prompt override */
  settingsStore?: SettingsStore
  /** Optional model config provider for per-model settings */
  modelConfigProvider?: IModelConfigProvider
}
