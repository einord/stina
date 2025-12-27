import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Conversation, Interaction, Message, ToolCall } from '@stina/chat'
import type { ChatConversationDTO, ChatInteractionDTO } from '@stina/shared'
import { useApi } from '../../composables/useApi.js'

export interface UseChatOptions {
  /** Auto-load conversation by ID on mount */
  conversationId?: string
  /** Number of interactions to load initially and per page */
  pageSize?: number
  /** Auto-load latest conversation if no conversationId provided */
  autoLoad?: boolean
}

/**
 * SSE event types from the server
 */
type SSEEvent =
  | { type: 'thinking-update'; text: string }
  | { type: 'content-update'; text: string }
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; tool: ToolCall }
  | { type: 'stream-complete'; messages: Message[] }
  | { type: 'stream-error'; error: string }
  | { type: 'interaction-saved'; interaction: ChatInteractionDTO }
  | { type: 'conversation-created'; conversation: ChatConversationDTO }
  | { type: 'state-change' }

/**
 * Convert ChatInteractionDTO to domain Interaction
 */
function dtoToInteraction(dto: ChatInteractionDTO, conversationId: string): Interaction {
  return {
    id: dto.id,
    conversationId,
    messages: dto.messages as unknown as Message[],
    informationMessages: (dto.informationMessages || []).map((info) => ({
      type: 'information' as const,
      text: info.text,
      metadata: { createdAt: info.createdAt },
    })),
    aborted: false,
    metadata: { createdAt: dto.createdAt },
  }
}

/**
 * Convert ChatConversationDTO to domain Conversation
 */
function dtoToConversation(dto: ChatConversationDTO): Conversation {
  return {
    id: dto.id,
    title: dto.title,
    active: dto.active,
    interactions: dto.interactions.map((i) => dtoToInteraction(i, dto.id)),
    metadata: { createdAt: dto.createdAt },
  }
}

/**
 * Vue composable for chat integration via SSE.
 * All business logic runs server-side; this composable only handles:
 * - SSE connection and event handling
 * - Reactive state management
 * - API calls for loading data
 */
