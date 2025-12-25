import { ref, computed, onUnmounted } from 'vue'
import type { Conversation, Interaction, Message, ToolCall } from '@stina/chat'
import { ChatStreamService, conversationService, providerRegistry } from '@stina/chat'
import { useApi } from '../../composables/useApi.js'

export interface UseChatOptions {
  /** Auto-load conversation by ID on mount */
  conversationId?: string
}

/**
 * Vue composable for chat integration
 * Wraps ChatStreamService with reactive state for Vue components
 */
export function useChat(options: UseChatOptions = {}) {
  const api = useApi()

  // Reactive state
  const currentConversation = ref<Conversation | null>(null)
  const currentInteraction = ref<Interaction | null>(null)
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const streamingTools = ref<string[]>([])
  const error = ref<Error | null>(null)

  // Stream service instance
  const streamService = new ChatStreamService()

  /**
   * Complete messages list including streaming messages
   */
  const messages = computed<Message[]>(() => {
    if (!currentInteraction.value) return []

    const baseMessages = [...currentInteraction.value.messages]

    // Add streaming thinking if present
    if (isStreaming.value && streamingThinking.value) {
      baseMessages.push({
        type: 'thinking',
        text: streamingThinking.value,
        metadata: { createdAt: new Date().toISOString() },
      } as Message)
    }

    // Add streaming tools if present
    if (isStreaming.value && streamingTools.value.length > 0) {
      baseMessages.push({
        type: 'tools',
        tools: streamingTools.value.map((name) => ({
          name,
          payload: '',
          result: '',
          metadata: { createdAt: new Date().toISOString() },
        })) as ToolCall[],
        metadata: { createdAt: new Date().toISOString() },
      } as Message)
    }

    // Add streaming content if present
    if (isStreaming.value && streamingContent.value) {
      baseMessages.push({
        type: 'stina',
        text: streamingContent.value,
        metadata: { createdAt: new Date().toISOString() },
      } as Message)
    }

    return baseMessages
  })

  /**
   * Information messages from current interaction
   */
  const informationMessages = computed(() => {
    return currentInteraction.value?.informationMessages || []
  })

  /**
   * All interactions in current conversation
   */
  const interactions = computed<Interaction[]>(() => {
    return currentConversation.value?.interactions || []
  })

  // Event listeners for streaming updates
  streamService.on('thinking-update', (text: string) => {
    streamingThinking.value = text
  })

  streamService.on('content-update', (text: string) => {
    streamingContent.value = text
  })

  streamService.on('tool-start', (name: string) => {
    if (!streamingTools.value.includes(name)) {
      streamingTools.value.push(name)
    }
  })

  streamService.on('tool-complete', () => {
    // Tool completion handled in buildMessages
  })

  streamService.on('stream-complete', (finalMessages: Message[]) => {
    isStreaming.value = false

    // Add messages to current interaction
    if (currentInteraction.value) {
      finalMessages.forEach((msg) => {
        conversationService.addMessage(currentInteraction.value!, msg)
      })

      // Save interaction to database via API
      // TODO: Implement saveInteraction API call
    }

    // Reset streaming state
    resetStreamingState()
  })

  streamService.on('stream-error', (err: Error) => {
    isStreaming.value = false
    error.value = err
    resetStreamingState()
  })

  /**
   * Reset streaming state
   */
  function resetStreamingState() {
    streamingContent.value = ''
    streamingThinking.value = ''
    streamingTools.value = []
  }

  /**
   * Start a new conversation
   */
  async function startConversation(title?: string): Promise<void> {
    const conversation = conversationService.createConversation(title)
    currentConversation.value = conversation

    // Save to database via API
    // TODO: Implement createConversation API call
  }

  /**
   * Send a message
   */
  async function sendMessage(text: string): Promise<void> {
    try {
      error.value = null

      // Create conversation if none exists
      if (!currentConversation.value) {
        await startConversation()
      }

      // Create new interaction
      const interaction = conversationService.createInteraction(currentConversation.value!.id)

      // Add user message
      const userMessage: Message = {
        type: 'user',
        text,
        metadata: { createdAt: new Date().toISOString() },
      }
      conversationService.addMessage(interaction, userMessage)

      // Set as current interaction
      currentInteraction.value = interaction

      // Start streaming
      isStreaming.value = true

      // Get AI provider
      const providers = providerRegistry.list()
      const provider = providers[0] // Use first available provider

      if (!provider) {
        throw new Error('No AI provider available')
      }

      // Build messages for provider (all messages from all interactions)
      const allMessages: Message[] = []
      if (currentConversation.value) {
        for (const inter of currentConversation.value.interactions) {
          allMessages.push(...inter.messages)
        }
      }
      allMessages.push(...interaction.messages)

      // Get system prompt
      // TODO: Get system prompt from settings or use default
      const systemPrompt = 'You are Stina, a helpful AI assistant.'

      // Send to provider
      await provider.sendMessage(allMessages, systemPrompt, (event) => {
        streamService.handleStreamEvent(event)
      })
    } catch (err) {
      error.value = err as Error
      isStreaming.value = false
      resetStreamingState()
    }
  }

  /**
   * Load a conversation by ID
   */
  async function loadConversation(id: string): Promise<void> {
    try {
      error.value = null
      const conversation = await api.chat.getConversation(id)

      // Convert DTO to domain model
      // TODO: Implement proper DTO to domain conversion
      currentConversation.value = conversation as unknown as Conversation
    } catch (err) {
      error.value = err as Error
    }
  }

  /**
   * Archive current conversation
   */
  async function archiveConversation(): Promise<void> {
    if (!currentConversation.value) return

    try {
      error.value = null
      await api.chat.archiveConversation(currentConversation.value.id)
      currentConversation.value = null
      currentInteraction.value = null
    } catch (err) {
      error.value = err as Error
    }
  }

  /**
   * Abort current streaming interaction
   */
  function abortStreaming(): void {
    if (currentInteraction.value && isStreaming.value) {
      conversationService.abortInteraction(currentInteraction.value)
      isStreaming.value = false
      resetStreamingState()
    }
  }

  // Auto-load conversation if ID provided
  if (options.conversationId) {
    loadConversation(options.conversationId)
  }

  // Cleanup on unmount
  onUnmounted(() => {
    streamService.removeAllListeners()
  })

  return {
    // State
    currentConversation,
    currentInteraction,
    interactions,
    messages,
    informationMessages,
    isStreaming,
    streamingContent,
    streamingThinking,
    streamingTools,
    error,

    // Methods
    sendMessage,
    startConversation,
    loadConversation,
    archiveConversation,
    abortStreaming,
  }
}
