import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  Conversation,
  Interaction,
  Message,
  ToolCall,
  QueueState,
  QueuedMessageRole,
  InformationMessage,
} from '@stina/chat'
import { dtoToInteraction, dtoToConversation } from '@stina/chat/mappers'
import type { ChatConversationDTO, ChatInteractionDTO } from '@stina/shared'
import { useApi } from '../../composables/useApi.js'

export interface UseChatOptions {
  /** Auto-load conversation by ID on mount */
  conversationId?: string
  /** Number of interactions to load initially and per page */
  pageSize?: number
  /** Auto-load latest conversation if no conversationId provided */
  autoLoad?: boolean
  /** Start a fresh conversation immediately (skip loading existing) */
  startFresh?: boolean
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * SSE event types from the server
 */
type SSEEvent = (
  | { type: 'thinking-update'; text: string }
  | { type: 'content-update'; text: string }
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; tool: ToolCall }
  | { type: 'stream-complete'; messages: Message[] }
  | { type: 'stream-error'; error: string }
  | { type: 'interaction-saved'; interaction: ChatInteractionDTO }
  | { type: 'conversation-created'; conversation: ChatConversationDTO }
  | {
      type: 'interaction-started'
      interactionId: string
      conversationId: string
      role: QueuedMessageRole
      text: string
      systemPrompt?: string
      informationMessages?: InformationMessage[]
    }
  | { type: 'queue-update'; queue: QueueState }
  | { type: 'state-change' }
) & { queueId?: string }

/**
 * Vue composable for chat integration via SSE.
 * All business logic runs server-side; this composable only handles:
 * - SSE connection and event handling
 * - Reactive state management
 * - API calls for loading data
 */
