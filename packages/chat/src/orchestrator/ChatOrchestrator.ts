import { nanoid } from 'nanoid'
import type { Conversation, Interaction, Message } from '../types/index.js'
import type { IConversationRepository } from './IConversationRepository.js'
import type {
  OrchestratorEvent,
  ChatState,
  ChatOrchestratorOptions,
  ChatOrchestratorDeps,
} from './types.js'
import { ConversationService } from '../services/ConversationService.js'
import { ChatStreamService } from '../services/ChatStreamService.js'
import {
  getSystemPrompt,
  getGreetingInstruction,
  getPromptUpdatePrefix,
  getPromptUpdateInfo,
  getPromptUpdateInstruction,
} from '../constants/index.js'
import {
  ChatMessageQueue,
  type QueuedMessage,
  type QueuedMessageRole,
  type QueuedMessageContext,
} from './ChatMessageQueue.js'
import { APP_NAMESPACE } from '@stina/core'
import type { ToolExecutionContext } from '../tools/ToolRegistry.js'

export type OrchestratorEventCallback = (event: OrchestratorEvent) => void

/**
 * Platform-neutral chat orchestration service.
 * Coordinates conversations, providers, streaming, and persistence.
 *
 * Usage:
 * - Electron/TUI: Instantiate directly with ConversationRepository
 * - API: Instantiate per-request for SSE streaming
 * - Vue: Do NOT use directly - use SSE client instead
 */
let orchestratorIdCounter = 0

export class ChatOrchestrator {
  private repository: IConversationRepository
  private deps: ChatOrchestratorDeps
  private conversationService = new ConversationService()
  private streamService = new ChatStreamService()
  private pageSize: number
  public readonly instanceId = ++orchestratorIdCounter
  private eventCallbacks: OrchestratorEventCallback[] = []
  private queue = new ChatMessageQueue()
  private pendingQueueResolves = new Map<string, () => void>()
  private isQueueProcessing = false
  private activeQueueId: string | null = null
  private streamToken = 0
  private activeStreamToken = 0
  private activeAbortGate: { promise: Promise<void>; cancel: () => void } | null = null

  // Internal state
  private _conversation: Conversation | null = null
  private _currentInteraction: Interaction | null = null
  private _loadedInteractions: Interaction[] = []
  private _totalInteractionsCount = 0
  private _isStreaming = false
  private _streamingContent = ''
  private _streamingThinking = ''
  private _streamingTools: string[] = []
  private _error: Error | null = null
  private lastSystemPrompt: string | null = null

  constructor(deps: ChatOrchestratorDeps, options: ChatOrchestratorOptions = {}) {
    this.deps = deps
    this.repository = deps.repository
    this.pageSize = options.pageSize ?? 10
    this.setupStreamListeners()
  }

  /**
   * Register event callback
   */
  on(_eventName: 'event', callback: OrchestratorEventCallback): void {
    this.eventCallbacks.push(callback)
  }

  /**
   * Remove event callback
   */
  off(_eventName: 'event', callback: OrchestratorEventCallback): void {
    const index = this.eventCallbacks.indexOf(callback)
    if (index >= 0) {
      this.eventCallbacks.splice(index, 1)
    }
  }

  /**
   * Remove all callbacks
   */
  removeAllListeners(): void {
    this.eventCallbacks = []
  }

  /**
   * Get current state snapshot
   */
  getState(): ChatState {
    return {
      conversation: this._conversation,
      currentInteraction: this._currentInteraction,
      loadedInteractions: [...this._loadedInteractions],
      totalInteractionsCount: this._totalInteractionsCount,
      isStreaming: this._isStreaming,
      streamingContent: this._streamingContent,
      streamingThinking: this._streamingThinking,
      streamingTools: [...this._streamingTools],
      error: this._error,
      queue: this.getQueueState(),
    }
  }

  /**
   * Whether there are more interactions to load
   */
  get hasMoreInteractions(): boolean {
    return this._loadedInteractions.length < this._totalInteractionsCount
  }

  /**
   * Get current conversation
   */
  get conversation(): Conversation | null {
    return this._conversation
  }

  /**
   * Get current queue state (pending items only)
   */
  getQueueState() {
    const isProcessing =
      this._isStreaming ||
      this.activeQueueId !== null ||
      this.isQueueProcessing ||
      this.queue.length > 0
    return this.queue.getSnapshot(isProcessing)
  }

