/**
 * Extension Provider Adapter
 *
 * Bridges extension-api AIProvider to packages/chat AIProvider interface.
 * This allows extensions to provide AI functionality that works with ChatOrchestrator.
 */

import type { ExtensionHost, ProviderInfo } from './ExtensionHost.js'
import type { ChatMessage, StreamEvent as ExtStreamEvent } from '@stina/extension-api'

/**
 * StreamEvent as expected by packages/chat
 */
export type ChatStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; payload: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'content'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: Error }

/**
 * Message type from packages/chat (matches Message union type)
 */
export interface ChatMessage_Chat {
  type: 'user' | 'stina' | 'instruction' | 'information' | 'thinking' | 'tools'
  text?: string
  tools?: Array<{ name: string; payload: string; result: string }>
  metadata: { createdAt: string; [key: string]: unknown }
}

/**
 * Options for sendMessage call
 */
export interface ChatSendMessageOptions {
  /** Provider-specific settings (e.g., URL for Ollama) */
  settings?: Record<string, unknown>
  /** Model ID to use */
  modelId?: string
}

/**
 * AIProvider interface as expected by packages/chat
 */
export interface ChatAIProvider {
  id: string
  name: string
  sendMessage(
    messages: ChatMessage_Chat[],
    systemPrompt: string,
    onEvent: (event: ChatStreamEvent) => void,
    options?: ChatSendMessageOptions
  ): Promise<void>
}

/**
 * Convert packages/chat Message to extension-api ChatMessage
 */
function convertToExtensionMessage(msg: ChatMessage_Chat): ChatMessage | null {
  switch (msg.type) {
    case 'user':
      return { role: 'user', content: msg.text || '' }
    case 'stina':
      return { role: 'assistant', content: msg.text || '' }
    case 'instruction':
      return { role: 'system', content: msg.text || '' }
    // Skip information, thinking, and tools messages as they don't map to standard chat roles
    default:
      return null
  }
}

/**
 * Creates an adapter that wraps an extension provider to work with ChatOrchestrator
 */
export function createExtensionProviderAdapter(
  extensionHost: ExtensionHost,
  providerInfo: ProviderInfo
): ChatAIProvider {
  return {
    id: providerInfo.id,
    name: providerInfo.name,

    async sendMessage(
      messages: ChatMessage_Chat[],
      systemPrompt: string,
      onEvent: (event: ChatStreamEvent) => void,
      options?: ChatSendMessageOptions
    ): Promise<void> {
      // Convert messages to extension-api format
      const extMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages
          .map(convertToExtensionMessage)
          .filter((m): m is ChatMessage => m !== null),
      ]

      try {
        // Build chat options with settings from modelConfig
        const chatOptions = {
          model: options?.modelId,
          settings: options?.settings,
        }

        // Get the streaming generator from the extension
        const stream = extensionHost.chat(providerInfo.id, extMessages, chatOptions)

        // Process events and convert them
        for await (const event of stream) {
          const converted = convertStreamEvent(event)
          if (converted) {
            onEvent(converted)
          }
        }

        // Always emit done at the end
        onEvent({ type: 'done' })
      } catch (error) {
        onEvent({
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    },
  }
}

/**
 * Convert extension-api StreamEvent to chat StreamEvent
 */
function convertStreamEvent(event: ExtStreamEvent): ChatStreamEvent | null {
  switch (event.type) {
    case 'content':
      return { type: 'content', text: event.text }

    case 'thinking':
      return { type: 'thinking', text: event.text }

    case 'tool_start':
      return {
        type: 'tool',
        name: event.name,
        payload: typeof event.input === 'string' ? event.input : JSON.stringify(event.input),
      }

    case 'tool_end':
      return {
        type: 'tool_result',
        name: event.name,
        result: typeof event.output === 'string' ? event.output : JSON.stringify(event.output),
      }

    case 'done':
      // Will be handled after the loop
      return null

    case 'error':
      return { type: 'error', error: new Error(event.message) }

    default:
      return null
  }
}

/**
 * Watches an ExtensionHost and automatically registers/unregisters providers
 * with the chat's ProviderRegistry
 */
export class ExtensionProviderBridge {
  private readonly extensionHost: ExtensionHost
  private readonly onProviderAdded: (provider: ChatAIProvider) => void
  private readonly onProviderRemoved: (providerId: string) => void
  private readonly adapters = new Map<string, ChatAIProvider>()

  constructor(
    extensionHost: ExtensionHost,
    onProviderAdded: (provider: ChatAIProvider) => void,
    onProviderRemoved: (providerId: string) => void
  ) {
    this.extensionHost = extensionHost
    this.onProviderAdded = onProviderAdded
    this.onProviderRemoved = onProviderRemoved

    // Listen for provider registration events
    this.extensionHost.on('provider-registered', this.handleProviderRegistered.bind(this))
    this.extensionHost.on('provider-unregistered', this.handleProviderUnregistered.bind(this))

    // Register any already-loaded providers
    for (const provider of this.extensionHost.getProviders()) {
      this.handleProviderRegistered(provider)
    }
  }

  private handleProviderRegistered(providerInfo: ProviderInfo): void {
    const adapter = createExtensionProviderAdapter(this.extensionHost, providerInfo)
    this.adapters.set(providerInfo.id, adapter)
    this.onProviderAdded(adapter)
  }

  private handleProviderUnregistered(providerId: string): void {
    this.adapters.delete(providerId)
    this.onProviderRemoved(providerId)
  }

  /**
   * Get all adapted providers
   */
  getProviders(): ChatAIProvider[] {
    return Array.from(this.adapters.values())
  }

  /**
   * Get a specific provider
   */
  getProvider(providerId: string): ChatAIProvider | undefined {
    return this.adapters.get(providerId)
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    this.extensionHost.off('provider-registered', this.handleProviderRegistered.bind(this))
    this.extensionHost.off('provider-unregistered', this.handleProviderUnregistered.bind(this))
    this.adapters.clear()
  }
}