export function useChat(options: UseChatOptions = {}) {
  const api = useApi()
  const { pageSize = 10, autoLoad = true } = options

  // Reactive state
  const currentConversation = ref<Conversation | null>(null)
  const currentInteraction = ref<Interaction | null>(null)
  const loadedInteractions = ref<Interaction[]>([])
  const totalInteractionsCount = ref(0)
  const isLoadingMore = ref(false)
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const streamingTools = ref<string[]>([])
  const error = ref<Error | null>(null)

  // Abort controller for current stream
  let abortController: AbortController | null = null

  /**
   * Whether there are more interactions to load
   */
  const hasMoreInteractions = computed(
    () => loadedInteractions.value.length < totalInteractionsCount.value
  )

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
   * All loaded interactions (ordered for display, oldest first)
   */
  const interactions = computed<Interaction[]>(() => {
    return [...loadedInteractions.value].reverse()
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
   * Handle SSE event from server
   */
  function handleSSEEvent(event: SSEEvent) {
    switch (event.type) {
      case 'thinking-update':
        streamingThinking.value = event.text
        break

      case 'content-update':
        streamingContent.value = event.text
        break

      case 'tool-start':
        if (!streamingTools.value.includes(event.name)) {
          streamingTools.value = [...streamingTools.value, event.name]
        }
        break

      case 'conversation-created':
        currentConversation.value = dtoToConversation(event.conversation)
        break

      case 'interaction-saved':
        if (currentConversation.value) {
          const interaction = dtoToInteraction(event.interaction, currentConversation.value.id)
          loadedInteractions.value = [interaction, ...loadedInteractions.value]
          totalInteractionsCount.value += 1
          currentInteraction.value = null
        }
        break

      case 'stream-complete':
        isStreaming.value = false
        resetStreamingState()
        break

      case 'stream-error':
        isStreaming.value = false
        error.value = new Error(event.error)
        resetStreamingState()
        break
    }
  }

  /**
   * Send a message via SSE stream
   */
  async function sendMessage(text: string): Promise<void> {
    error.value = null

    // Create temporary interaction for UI display
    const tempInteraction: Interaction = {
      id: `temp-${Date.now()}`,
      conversationId: currentConversation.value?.id || '',
      messages: [
        {
          type: 'user',
          text,
          metadata: { createdAt: new Date().toISOString() },
        },
      ],
      informationMessages: [],
      aborted: false,
      metadata: { createdAt: new Date().toISOString() },
    }
    currentInteraction.value = tempInteraction
    isStreaming.value = true

    // Create abort controller
    abortController = new AbortController()

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: currentConversation.value?.id,
          message: text,
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE messages
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              // Stream complete
              return
            }
            try {
              const event = JSON.parse(data) as SSEEvent
              handleSSEEvent(event)
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User aborted, don't set error
        return
      }
      error.value = err as Error
      isStreaming.value = false
      resetStreamingState()
    } finally {
      abortController = null
    }
  }

  /**
   * Start a new conversation
   */
  async function startConversation(): Promise<void> {
    currentConversation.value = null
    currentInteraction.value = null
    loadedInteractions.value = []
    totalInteractionsCount.value = 0
    error.value = null
    // Conversation will be created on first message
  }

  /**
   * Load initial interactions for current conversation
   */
  async function loadInitialInteractions(): Promise<void> {
    if (!currentConversation.value) return

    try {
      error.value = null

      const count = await api.chat.countConversationInteractions(currentConversation.value.id)
      totalInteractionsCount.value = count

      const interactionDTOs = await api.chat.getConversationInteractions(
        currentConversation.value.id,
        pageSize,
        0
      )

      loadedInteractions.value = interactionDTOs.map((dto) =>
        dtoToInteraction(dto, currentConversation.value!.id)
      )
    } catch (err) {
      error.value = err as Error
    }
  }

  /**
   * Load more (older) interactions
   */
  async function loadMoreInteractions(): Promise<void> {
    if (!currentConversation.value || isLoadingMore.value || !hasMoreInteractions.value) {
      return
    }

    try {
      isLoadingMore.value = true
      error.value = null

      const offset = loadedInteractions.value.length

      const interactionDTOs = await api.chat.getConversationInteractions(
        currentConversation.value.id,
        pageSize,
        offset
      )

      const newInteractions = interactionDTOs.map((dto) =>
        dtoToInteraction(dto, currentConversation.value!.id)
      )

      loadedInteractions.value = [...loadedInteractions.value, ...newInteractions]
    } catch (err) {
      error.value = err as Error
    } finally {
      isLoadingMore.value = false
    }
  }

  /**
   * Load a conversation by ID
   */
  async function loadConversation(id: string): Promise<void> {
    try {
      error.value = null
      const conversationDTO = await api.chat.getConversation(id)

      currentConversation.value = {
        id: conversationDTO.id,
        title: conversationDTO.title,
        active: conversationDTO.active,
        interactions: [],
        metadata: { createdAt: conversationDTO.createdAt },
      }

      await loadInitialInteractions()
    } catch (err) {
      error.value = err as Error
    }
  }

  /**
   * Load latest active conversation
   */
  async function loadLatestConversation(): Promise<void> {
    try {
      error.value = null
      const conversationDTO = await api.chat.getLatestActiveConversation()

      if (!conversationDTO) {
        return
      }

      currentConversation.value = {
        id: conversationDTO.id,
        title: conversationDTO.title,
        active: conversationDTO.active,
        interactions: [],
        metadata: { createdAt: conversationDTO.createdAt },
      }

      await loadInitialInteractions()
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
      loadedInteractions.value = []
      totalInteractionsCount.value = 0
    } catch (err) {
      error.value = err as Error
    }
  }

  /**
   * Abort current streaming
   */
  function abortStreaming(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isStreaming.value = false
    currentInteraction.value = null
    resetStreamingState()
  }

  // Auto-load conversation on mount
  onMounted(async () => {
    if (options.conversationId) {
      await loadConversation(options.conversationId)
    } else if (autoLoad) {
      await loadLatestConversation()
    }
  })

  // Cleanup on unmount
  onUnmounted(() => {
    if (abortController) {
      abortController.abort()
    }
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
    hasMoreInteractions,
    isLoadingMore,
    loadedInteractionsCount: computed(() => loadedInteractions.value.length),
    totalInteractionsCount: computed(() => totalInteractionsCount.value),

    // Methods
    sendMessage,
    startConversation,
    loadConversation,
    loadMoreInteractions,
    archiveConversation,
    abortStreaming,
  }
}
