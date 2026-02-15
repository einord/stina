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
import {
  setupStreamListeners,
  cleanupStreamListeners,
  type StreamListener,
} from './streamManager.js'
import {
  createToolExecutor,
  type LocalConfirmationStore,
} from './toolConfirmation.js'

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

  /** Pending confirmation resolvers, keyed by toolCallName */
  private pendingConfirmations: LocalConfirmationStore = new Map()

  /** Stream service event listeners for cleanup */
  private streamListeners: StreamListener[] = []

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
   * Resolve a pending tool confirmation.
   * Called when user responds to a confirmation dialog.
   * @param toolCallName - The name of the tool call to resolve
   * @param response - The user's response (approved or denied with optional reason)
   * @returns true if confirmation was found and resolved, false otherwise
   */
  resolveToolConfirmation(
    toolCallName: string,
    response: { approved: boolean; denialReason?: string }
  ): boolean {
    // Try centralized store first
    if (this.deps.confirmationStore && this.deps.userId) {
      const resolved = this.deps.confirmationStore.resolve(
        toolCallName,
        response,
        this.deps.userId
      )
      if (resolved) {
        return true
      }
    }

    // Fallback to local store
    const pending = this.pendingConfirmations.get(toolCallName)
    if (!pending) {
      return false
    }

    this.pendingConfirmations.delete(toolCallName)
    pending.resolve(response)
    return true
  }

  /**
   * Check if there's a pending confirmation for a tool.
   */
  hasPendingConfirmation(toolCallName: string): boolean {
    // Check centralized store first
    if (this.deps.confirmationStore?.has(toolCallName)) {
      return true
    }
    // Fallback to local store
    return this.pendingConfirmations.has(toolCallName)
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
      settings: { ...modelConfig?.settingsOverride, userId: this.deps.userId },
      tools: tools.length > 0 ? tools : undefined,
      toolExecutor: toolRegistry
        ? createToolExecutor(
            {
              userLanguage: this.deps.userLanguage ?? 'en',
              userId: this.deps.userId,
              timezone: this.deps.settingsStore?.get<string>(APP_NAMESPACE, 'timezone'),
              conversationId: this._conversation?.id,
              activeQueueId: this.activeQueueId ?? undefined,
              getToolDisplayName: this.deps.getToolDisplayName,
              confirmationStore: this.deps.confirmationStore,
              localConfirmations: this.pendingConfirmations,
              emitEvent: (event) => this.emitEvent(event),
            },
            (id) => toolRegistry.get(id)
          )
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

    // Reject all pending confirmations with abortion
    // Clear centralized store for this conversation
    if (this.deps.confirmationStore && this._conversation) {
      this.deps.confirmationStore.clearForConversation(this._conversation.id)
    }
    // Clear local store
    if (this.pendingConfirmations.size > 0) {
      this.pendingConfirmations.forEach((pending) => {
        pending.resolve({ approved: false, denialReason: 'Stream aborted' })
      })
      this.pendingConfirmations.clear()
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
    // Remove stream listeners via extracted module
    cleanupStreamListeners(this.streamService, this.streamListeners)
    this.streamListeners = []

    // Also call removeAllListeners as a safety net
    this.streamService.removeAllListeners()
    this.eventCallbacks = []
  }

  private setupStreamListeners(): void {
    // Delegate to streamManager module, providing access to orchestrator state via closures
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed for getter/setter closures
    const self = this
    this.streamListeners = setupStreamListeners(
      this.streamService,
      this.repository,
      {
        get isStreaming() { return self._isStreaming },
        set isStreaming(v) { self._isStreaming = v },
        get streamingContent() { return self._streamingContent },
        set streamingContent(v) { self._streamingContent = v },
        get streamingThinking() { return self._streamingThinking },
        set streamingThinking(v) { self._streamingThinking = v },
        get streamingTools() { return self._streamingTools },
        set streamingTools(v) { self._streamingTools = v },
        get currentInteraction() { return self._currentInteraction },
        set currentInteraction(v) { self._currentInteraction = v },
        get loadedInteractions() { return self._loadedInteractions },
        set loadedInteractions(v) { self._loadedInteractions = v },
        get totalInteractionsCount() { return self._totalInteractionsCount },
        set totalInteractionsCount(v) { self._totalInteractionsCount = v },
        get error() { return self._error },
        set error(v) { self._error = v },
      },
      {
        getActiveQueueId: () => this.activeQueueId ?? undefined,
        emitEvent: (event) => this.emitEvent(event),
        emitStateChange: () => this.emitStateChange(),
        resetStreamingState: () => this.resetStreamingState(),
        addMessage: (interaction, message) =>
          this.conversationService.addMessage(interaction, message),
      }
    )
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
    // Emit to local callbacks
    for (const callback of this.eventCallbacks) {
      try {
        callback(event)
      } catch (err) {
        // Log but don't propagate - callback errors should not break the main flow
        console.warn('Orchestrator event callback error:', err)
      }
    }

    // Publish to event bus for multi-client synchronization
    if (this.deps.eventBus && this._conversation) {
      this.deps.eventBus.publish(this._conversation.id, event)
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
