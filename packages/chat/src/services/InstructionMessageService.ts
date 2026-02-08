import type { ChatOrchestratorDeps } from '../orchestrator/types.js'
import type { IConversationRepository } from '../orchestrator/IConversationRepository.js'
import { ChatOrchestrator } from '../orchestrator/ChatOrchestrator.js'
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

export interface RunInstructionOptions {
  text: string
  conversationId?: string
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

/**
 * Run an instruction message through the orchestrator (auto response).
 * Falls back to append-only if no providers are available.
 */
export async function runInstructionMessage(
  deps: ChatOrchestratorDeps,
  options: RunInstructionOptions
): Promise<{ conversationId: string }> {
  const hasProviders = deps.providerRegistry.list().length > 0
  if (!hasProviders) {
    const result = await appendInstructionMessage(deps.repository, options)
    return { conversationId: result.conversationId }
  }

  const orchestrator = new ChatOrchestrator(deps, { pageSize: 10 })

  try {
    if (options.conversationId) {
      await orchestrator.loadConversation(options.conversationId)
    } else {
      const loaded = await orchestrator.loadLatestConversation()
      if (!loaded) {
        await orchestrator.createConversation()
      }
    }

    await orchestrator.enqueueMessage(options.text, 'instruction')

    const conversationId = orchestrator.conversation?.id ?? options.conversationId
    if (!conversationId) {
      const result = await appendInstructionMessage(deps.repository, options)
      return { conversationId: result.conversationId }
    }

    return { conversationId }
  } catch (err) {
    console.warn('Instruction run failed, falling back to append-only:', err)
    const result = await appendInstructionMessage(deps.repository, options)
    return { conversationId: result.conversationId }
  } finally {
    orchestrator.destroy()
  }
}
