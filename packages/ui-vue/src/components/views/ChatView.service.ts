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

/**
 * Get authorization headers for API requests.
 * Reads the access token from localStorage if available.
 */
function getAuthHeaders(): HeadersInit {
  if (typeof localStorage === 'undefined') return {}
  const token = localStorage.getItem('stina_access_token')
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

export interface UseChatOptions {
  /** Auto-load conversation by ID on mount */
  conversationId?: string
  /** Number of interactions to load initially and per page */
  pageSize?: number
  /** Auto-load latest conversation if no conversationId provided */
  autoLoad?: boolean
  /** Start a fresh conversation immediately (skip loading existing) */
  startFresh?: boolean
  /** Callback when an interaction is saved (useful for notifications) */
  onInteractionSaved?: (interaction: Interaction) => void
  /** Callback when a background instruction is received (e.g., from scheduler). Should force show notification. */
  onBackgroundInstruction?: (interaction: Interaction) => void
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
  | { type: 'thinking-done' }
  | { type: 'content-update'; text: string }
  | { type: 'tool-start'; name: string; displayName?: string; payload?: string }
  | { type: 'tool-complete'; tool: ToolCall }
  | { type: 'tool-confirmation-pending'; toolCallName: string; toolDisplayName?: string; toolPayload: string; confirmationPrompt: string }
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
  const { pageSize = 10, autoLoad = true, startFresh = false, onInteractionSaved, onBackgroundInstruction } = options

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
  const streamingThinkingDone = ref(false)
  const streamingTools = ref<ToolCall[]>([])
  const error = ref<Error | null>(null)
  const debugMode = ref(false)
  const queueState = ref<QueueState>({ queued: [], isProcessing: false })
  const activeQueueId = ref<string | null>(null)
  const pendingConfirmation = ref<{
    toolCallName: string
    confirmationPrompt: string
    toolCall: ToolCall
  } | null>(null)
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
   * Complete messages list including streaming messages.
   * Streaming thinking is shown inline here for a seamless experience.
   */
  const messages = computed<Message[]>(() => {
    if (!currentInteraction.value) return []

    const baseMessages = [...currentInteraction.value.messages]

    // Add streaming thinking if present (shown inline in message list)
    if (isStreaming.value && streamingThinking.value) {
      baseMessages.push({
        type: 'thinking',
        text: streamingThinking.value,
        done: streamingThinkingDone.value,
        metadata: { createdAt: new Date().toISOString() },
      } as Message)
    }

    // Add streaming tools if present
    if (isStreaming.value && streamingTools.value.length > 0) {
      baseMessages.push({
        type: 'tools',
        tools: streamingTools.value,
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
    streamingThinkingDone.value = false
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

      const response = await fetch(`/api/chat/queue/state?${params.toString()}`, {
        headers: getAuthHeaders(),
      })
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
   * @param event - The SSE event
   * @param isFromSubscription - True if event came from conversation subscription (observer mode)
   */
  function handleSSEEvent(event: SSEEvent, isFromSubscription: boolean = false) {
    switch (event.type) {
      case 'thinking-update':
        streamingThinking.value = event.text
        break

      case 'thinking-done':
        streamingThinkingDone.value = true
        break

      case 'content-update':
        streamingContent.value = event.text
        break

      case 'tool-start': {
        // Check if tool already exists (by name)
        const existingIndex = streamingTools.value.findIndex((t) => t.name === event.name)
        if (existingIndex === -1) {
          // Add new tool
          const newTool: ToolCall = {
            name: event.name,
            displayName: event.displayName,
            payload: event.payload ?? '',
            result: '',
            metadata: { createdAt: new Date().toISOString() },
          }
          streamingTools.value = [...streamingTools.value, newTool]
        }
        break
      }

      case 'tool-complete': {
        // Update existing tool with result
        const toolIndex = streamingTools.value.findIndex((t) => t.name === event.tool.name)
        if (toolIndex !== -1) {
          // Replace the tool with updated data
          const updatedTools = [...streamingTools.value]
          updatedTools[toolIndex] = event.tool
          streamingTools.value = updatedTools
        } else {
          // Tool wasn't tracked yet, add it
          streamingTools.value = [...streamingTools.value, event.tool]
        }
        break
      }

      case 'tool-confirmation-pending':
        pendingConfirmation.value = {
          toolCallName: event.toolCallName,
          confirmationPrompt: event.confirmationPrompt,
          toolCall: {
            name: event.toolCallName,
            displayName: event.toolDisplayName,
            payload: event.toolPayload,
            result: '',
            confirmationStatus: 'pending',
            confirmationPrompt: event.confirmationPrompt,
            metadata: { createdAt: new Date().toISOString() },
          },
        }
        break

      case 'conversation-created':
        currentConversation.value = dtoToConversation(event.conversation)
        // Subscribe to conversation events for multi-client sync
        subscribeToConversationEvents(event.conversation.id)
        break

      case 'interaction-started': {
        // Check if this is the same interaction we're already showing (avoid duplicates)
        if (currentInteraction.value && currentInteraction.value.id === event.interactionId) {
          break
        }

        resetStreamingState()
        isStreaming.value = true
        // Only set activeQueueId if this is our own stream, not from subscription
        // Setting it for subscription events would cause subsequent events to be filtered out
        if (!isFromSubscription) {
          activeQueueId.value = event.queueId ?? null
        }

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
          completed: false,
          aborted: false,
          error: false,
          metadata: { createdAt: new Date().toISOString() },
        }
        break
      }

      case 'interaction-saved':
        if (currentConversation.value) {
          const interaction = dtoToInteraction(event.interaction, currentConversation.value.id)

          // Check if we already have this interaction (avoid duplicates from race conditions)
          if (loadedInteractions.value.some(i => i.id === interaction.id)) {
            break
          }

          loadedInteractions.value = [interaction, ...loadedInteractions.value]
          totalInteractionsCount.value += 1
          currentInteraction.value = null

          // Notify callback (for notifications, etc.)
          onInteractionSaved?.(interaction)
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

    // Set activeQueueId early to filter out duplicate events from conversation subscription
    activeQueueId.value = queueId

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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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

    // Unsubscribe from previous conversation
    if (conversationUnsubscribe) {
      conversationUnsubscribe()
      conversationUnsubscribe = null
    }

    try {
      // Use IPC-based queue reset if available (Electron)
      if (api.chat.resetQueue) {
        await api.chat.resetQueue(sessionId.value, currentConversation.value?.id)
      } else {
        // Fall back to HTTP (web)
        await fetch('/api/chat/queue/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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

      // Subscribe to conversation events for multi-client sync
      subscribeToConversationEvents(conversationDTO.id)

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

      // Subscribe to conversation events for multi-client sync
      subscribeToConversationEvents(conversationDTO.id)

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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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

  /**
   * Respond to a pending tool confirmation
   */
  async function respondToConfirmation(response: { approved: boolean; denialReason?: string }): Promise<void> {
    if (!pendingConfirmation.value) return

    const toolCallName = pendingConfirmation.value.toolCallName

    try {
      // Use IPC-based confirmation response if available (Electron)
      const chatApi = api.chat as typeof api.chat & {
        respondToConfirmation?: (
          toolCallName: string,
          approved: boolean,
          denialReason?: string,
          sessionId?: string,
          conversationId?: string
        ) => Promise<void>
      }
      if (chatApi.respondToConfirmation) {
        await chatApi.respondToConfirmation(
          toolCallName,
          response.approved,
          response.denialReason,
          sessionId.value,
          currentConversation.value?.id
        )
      } else {
        // Fall back to HTTP (web)
        await fetch(`/api/chat/tool-confirmation/${encodeURIComponent(toolCallName)}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            approved: response.approved,
            denialReason: response.denialReason,
            sessionId: sessionId.value,
            conversationId: currentConversation.value?.id,
          }),
        })
      }
    } catch (error) {
      console.error('Failed to respond to tool confirmation', {
        toolCallName,
        response,
        error,
      })
    }

    // Clear pending confirmation
    pendingConfirmation.value = null
  }

  // Track chat events subscription for cleanup
  let chatEventsUnsubscribe: (() => void) | null = null
  // Track conversation subscription for real-time streaming sync
  let conversationUnsubscribe: (() => void) | null = null

  /**
   * Subscribe to real-time conversation events for multi-client sync.
   * This allows observer clients to see streaming in progress from other clients.
   */
  function subscribeToConversationEvents(conversationId: string): void {
    console.log(`[ChatView] subscribing to conversation: ${conversationId}`)

    // Unsubscribe from previous conversation if any
    if (conversationUnsubscribe) {
      conversationUnsubscribe()
      conversationUnsubscribe = null
    }

    // Only subscribe if the API supports it
    if (!api.chat.subscribeToConversation) {
      console.log(`[ChatView] subscribeToConversation not available in API`)
      return
    }

    conversationUnsubscribe = api.chat.subscribeToConversation(conversationId, (event) => {
      console.log(`[ChatView] received event from subscription: ${event.type}, queueId: ${event.queueId}, activeQueueId: ${activeQueueId.value}`)

      // Skip events from our own active stream to avoid duplicates
      // We identify our own events by queueId matching
      if (event.queueId && event.queueId === activeQueueId.value) {
        return
      }

      // For observer clients: handle streaming events from other clients
      // Pass isFromSubscription=true to avoid setting activeQueueId
      handleSSEEvent(event as SSEEvent, true)
    })
  }

  /**
   * Handle chat events from SSE stream.
   * When an instruction message is received for the current conversation,
   * reload the interactions to show the new messages and trigger notification.
   * When an interaction is saved from another session, reload to sync.
   */
  async function handleChatEvent(event: { type: string; conversationId?: string; sessionId?: string }) {
    // Handle interaction-saved events from other sessions
    if (event.type === 'interaction-saved') {
      // If we have a conversation subscription, skip this handler
      // The subscription will handle interaction-saved via handleSSEEvent
      if (conversationUnsubscribe) {
        return
      }

      // Skip events from our own session - we already have the update via streaming
      if (event.sessionId && event.sessionId === sessionId.value) {
        return
      }

      // Only refresh if we have a conversation and the event is for it
      if (currentConversation.value) {
        if (!event.conversationId || event.conversationId === currentConversation.value.id) {
          // Reload interactions to get the new interaction from the other client
          await loadInitialInteractions()
        }
      }
      return
    }

    if (event.type === 'instruction-received') {
      // Only refresh if we have a conversation and the event is for it
      // or if no conversationId in event (applies to any conversation)
      if (currentConversation.value) {
        if (!event.conversationId || event.conversationId === currentConversation.value.id) {
          // Store the latest interaction timestamp before reload to detect new ones
          // Using timestamp instead of ID set avoids pagination issues where older
          // interactions might not be loaded yet
          let latestTimestamp: string | null = null
          if (loadedInteractions.value.length > 0) {
            // loadedInteractions is sorted newest first, so first element is latest
            latestTimestamp = loadedInteractions.value[0]?.metadata?.createdAt ?? null
          }

          // Reload interactions to get the new instruction message and response
          await loadInitialInteractions()

          // Find new interactions by comparing timestamps
          // Interactions newer than our stored timestamp are new
          const newInteractions = latestTimestamp
            ? loadedInteractions.value.filter((i) => {
                const interactionTimestamp = i.metadata?.createdAt
                if (!interactionTimestamp) return false
                return interactionTimestamp > latestTimestamp
              })
            : loadedInteractions.value // If no previous interactions, all are new

          // Trigger background instruction callback for each new interaction
          for (const interaction of newInteractions) {
            onBackgroundInstruction?.(interaction)
          }
        }
      }
    }
  }

  // Auto-load conversation on mount
  onMounted(async () => {
    if (typeof window !== 'undefined') {
      window.addEventListener('stina-settings-updated', handleSettingsUpdated)
    }
    await loadDebugMode()

    // Subscribe to chat events for real-time updates
    if (api.chatEvents?.subscribe) {
      chatEventsUnsubscribe = api.chatEvents.subscribe(handleChatEvent)
    }

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
    // Cleanup chat events subscription
    if (chatEventsUnsubscribe) {
      chatEventsUnsubscribe()
      chatEventsUnsubscribe = null
    }
    // Cleanup conversation subscription
    if (conversationUnsubscribe) {
      conversationUnsubscribe()
      conversationUnsubscribe = null
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
    pendingConfirmation,
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
    respondToConfirmation,
  }
}
