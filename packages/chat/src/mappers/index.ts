import type { Conversation, Interaction, Message, InformationMessage } from '../types/index.js'
import type {
  ChatConversationDTO,
  ChatConversationSummaryDTO,
  ChatInteractionDTO,
  ChatMessageDTO,
} from '@stina/shared'

/**
 * Convert domain Interaction to DTO
 */
export function interactionToDTO(interaction: Interaction): ChatInteractionDTO {
  return {
    id: interaction.id,
    messages: interaction.messages.map(messageToDTO),
    informationMessages: interaction.informationMessages.map((info) => ({
      text: info.text,
      createdAt: info.metadata.createdAt,
    })),
    createdAt: interaction.metadata.createdAt,
    error: interaction.error,
    errorMessage: interaction.errorMessage,
  }
}

/**
 * Convert domain Message to DTO
 */
export function messageToDTO(message: Message): ChatMessageDTO {
  const base: ChatMessageDTO = {
    type: message.type,
    createdAt: message.metadata.createdAt,
  }

  if ('text' in message) {
    base.text = message.text
  }

  if (message.type === 'tools') {
    base.tools = message.tools.map((tool) => ({
      name: tool.name,
      displayName: tool.displayName,
      payload: tool.payload,
      result: tool.result,
    }))
  }

  return base
}

/**
 * Convert DTO to domain Interaction
 */
export function dtoToInteraction(dto: ChatInteractionDTO, conversationId: string): Interaction {
  return {
    id: dto.id,
    conversationId,
    messages: dto.messages.map(dtoToMessage),
    informationMessages: (dto.informationMessages || []).map(
      (info): InformationMessage => ({
        type: 'information',
        text: info.text,
        metadata: { createdAt: info.createdAt },
      })
    ),
    completed: true, // DTOs represent completed interactions
    aborted: false,
    error: dto.error ?? false,
    errorMessage: dto.errorMessage,
    metadata: { createdAt: dto.createdAt },
  }
}

/**
 * Convert DTO to domain Message
 */
export function dtoToMessage(dto: ChatMessageDTO): Message {
  const metadata = { createdAt: dto.createdAt }

  switch (dto.type) {
    case 'user':
      return { type: 'user', text: dto.text || '', metadata }
    case 'stina':
      return { type: 'stina', text: dto.text || '', metadata }
    case 'instruction':
      return { type: 'instruction', text: dto.text || '', metadata }
    case 'information':
      return { type: 'information', text: dto.text || '', metadata }
    case 'thinking':
      return { type: 'thinking', text: dto.text || '', done: true, metadata }
    case 'tools':
      return {
        type: 'tools',
        tools: (dto.tools || []).map((tool) => ({
          name: tool.name,
          displayName: tool.displayName,
          payload: tool.payload,
          result: tool.result,
          metadata,
        })),
        metadata,
      }
    default:
      throw new Error(`Unknown message type: ${dto.type}`)
  }
}

/**
 * Convert domain Conversation to DTO
 */
export function conversationToDTO(conversation: Conversation): ChatConversationDTO {
  return {
    id: conversation.id,
    title: conversation.title,
    interactions: conversation.interactions.map(interactionToDTO),
    active: conversation.active,
    createdAt: conversation.metadata.createdAt,
  }
}

/**
 * Convert DTO to domain Conversation
 */
export function dtoToConversation(dto: ChatConversationDTO): Conversation {
  return {
    id: dto.id,
    title: dto.title,
    interactions: dto.interactions.map((i) => dtoToInteraction(i, dto.id)),
    active: dto.active,
    metadata: { createdAt: dto.createdAt },
  }
}

/**
 * Convert domain Conversation to summary DTO
 */
export function conversationToSummaryDTO(conversation: Conversation): ChatConversationSummaryDTO {
  // Get last message from most recent interaction
  const lastInteraction = conversation.interactions[0]
  const lastMessage = lastInteraction?.messages[lastInteraction.messages.length - 1]

  // Extract text from last message if it has text
  let lastMessageText: string | undefined
  if (lastMessage && 'text' in lastMessage) {
    lastMessageText = lastMessage.text
  }

  return {
    id: conversation.id,
    title: conversation.title,
    lastMessage: lastMessageText,
    lastMessageAt: lastInteraction?.metadata.createdAt || conversation.metadata.createdAt,
    active: conversation.active,
  }
}
