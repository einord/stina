// Constants
export { STINA_NO_REPLY, getSystemPrompt } from './constants/index.js'

// Types
export type {
  Message,
  MessageType,
  MessageMetadata,
  UserMessage,
  StinaMessage,
  InstructionMessage,
  InformationMessage,
  ThinkingMessage,
  ToolsMessage,
  ToolCall,
} from './types/message.js'

export { MessageType as MessageTypeEnum } from './types/message.js'

export type { Interaction, InteractionMetadata } from './types/interaction.js'
export type { Conversation, ConversationMetadata } from './types/conversation.js'
export type { AIProvider, StreamEvent } from './types/provider.js'

// Services
export { ConversationService, conversationService } from './services/ConversationService.js'
export { ChatStreamService } from './services/ChatStreamService.js'
export {
  appendInstructionMessage,
  type AppendInstructionOptions,
  type AppendInstructionResult,
} from './services/InstructionMessageService.js'

// Providers
export { ProviderRegistry, providerRegistry } from './providers/ProviderRegistry.js'
export { EchoProvider, echoProvider } from './providers/EchoProvider.js'

// Orchestrator
export { ChatOrchestrator } from './orchestrator/ChatOrchestrator.js'
export type { IConversationRepository } from './orchestrator/IConversationRepository.js'
export type {
  OrchestratorEvent,
  ChatState,
  ChatOrchestratorOptions,
  ChatOrchestratorDeps,
} from './orchestrator/types.js'
export type { QueueState, QueuedMessageRole } from './orchestrator/ChatMessageQueue.js'
export { ChatSessionManager } from './sessions/chatSessionManager.js'

// Mappers
export {
  interactionToDTO,
  dtoToInteraction,
  messageToDTO,
  dtoToMessage,
  conversationToDTO,
  dtoToConversation,
  conversationToSummaryDTO,
} from './mappers/index.js'

// Tools
export { ToolRegistry, toolRegistry, type RegisteredTool, type ToolRegistryCallback } from './tools/index.js'
