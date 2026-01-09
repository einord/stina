import type { IConversationRepository } from '../orchestrator/IConversationRepository.js'
import { conversationService } from './ConversationService.js'
import { MessageType } from '../types/message.js'

export interface AppendInstructionOptions {
  text: string
  conversationId?: string
  createdAt?: string
}

export interface AppendInstructionResult {
  conversationId: string
  interactionId: string
}

/**
 * Append an instruction message to the latest active conversation (or a specific one).
 */
export async function appendInstructionMessage(
  repository: IConversationRepository,
  options: AppendInstructionOptions
): Promise<AppendInstructionResult> {
  const createdAt = options.createdAt ?? new Date().toISOString()

  let conversation =
    options.conversationId ? await repository.getConversation(options.conversationId) : null

  if (!conversation) {
    conversation = await repository.getLatestActiveConversation()
  }

  if (!conversation) {
    conversation = conversationService.createConversation()
    await repository.saveConversation(conversation)
  }

  const interaction = conversationService.createInteraction(conversation.id)
  conversationService.addMessage(interaction, {
    type: MessageType.INSTRUCTION,
    text: options.text,
    metadata: { createdAt },
  })

  await repository.saveInteraction(interaction)

  return { conversationId: conversation.id, interactionId: interaction.id }
}