  /**
   * Build complete message history for provider.
   * Includes all loaded interactions plus current interaction.
   * Excludes interactions that encountered errors.
   */
  buildMessageHistory(): Message[] {
    const allMessages: Message[] = []
    const isSystemPromptMessage = (message: Message): boolean =>
      message.type === 'instruction' && message.metadata?.['systemPrompt'] === true

    // Add from loaded interactions (reverse to get chronological order, oldest first)
    // Filter out interactions that had errors - they shouldn't be included in history
    const chronological = [...this._loadedInteractions].reverse()
    for (const interaction of chronological) {
      if (!interaction.error) {
        allMessages.push(...interaction.messages.filter((message) => !isSystemPromptMessage(message)))
      }
    }

    // Add current interaction messages
    if (this._currentInteraction) {
      allMessages.push(
        ...this._currentInteraction.messages.filter((message) => !isSystemPromptMessage(message))
      )
    }

    return allMessages
  }

  /**
   * Create a new conversation
   */
  async createConversation(title?: string): Promise<Conversation> {
    const conversation = this.conversationService.createConversation(title)
    this._conversation = conversation
    this._loadedInteractions = []
    this._totalInteractionsCount = 0
    this._currentInteraction = null
    this._error = null
    this.lastSystemPrompt = null

    await this.repository.saveConversation(conversation)

    this.emitEvent({
      type: 'conversation-created',
      conversation,
      queueId: this.activeQueueId ?? undefined,
    })
    this.emitStateChange()

    return conversation
  }

