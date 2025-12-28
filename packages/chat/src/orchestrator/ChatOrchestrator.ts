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
import { getSystemPrompt } from '../constants/index.js'

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
   * Build complete message history for provider.
   * Includes all loaded interactions plus current interaction.
   */
  buildMessageHistory(): Message[] {
    const allMessages: Message[] = []

    // Add from loaded interactions (reverse to get chronological order, oldest first)
    const chronological = [...this._loadedInteractions].reverse()
    for (const interaction of chronological) {
      allMessages.push(...interaction.messages)
    }

    // Add current interaction messages
    if (this._currentInteraction) {
      allMessages.push(...this._currentInteraction.messages)
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

    await this.repository.saveConversation(conversation)

    this.emitEvent({ type: 'conversation-created', conversation })
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
   * Send a message and stream response from AI provider
   */
  async sendMessage(text: string): Promise<void> {
    this._error = null

    // Create conversation if none exists
    if (!this._conversation) {
      await this.createConversation()
    }

    // Create new interaction
    const interaction = this.conversationService.createInteraction(this._conversation!.id)

    // Add user message
    const userMessage: Message = {
      type: 'user',
      text,
      metadata: { createdAt: new Date().toISOString() },
    }
    this.conversationService.addMessage(interaction, userMessage)

    this._currentInteraction = interaction
    this._isStreaming = true
    this.emitStateChange()

    // Get provider
    const providers = this.deps.providerRegistry.list()
    const provider = providers[0] // Use first available provider

    if (!provider) {
      this._error = new Error('No AI provider available')
      this._isStreaming = false
      this.emitStateChange()
      this.emitEvent({ type: 'stream-error', error: this._error })
      return
    }

    // Get system prompt
    const systemPrompt = getSystemPrompt(this.deps.settingsStore)

    // Build message history and send
    const messages = this.buildMessageHistory()

    try {
      await provider.sendMessage(messages, systemPrompt, (event) => {
        this.streamService.handleStreamEvent(event)
      })
    } catch (err) {
      this._error = err as Error
      this._isStreaming = false
      this.resetStreamingState()
      this.emitStateChange()
      this.emitEvent({ type: 'stream-error', error: this._error })
    }
  }

  /**
   * Abort current streaming interaction
   */
  abort(): void {
    if (this._currentInteraction && this._isStreaming) {
      this.conversationService.abortInteraction(this._currentInteraction)
      this._isStreaming = false
      this.resetStreamingState()
      this.emitStateChange()
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
      this._streamingThinking = text
      this.emitStateChange()
      this.emitEvent({ type: 'thinking-update', text })
    })

    this.streamService.on('content-update', (text: string) => {
      this._streamingContent = text
      this.emitStateChange()
      this.emitEvent({ type: 'content-update', text })
    })

    this.streamService.on('tool-start', (name: string) => {
      if (!this._streamingTools.includes(name)) {
        this._streamingTools.push(name)
        this.emitStateChange()
      }
      this.emitEvent({ type: 'tool-start', name })
    })

    this.streamService.on('tool-complete', (tool) => {
      this.emitEvent({ type: 'tool-complete', tool })
    })

    this.streamService.on('stream-complete', async (finalMessages: Message[]) => {
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
        })

        // Clear current interaction
        this._currentInteraction = null
      }

      this.resetStreamingState()
      this.emitStateChange()
      this.emitEvent({ type: 'stream-complete', messages: finalMessages })
    })

    this.streamService.on('stream-error', (err: Error) => {
      this._isStreaming = false
      this._error = err
      this.resetStreamingState()
      this.emitStateChange()
      this.emitEvent({ type: 'stream-error', error: err })
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
}