export function useChat(options: UseChatOptions = {}) {
  const api = useApi()
  const { pageSize = 10, autoLoad = true, startFresh = false } = options

  // Reactive state
  const sessionId = ref(createClientId())
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
  const debugMode = ref(false)
  const queueState = ref<QueueState>({ queued: [], isProcessing: false })
  const activeQueueId = ref<string | null>(null)
  const requestControllers = new Map<string, AbortController>()
  let autoStartTriggered = false

  /**
   * Whether there are more interactions to load
   */
  const hasMoreInteractions = computed(
    () => loadedInteractions.value.length < totalInteractionsCount.value
  )

  const queuedItems = computed(() => queueState.value.queued)
  const isQueueProcessing = computed(() => queueState.value.isProcessing)

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

  async function refreshQueueState(): Promise<void> {
    try {
      // Use IPC-based queue state if available (Electron)
      if (api.chat.getQueueState) {
        queueState.value = await api.chat.getQueueState(sessionId.value, currentConversation.value?.id)
        return
      }

      // Fall back to HTTP (web)
      const params = new URLSearchParams()
      params.set('sessionId', sessionId.value)
      if (currentConversation.value?.id) {
        params.set('conversationId', currentConversation.value.id)
      }

      const response = await fetch(`/api/chat/queue/state?${params.toString()}`)
      if (!response.ok) {
        return
      }

      queueState.value = (await response.json()) as QueueState
    } catch {
      // Ignore queue refresh errors
    }
  }

  async function loadDebugMode(): Promise<void> {
    if (!api.settings?.get) return
    try {
      const settings = await api.settings.get()
      debugMode.value = settings.debugMode
    } catch {
      // Ignore settings errors
    }
  }

  async function hasDefaultModelConfig(): Promise<boolean> {
    try {
      const defaultModel = await api.userDefaultModel.get()
      return defaultModel !== null
    } catch {
      return false
    }
  }

  function handleSettingsUpdated(event?: Event): void {
    const detail = (event as CustomEvent | undefined)?.detail
    if (detail && typeof detail.debugMode === 'boolean') {
      debugMode.value = detail.debugMode
      return
    }
    void loadDebugMode()
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

      case 'interaction-started': {
        resetStreamingState()
        isStreaming.value = true
        activeQueueId.value = event.queueId ?? null

        if (!currentConversation.value || currentConversation.value.id !== event.conversationId) {
          currentConversation.value = {
            id: event.conversationId,
            title: undefined,
            active: true,
            interactions: [],
            metadata: { createdAt: new Date().toISOString() },
          }
        }

        const messageType = event.role === 'instruction' ? 'instruction' : 'user'
        const messages: Message[] = []
        if (event.systemPrompt) {
          messages.push({
            type: 'instruction',
            text: event.systemPrompt,
            metadata: { createdAt: new Date().toISOString() },
          } as Message)
        }
        messages.push({
          type: messageType,
          text: event.text,
          metadata: { createdAt: new Date().toISOString() },
        } as Message)

        currentInteraction.value = {
          id: event.interactionId,
          conversationId: event.conversationId,
          messages,
          informationMessages: event.informationMessages ?? [],
          aborted: false,
          error: false,
          metadata: { createdAt: new Date().toISOString() },
        }
        break
      }

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
        activeQueueId.value = null
        void refreshQueueState()
        break

      case 'stream-error':
        isStreaming.value = false
        error.value = new Error(event.error)
        resetStreamingState()
        activeQueueId.value = null
        void refreshQueueState()
        break

      case 'queue-update':
        queueState.value = event.queue
        break
    }
  }

  /**
   * Send a message via SSE stream (web) or IPC events (Electron)
   */
  async function sendMessage(
    text: string,
    options: { role?: QueuedMessageRole; context?: 'conversation-start' | 'settings-update' } = {}
  ): Promise<void> {
    error.value = null
    const queueId = createClientId()

    // Use IPC-based streaming if available (Electron)
    if (api.chat.streamMessage) {
      try {
        const cleanup = await api.chat.streamMessage(
          currentConversation.value?.id ?? null,
          text,
          {
            queueId,
            role: options.role ?? 'user',
            context: options.context,
            sessionId: sessionId.value,
            // Adapter to convert ChatStreamEvent to SSEEvent
            onEvent: (event) => handleSSEEvent(event as SSEEvent),
          }
        )

        // Store cleanup function for this queueId
        const abortController = {
          abort: () => cleanup(),
        }
        requestControllers.set(queueId, abortController as unknown as AbortController)
      } catch (err) {
        error.value = err as Error
        isStreaming.value = false
        resetStreamingState()
      }
      return
    }

    // Fall back to SSE-based streaming (web)
    const controller = new AbortController()
    requestControllers.set(queueId, controller)

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: currentConversation.value?.id,
          message: text,
          queueId,
          role: options.role ?? 'user',
          context: options.context,
          sessionId: sessionId.value,
        }),
        signal: controller.signal,
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
      requestControllers.delete(queueId)
      if (activeQueueId.value === queueId) {
        activeQueueId.value = null
      }
    }
  }

  /**
   * Start a new conversation
   */
  async function startConversation(): Promise<void> {
    for (const controller of requestControllers.values()) {
      controller.abort()
    }
    requestControllers.clear()
    activeQueueId.value = null
    isStreaming.value = false
    resetStreamingState()

    try {
      // Use IPC-based queue reset if available (Electron)
      if (api.chat.resetQueue) {
        await api.chat.resetQueue(sessionId.value, currentConversation.value?.id)
      } else {
        // Fall back to HTTP (web)
        await fetch('/api/chat/queue/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId.value,
            conversationId: currentConversation.value?.id,
          }),
        })
      }
    } catch {
      // Ignore reset errors
    }

    currentConversation.value = null
    currentInteraction.value = null
    loadedInteractions.value = []
    totalInteractionsCount.value = 0
    error.value = null
    queueState.value = { queued: [], isProcessing: false }
    autoStartTriggered = false

    if (await hasDefaultModelConfig()) {
      await sendMessage('', { role: 'instruction', context: 'conversation-start' })
    }
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
      await refreshQueueState()
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
      await refreshQueueState()
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
   * Remove a queued message
   */
  async function removeQueued(id: string): Promise<void> {
    try {
      // Use IPC-based queue remove if available (Electron)
      if (api.chat.removeQueued) {
        await api.chat.removeQueued(id, sessionId.value, currentConversation.value?.id)
        await refreshQueueState()
        return
      }

      // Fall back to HTTP (web)
      const response = await fetch('/api/chat/queue/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          sessionId: sessionId.value,
          conversationId: currentConversation.value?.id,
        }),
      })

      if (!response.ok) {
        return
      }

      await refreshQueueState()
    } catch {
      // Ignore removal errors
    }
  }

  /**
   * Abort current streaming
   */
  async function abortStreaming(): Promise<void> {
    const activeId = activeQueueId.value
    if (activeId) {
      const controller = requestControllers.get(activeId)
      if (controller) {
        controller.abort()
        requestControllers.delete(activeId)
      }
    }

    try {
      // Use IPC-based abort if available (Electron)
      if (api.chat.abortStream) {
        await api.chat.abortStream(sessionId.value, currentConversation.value?.id)
      } else {
        // Fall back to HTTP (web)
        await fetch('/api/chat/queue/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId.value,
            conversationId: currentConversation.value?.id,
          }),
        })
      }
    } catch {
      // Ignore abort errors
    }

    isStreaming.value = false
    currentInteraction.value = null
    resetStreamingState()
    activeQueueId.value = null
    await refreshQueueState()
  }

  // Auto-load conversation on mount
  onMounted(async () => {
    if (typeof window !== 'undefined') {
      window.addEventListener('stina-settings-updated', handleSettingsUpdated)
    }
    await loadDebugMode()

    // If startFresh is true, start a new conversation immediately (used after onboarding)
    if (startFresh) {
      if (await hasDefaultModelConfig()) {
        autoStartTriggered = true
        await sendMessage('', { role: 'instruction', context: 'conversation-start' })
      }
    } else if (options.conversationId) {
      await loadConversation(options.conversationId)
    } else if (autoLoad) {
      await loadLatestConversation()
      if (!currentConversation.value && !autoStartTriggered) {
        if (await hasDefaultModelConfig()) {
          autoStartTriggered = true
          await sendMessage('', { role: 'instruction', context: 'conversation-start' })
        }
      }
    }
    await refreshQueueState()
  })

  // Cleanup on unmount
  onUnmounted(() => {
    for (const controller of requestControllers.values()) {
      controller.abort()
    }
    requestControllers.clear()
    if (typeof window !== 'undefined') {
      window.removeEventListener('stina-settings-updated', handleSettingsUpdated)
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
    debugMode,
    queueState,
    queuedItems,
    isQueueProcessing,
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
    removeQueued,
    abortStreaming,
  }
}
