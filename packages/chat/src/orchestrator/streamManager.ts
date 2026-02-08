/**
 * Stream listener management for ChatOrchestrator.
 *
 * Sets up event listeners on ChatStreamService and translates
 * stream events into orchestrator events and state updates.
 */

import type { Message, ToolCall, Interaction } from '../types/index.js'
import type { ChatStreamService } from '../services/ChatStreamService.js'
import type { IConversationRepository } from './IConversationRepository.js'
import type { OrchestratorEvent } from './types.js'

export interface StreamListener {
  event: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => void
}

/**
 * Mutable state interface that the stream manager can update.
 * Keeps the stream manager decoupled from the full orchestrator.
 */
export interface StreamManagerState {
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  streamingTools: string[]
  currentInteraction: Interaction | null
  loadedInteractions: Interaction[]
  totalInteractionsCount: number
  error: Error | null
}

/**
 * Callbacks provided by the orchestrator to the stream manager.
 */
export interface StreamManagerCallbacks {
  getActiveQueueId: () => string | undefined
  emitEvent: (event: OrchestratorEvent) => void
  emitStateChange: () => void
  resetStreamingState: () => void
  addMessage: (interaction: Interaction, message: Message) => void
}

/**
 * Set up stream event listeners on a ChatStreamService.
 * Returns the listener registrations for cleanup.
 */
export function setupStreamListeners(
  streamService: ChatStreamService,
  repository: IConversationRepository,
  state: StreamManagerState,
  callbacks: StreamManagerCallbacks
): StreamListener[] {
  const listeners: StreamListener[] = []

  const thinkingUpdateHandler = (text: string) => {
    const queueId = callbacks.getActiveQueueId()
    state.streamingThinking = text
    callbacks.emitStateChange()
    callbacks.emitEvent({ type: 'thinking-update', text, queueId })
  }
  streamService.on('thinking-update', thinkingUpdateHandler)
  listeners.push({ event: 'thinking-update', handler: thinkingUpdateHandler })

  const thinkingDoneHandler = () => {
    const queueId = callbacks.getActiveQueueId()
    callbacks.emitEvent({ type: 'thinking-done', queueId })
  }
  streamService.on('thinking-done', thinkingDoneHandler)
  listeners.push({ event: 'thinking-done', handler: thinkingDoneHandler })

  const contentUpdateHandler = (text: string) => {
    const queueId = callbacks.getActiveQueueId()
    state.streamingContent = text
    callbacks.emitStateChange()
    callbacks.emitEvent({ type: 'content-update', text, queueId })
  }
  streamService.on('content-update', contentUpdateHandler)
  listeners.push({ event: 'content-update', handler: contentUpdateHandler })

  const toolStartHandler = (tool: { name: string; displayName?: string; payload?: string }) => {
    const queueId = callbacks.getActiveQueueId()
    const displayName = tool.displayName || tool.name
    if (!state.streamingTools.includes(displayName)) {
      state.streamingTools.push(displayName)
      callbacks.emitStateChange()
    }
    callbacks.emitEvent({
      type: 'tool-start',
      name: tool.name,
      displayName: tool.displayName,
      payload: tool.payload,
      queueId,
    })
  }
  streamService.on('tool-start', toolStartHandler)
  listeners.push({ event: 'tool-start', handler: toolStartHandler })

  const toolCompleteHandler = (tool: ToolCall) => {
    const queueId = callbacks.getActiveQueueId()
    callbacks.emitEvent({ type: 'tool-complete', tool, queueId })
  }
  streamService.on('tool-complete', toolCompleteHandler)
  listeners.push({ event: 'tool-complete', handler: toolCompleteHandler })

  const streamCompleteHandler = async (finalMessages: Message[]) => {
    const queueId = callbacks.getActiveQueueId()
    state.isStreaming = false

    if (state.currentInteraction) {
      // Add messages to interaction
      finalMessages.forEach((msg) => {
        callbacks.addMessage(state.currentInteraction!, msg)
      })

      // Save to repository
      await repository.saveInteraction(state.currentInteraction)

      // Add to loaded interactions (prepend as it's the newest)
      state.loadedInteractions.unshift(state.currentInteraction)
      state.totalInteractionsCount += 1

      callbacks.emitEvent({
        type: 'interaction-saved',
        interaction: state.currentInteraction,
        queueId,
      })

      // Clear current interaction
      state.currentInteraction = null
    }

    callbacks.resetStreamingState()
    callbacks.emitStateChange()
    callbacks.emitEvent({ type: 'stream-complete', messages: finalMessages, queueId })
  }
  streamService.on('stream-complete', streamCompleteHandler)
  listeners.push({ event: 'stream-complete', handler: streamCompleteHandler })

  const streamErrorHandler = async (err: Error) => {
    const queueId = callbacks.getActiveQueueId()
    state.isStreaming = false
    state.error = err

    // If we have a current interaction, save it with the error info
    if (state.currentInteraction) {
      // Mark the interaction as having an error
      state.currentInteraction.error = true
      state.currentInteraction.errorMessage = err.message

      // Add an error message to display in the chat
      const errorMessage: Message = {
        type: 'stina',
        text: err.message,
        metadata: {
          createdAt: new Date().toISOString(),
          errorCode: 'CHAT_STREAM_ERROR',
          isError: true,
        },
      }
      callbacks.addMessage(state.currentInteraction, errorMessage)

      // Save the failed interaction to the database
      await repository.saveInteraction(state.currentInteraction)

      // Add to loaded interactions so it shows in the UI
      state.loadedInteractions.unshift(state.currentInteraction)
      state.totalInteractionsCount += 1

      callbacks.emitEvent({
        type: 'interaction-saved',
        interaction: state.currentInteraction,
        queueId,
      })

      // Clear current interaction
      state.currentInteraction = null
    }

    callbacks.resetStreamingState()
    callbacks.emitStateChange()
    callbacks.emitEvent({ type: 'stream-error', error: err, queueId })
  }
  streamService.on('stream-error', streamErrorHandler)
  listeners.push({ event: 'stream-error', handler: streamErrorHandler })

  return listeners
}

/**
 * Remove all stream listeners from the service.
 */
export function cleanupStreamListeners(
  streamService: ChatStreamService,
  listeners: StreamListener[]
): void {
  for (const { event, handler } of listeners) {
    streamService.off(event, handler)
  }
}
