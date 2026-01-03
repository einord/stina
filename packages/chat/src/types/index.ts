// Message types
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
} from './message.js'

export { MessageType as MessageTypeEnum } from './message.js'

// Interaction types
export type { Interaction, InteractionMetadata } from './interaction.js'

// Conversation types
export type { Conversation, ConversationMetadata } from './conversation.js'

// Provider types
export type { AIProvider, StreamEvent, SendMessageOptions } from './provider.js'
