/**
 * Message types in a conversation
 */
export const MessageType = {
  USER: 'user',
  STINA: 'stina',
  INSTRUCTION: 'instruction',
  INFORMATION: 'information',
  THINKING: 'thinking',
  TOOLS: 'tools',
} as const

export type MessageType = (typeof MessageType)[keyof typeof MessageType]

/**
 * Base metadata for all messages
 */
export interface MessageMetadata {
  createdAt: string
  [key: string]: unknown
}

/**
 * Tool call in a tools message
 */
export interface ToolCall {
  name: string
  payload: string
  result: string
  metadata: MessageMetadata
}

/**
 * User message
 */
export interface UserMessage {
  type: typeof MessageType.USER
  text: string
  metadata: MessageMetadata
}

/**
 * Stina (assistant) message
 */
export interface StinaMessage {
  type: typeof MessageType.STINA
  text: string
  metadata: MessageMetadata
}

/**
 * Instruction message (system instructions, not shown to user by default)
 */
export interface InstructionMessage {
  type: typeof MessageType.INSTRUCTION
  text: string
  metadata: MessageMetadata
}

/**
 * Information message (always shown first in UI, not sent to provider)
 */
export interface InformationMessage {
  type: typeof MessageType.INFORMATION
  text: string
  metadata: MessageMetadata
}

/**
 * Thinking message (internal reasoning from AI)
 */
export interface ThinkingMessage {
  type: typeof MessageType.THINKING
  text: string
  metadata: MessageMetadata
}

/**
 * Tools message (contains multiple tool calls)
 */
export interface ToolsMessage {
  type: typeof MessageType.TOOLS
  tools: ToolCall[]
  metadata: MessageMetadata
}

/**
 * Union of all message types
 */
export type Message =
  | UserMessage
  | StinaMessage
  | InstructionMessage
  | InformationMessage
  | ThinkingMessage
  | ToolsMessage
