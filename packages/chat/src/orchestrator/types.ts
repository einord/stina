import type { Conversation, Interaction, Message, ToolCall, InformationMessage } from '../types/index.js'
import type { SettingsStore } from '@stina/core'
import type { IConversationRepository } from './IConversationRepository.js'
import type { ProviderRegistry } from '../providers/ProviderRegistry.js'
import type { ToolRegistry } from '../tools/ToolRegistry.js'
import type { QueueState, QueuedMessageRole } from './ChatMessageQueue.js'

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
export interface OrchestratorEventContext {
  queueId?: string
}

export type OrchestratorEvent =
  | ({ type: 'thinking-update'; text: string } & OrchestratorEventContext)
  | ({ type: 'thinking-done' } & OrchestratorEventContext)
  | ({ type: 'content-update'; text: string } & OrchestratorEventContext)
  | ({ type: 'tool-start'; name: string } & OrchestratorEventContext)
  | ({ type: 'tool-complete'; tool: ToolCall } & OrchestratorEventContext)
  | ({ type: 'stream-complete'; messages: Message[] } & OrchestratorEventContext)
  | ({ type: 'stream-error'; error: Error } & OrchestratorEventContext)
  | ({
      type: 'interaction-started'
      interactionId: string
      conversationId: string
      role: QueuedMessageRole
      text: string
      systemPrompt?: string
      informationMessages?: InformationMessage[]
    } & OrchestratorEventContext)
  | ({ type: 'interaction-saved'; interaction: Interaction } & OrchestratorEventContext)
  | ({ type: 'conversation-created'; conversation: Conversation } & OrchestratorEventContext)
  | ({ type: 'queue-update'; queue: QueueState } & OrchestratorEventContext)
  | ({ type: 'state-change' } & OrchestratorEventContext)

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
  queue: QueueState
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
  /** User ID for tool execution context */
  userId?: string
  /** Repository for persistence */
  repository: IConversationRepository
  /** Registry of AI providers */
  providerRegistry: ProviderRegistry
  /** Optional settings store for system prompt override */
  settingsStore?: SettingsStore
  /** Optional model config provider for per-model settings */
  modelConfigProvider?: IModelConfigProvider
  /** Optional tool registry for tool execution */
  toolRegistry?: ToolRegistry
  /**
   * Get the localized display name for a tool.
   * If not provided, tool IDs will be used as display names.
   */
  getToolDisplayName?: (toolId: string) => string | undefined
}