  /**
   * Load a conversation by ID
   */
  async loadConversation(id: string): Promise<void> {
    this._error = null

    const conversation = await this.repository.getConversation(id)
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`)
    }

    this._conversation = {
      ...conversation,
      interactions: [], // Don't load all at once, use pagination
    }
    this.lastSystemPrompt = this.resolveStoredSystemPrompt(this._conversation)

    await this.loadInitialInteractions()
  }

  /**
   * Load latest active conversation
   * @returns true if a conversation was found, false otherwise
   */
  async loadLatestConversation(): Promise<boolean> {
    this._error = null

    const conversation = await this.repository.getLatestActiveConversation()
    if (!conversation) {
      return false
    }

    this._conversation = {
      ...conversation,
      interactions: [],
    }
    this.lastSystemPrompt = this.resolveStoredSystemPrompt(this._conversation)

    await this.loadInitialInteractions()
    return true
  }

  /**
   * Load initial interactions with pagination
   */
  private async loadInitialInteractions(): Promise<void> {
    if (!this._conversation) return

    const count = await this.repository.countConversationInteractions(this._conversation.id)
    this._totalInteractionsCount = count

    const interactions = await this.repository.getConversationInteractions(
      this._conversation.id,
      this.pageSize,
      0
    )
    this._loadedInteractions = interactions
    if (!this.lastSystemPrompt) {
      this.lastSystemPrompt = this.resolveSystemPromptFromInteractions(interactions)
    }

    this.emitStateChange()
  }

  /**
   * Load more (older) interactions
   */
  async loadMoreInteractions(): Promise<void> {
    if (!this._conversation || !this.hasMoreInteractions) return

    const offset = this._loadedInteractions.length
    const interactions = await this.repository.getConversationInteractions(
      this._conversation.id,
      this.pageSize,
      offset
    )

    this._loadedInteractions.push(...interactions)
    this.emitStateChange()
  }

  /**
   * Send a message (queued, FIFO)
   */
  async sendMessage(text: string): Promise<void> {
    await this.enqueueMessage(text, 'user')
  }

  /**
   * Enqueue a message with optional role and queue id.
   */
  async enqueueMessage(
    text: string,
    role: QueuedMessageRole = 'user',
    queueId?: string,
    context?: QueuedMessageContext
  ): Promise<void> {
    const id = queueId ?? nanoid()
    const done = new Promise<void>((resolve) => {
      this.pendingQueueResolves.set(id, resolve)
    })

    this.queue.enqueue({
      id,
      text,
      role,
      context,
      createdAt: new Date().toISOString(),
    })

    this.emitQueueUpdate()
    void this.processQueue()

    return done
  }

  /**
   * Remove a queued message before it starts processing.
   */
  removeQueued(id: string): boolean {
    if (this.activeQueueId === id) {
      return false
    }

    const removed = this.queue.remove(id)
    if (!removed) return false

    this.resolveQueueJob(id)
    this.emitQueueUpdate()
    return true
  }

  /**
   * Clear all queued messages (does not affect current stream).
   */
  clearQueue(): void {
    const removed = this.queue.clear()
    for (const item of removed) {
      this.resolveQueueJob(item.id)
    }
    this.emitQueueUpdate()
  }

  /**
   * Reset conversation state and clear the queue.
   */
  resetConversation(): void {
    this.abort({ continueQueue: false })
    this.clearQueue()
    this._conversation = null
    this._currentInteraction = null
    this._loadedInteractions = []
    this._totalInteractionsCount = 0
    this._error = null
    this.lastSystemPrompt = null
    this.emitStateChange()
  }

  private async processQueue(): Promise<void> {
    if (this.isQueueProcessing) return
    this.isQueueProcessing = true

    while (this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job) break

      this.activeQueueId = job.id
      this.emitQueueUpdate()

      await this.processQueuedMessage(job)

      this.resolveQueueJob(job.id)
      this.activeQueueId = null
      this.emitQueueUpdate()
    }

    this.isQueueProcessing = false
    this.emitQueueUpdate()
  }

  private async processQueuedMessage(job: QueuedMessage): Promise<void> {
    this._error = null

    // Create conversation if none exists
    const isConversationStart = !this._conversation
    if (!this._conversation) {
      await this.createConversation()
    }

    const systemPrompt = getSystemPrompt(this.deps.settingsStore)
    const promptChanged = this.lastSystemPrompt !== systemPrompt
    const includeSystemPrompt =
      isConversationStart || promptChanged || job.context === 'settings-update'
    const systemPromptMessageText = includeSystemPrompt
      ? job.context === 'settings-update'
        ? `${getPromptUpdatePrefix(this.deps.settingsStore)}\n\n${systemPrompt}`
        : systemPrompt
      : ''

    // Create new interaction
    const interaction = this.conversationService.createInteraction(this._conversation!.id)

    if (job.context === 'settings-update') {
      const infoMessage = getPromptUpdateInfo(this.deps.settingsStore)
      if (infoMessage.trim()) {
        interaction.informationMessages.push({
          type: 'information',
          text: infoMessage,
          metadata: { createdAt: new Date().toISOString() },
        })
      }
    }

    if (includeSystemPrompt && systemPromptMessageText.trim()) {
      const instructionMessage: Message = {
        type: 'instruction',
        text: systemPromptMessageText,
        metadata: {
          createdAt: new Date().toISOString(),
          systemPrompt: true,
          systemPromptBase: systemPrompt,
          systemPromptContext: job.context ?? (isConversationStart ? 'conversation-start' : 'update'),
        },
      }
      this.conversationService.addMessage(interaction, instructionMessage)
    }

    let queueText = job.text
    if (job.role === 'instruction' && !queueText.trim()) {
      if (job.context === 'conversation-start') {
        queueText = getGreetingInstruction(this.deps.settingsStore)
      } else if (job.context === 'settings-update') {
        queueText = getPromptUpdateInstruction(this.deps.settingsStore)
      }
    }

    // Add user or instruction message
    const messageType = job.role === 'instruction' ? 'instruction' : 'user'
    const userMessage: Message = {
      type: messageType,
      text: queueText,
      metadata: { createdAt: new Date().toISOString() },
    }
    this.conversationService.addMessage(interaction, userMessage)

    this._currentInteraction = interaction
    this._isStreaming = true
    this.emitEvent({
      type: 'interaction-started',
      interactionId: interaction.id,
      conversationId: interaction.conversationId,
      role: job.role,
      text: queueText,
      systemPrompt: includeSystemPrompt ? systemPromptMessageText : undefined,
      informationMessages:
        interaction.informationMessages.length > 0 ? interaction.informationMessages : undefined,
      queueId: job.id,
    })
    this.emitStateChange()

    if (includeSystemPrompt && systemPrompt.trim()) {
      this.lastSystemPrompt = systemPrompt
      if (this._conversation) {
        this._conversation.metadata = {
          ...this._conversation.metadata,
          systemPrompt,
        }
        await this.repository.updateConversationMetadata(
          this._conversation.id,
          this._conversation.metadata
        )
      }
    }

    // Get model configuration if available
    const modelConfig = await this.deps.modelConfigProvider?.getDefault()

    // Get provider - use from modelConfig if available, otherwise first available
    let provider
    if (modelConfig) {
      provider = this.deps.providerRegistry.get(modelConfig.providerId)
    }
    if (!provider) {
      const providers = this.deps.providerRegistry.list()
      provider = providers[0]
    }

    if (!provider) {
      this._error = new Error('No AI provider available')
      this._isStreaming = false
      this.emitStateChange()
      this.emitEvent({ type: 'stream-error', error: this._error, queueId: job.id })
      return
    }

    // Build message history and send
    const messages = this.buildMessageHistory()

    // Get available tools from registry
    const toolRegistry = this.deps.toolRegistry
    const tools = toolRegistry?.getToolDefinitions() ?? []

    // Build options with model settings and tools
    const sendOptions = {
      modelId: modelConfig?.modelId,
      settings: modelConfig?.settingsOverride,
      tools: tools.length > 0 ? tools : undefined,
      toolExecutor: toolRegistry
        ? async (toolId: string, params: Record<string, unknown>) => {
            const tool = toolRegistry.get(toolId)
            if (!tool) {
              return { success: false, error: `Tool "${toolId}" not found` }
            }
            // Build execution context with user-specific runtime data
            const executionContext: ToolExecutionContext = {
              timezone: this.deps.settingsStore?.get<string>(APP_NAMESPACE, 'timezone'),
            }
            return tool.execute(params, executionContext)
          }
        : undefined,
      getToolDisplayName: this.deps.getToolDisplayName,
    }

    const streamToken = (this.streamToken += 1)
    this.activeStreamToken = streamToken

    const abortGate = this.createAbortGate()
    this.activeAbortGate = abortGate

    const sendPromise = provider
      .sendMessage(
        messages,
        systemPrompt,
        (event) => {
          if (this.activeStreamToken !== streamToken) return
          this.streamService.handleStreamEvent(event)
        },
        sendOptions
      )
      .catch((err) => {
        if (this.activeStreamToken !== streamToken) return
        this._error = err as Error
        this._isStreaming = false
        this.resetStreamingState()
        this.emitStateChange()
        this.emitEvent({ type: 'stream-error', error: this._error, queueId: job.id })
      })

    await Promise.race([sendPromise, abortGate.promise])
    this.activeAbortGate = null
  }

  /**
   * Abort current streaming interaction
   */
  abort(options: { continueQueue?: boolean } = {}): void {
    if (this._currentInteraction && this._isStreaming) {
      this.conversationService.abortInteraction(this._currentInteraction)
      this._isStreaming = false
      this._currentInteraction = null
      this.resetStreamingState()
      this.streamService.resetState()
      this.activeStreamToken = (this.streamToken += 1)
      this.activeQueueId = null
      this.emitQueueUpdate()
      this.emitStateChange()
    }

    if (this.activeAbortGate) {
      this.activeAbortGate.cancel()
      this.activeAbortGate = null
    }

    if (options.continueQueue !== false) {
      void this.processQueue()
    }
  }

  private resolveQueueJob(id: string): void {
    const resolve = this.pendingQueueResolves.get(id)
    if (!resolve) return
    this.pendingQueueResolves.delete(id)
    resolve()
  }

  private emitQueueUpdate(): void {
    this.emitEvent({ type: 'queue-update', queue: this.getQueueState() })
  }

  private createAbortGate() {
    let resolver: (() => void) | null = null
    const promise = new Promise<void>((resolve) => {
      resolver = resolve
    })

    return {
      promise,
      cancel: () => {
        resolver?.()
      },
    }
  }

  /**
   * Archive current conversation
   */
  async archiveConversation(): Promise<void> {
    if (!this._conversation) return

    await this.repository.archiveConversation(this._conversation.id)
    this._conversation = null
    this._currentInteraction = null
    this._loadedInteractions = []
    this._totalInteractionsCount = 0

    this.emitStateChange()
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.streamService.removeAllListeners()
    this.eventCallbacks = []
  }

  private setupStreamListeners(): void {
    this.streamService.on('thinking-update', (text: string) => {
      const queueId = this.activeQueueId ?? undefined
      this._streamingThinking = text
      this.emitStateChange()
      this.emitEvent({ type: 'thinking-update', text, queueId })
    })

    this.streamService.on('content-update', (text: string) => {
      const queueId = this.activeQueueId ?? undefined
      this._streamingContent = text
      this.emitStateChange()
      this.emitEvent({ type: 'content-update', text, queueId })
    })

    this.streamService.on('tool-start', (name: string) => {
      const queueId = this.activeQueueId ?? undefined
      if (!this._streamingTools.includes(name)) {
        this._streamingTools.push(name)
        this.emitStateChange()
      }
      this.emitEvent({ type: 'tool-start', name, queueId })
    })

    this.streamService.on('tool-complete', (tool) => {
      const queueId = this.activeQueueId ?? undefined
      this.emitEvent({ type: 'tool-complete', tool, queueId })
    })

    this.streamService.on('stream-complete', async (finalMessages: Message[]) => {
      const queueId = this.activeQueueId ?? undefined
      this._isStreaming = false

      if (this._currentInteraction) {
        // Add messages to interaction
        finalMessages.forEach((msg) => {
          this.conversationService.addMessage(this._currentInteraction!, msg)
        })

        // Save to repository
        await this.repository.saveInteraction(this._currentInteraction)

        // Add to loaded interactions (prepend as it's the newest)
        this._loadedInteractions.unshift(this._currentInteraction)
        this._totalInteractionsCount += 1

        this.emitEvent({
          type: 'interaction-saved',
          interaction: this._currentInteraction,
          queueId,
        })

        // Clear current interaction
        this._currentInteraction = null
      }

      this.resetStreamingState()
      this.emitStateChange()
      this.emitEvent({ type: 'stream-complete', messages: finalMessages, queueId })
    })

    this.streamService.on('stream-error', async (err: Error) => {
      const queueId = this.activeQueueId ?? undefined
      this._isStreaming = false
      this._error = err

      // If we have a current interaction, save it with the error info
      if (this._currentInteraction) {
        // Mark the interaction as having an error
        this._currentInteraction.error = true
        this._currentInteraction.errorMessage = err.message

        // Add an error message to display in the chat
        // Use error code and raw message - UI layer handles localization
        const errorMessage: Message = {
          type: 'stina',
          text: err.message,
          metadata: {
            createdAt: new Date().toISOString(),
            errorCode: 'CHAT_STREAM_ERROR',
            isError: true,
          },
        }
        this.conversationService.addMessage(this._currentInteraction, errorMessage)

        // Save the failed interaction to the database
        await this.repository.saveInteraction(this._currentInteraction)

        // Add to loaded interactions so it shows in the UI
        this._loadedInteractions.unshift(this._currentInteraction)
        this._totalInteractionsCount += 1

        this.emitEvent({
          type: 'interaction-saved',
          interaction: this._currentInteraction,
          queueId,
        })

        // Clear current interaction
        this._currentInteraction = null
      }

      this.resetStreamingState()
      this.emitStateChange()
      this.emitEvent({ type: 'stream-error', error: err, queueId })
    })
  }

  private resetStreamingState(): void {
    this._streamingContent = ''
    this._streamingThinking = ''
    this._streamingTools = []
  }

  private emitStateChange(): void {
    this.emitEvent({ type: 'state-change' })
  }

  private emitEvent(event: OrchestratorEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event)
      } catch {
        // Ignore callback errors
      }
    }
  }

  private resolveStoredSystemPrompt(conversation: Conversation | null): string | null {
    if (!conversation) return null
    const stored = conversation.metadata?.['systemPrompt']
    if (typeof stored !== 'string') return null
    const trimmed = stored.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private resolveSystemPromptFromInteractions(interactions: Interaction[]): string | null {
    for (const interaction of interactions) {
      for (const message of interaction.messages) {
        if (message.type !== 'instruction') continue
        if (message.metadata?.['systemPrompt'] !== true) continue
        const base = message.metadata?.['systemPromptBase']
        if (typeof base === 'string' && base.trim()) {
          return base.trim()
        }
      }
    }
    return null
  }
}
