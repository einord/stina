/**
 * Extension Provider Adapter
 *
 * Bridges extension-api AIProvider to packages/chat AIProvider interface.
 * This allows extensions to provide AI functionality that works with ChatOrchestrator.
 */

import type { ExtensionHost, ProviderInfo } from './ExtensionHost.js'
import type { ChatMessage, StreamEvent as ExtStreamEvent, ToolDefinition, ToolResult } from '@stina/extension-api'

/**
 * StreamEvent as expected by packages/chat
 */
export type ChatStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; displayName?: string; payload: string }
  | { type: 'tool_result'; name: string; displayName?: string; result: string }
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
  /** Request context (user info, session metadata — not provider config) */
  context?: { userId?: string; [key: string]: unknown }
  /** Model ID to use */
  modelId?: string
  /** Available tools for this request */
  tools?: ToolDefinition[]
  /**
   * Tool executor for handling tool calls.
   * Called when the AI requests to use a tool.
   */
  toolExecutor?: (toolId: string, params: Record<string, unknown>) => Promise<ToolResult>
  /**
   * Get the localized display name for a tool.
   * Called when emitting tool events to get a user-friendly name.
   */
  getToolDisplayName?: (toolId: string) => string | undefined
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
      const hasSystemPromptMessage = messages.some(
        (message) => message.type === 'instruction' && message.metadata?.['systemPrompt'] === true
      )
      const systemMessages: ChatMessage[] =
        systemPrompt.trim() && !hasSystemPromptMessage
          ? [{ role: 'system', content: systemPrompt }]
          : []

      const extMessages: ChatMessage[] = [
        ...systemMessages,
        ...messages
          .map(convertToExtensionMessage)
          .filter((m): m is ChatMessage => m !== null),
      ]

      try {
        // Build chat options with settings from modelConfig
        const chatOptions = {
          model: options?.modelId,
          settings: options?.settings,
          context: options?.context,
          tools: options?.tools,
        }

        // Agentic loop: keep processing until we get a content response without tool calls
        let continueLoop = true
        const maxIterations = 10 // Safety limit to prevent infinite loops
        let iterations = 0

        while (continueLoop && iterations < maxIterations) {
          iterations++
          continueLoop = false // Will be set to true if we need another iteration

          // Get the streaming generator from the extension
          const stream = extensionHost.chat(providerInfo.id, extMessages, chatOptions)

          // Collect tool calls from this iteration
          const pendingToolCalls: Array<{ id: string; name: string; input: unknown }> = []

          // Process events and convert them
          for await (const event of stream) {
            if (event.type === 'tool_start') {
              // Collect tool call for execution
              pendingToolCalls.push({
                id: event.toolCallId,
                name: event.name,
                input: event.input as Record<string, unknown>,
              })

              // Emit tool event to UI
              onEvent({
                type: 'tool',
                name: event.name,
                displayName: options?.getToolDisplayName?.(event.name),
                payload: typeof event.input === 'string' ? event.input : JSON.stringify(event.input),
              })
            } else if (event.type === 'tool_end') {
              onEvent({
                type: 'tool_result',
                name: event.name,
                displayName: options?.getToolDisplayName?.(event.name),
                result: typeof event.output === 'string' ? event.output : JSON.stringify(event.output),
              })
              // Remove from pending — the tool was already executed by the provider
              const idx = pendingToolCalls.findIndex((tc) => tc.id === event.toolCallId)
              if (idx !== -1) {
                pendingToolCalls.splice(idx, 1)
              }
            } else {
              const converted = convertStreamEvent(event)
              if (converted) {
                onEvent(converted)
              }
            }
          }

          // If we have tool calls and a tool executor, execute them
          if (pendingToolCalls.length > 0 && options?.toolExecutor) {
            continueLoop = true // We need another iteration after tool execution

            // Add assistant message with tool calls to history
            extMessages.push({
              role: 'assistant',
              content: '',
              tool_calls: pendingToolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.input as Record<string, unknown>,
              })),
            })

            // Execute each tool and add results to history
            for (const toolCall of pendingToolCalls) {
              try {
                const result = await options.toolExecutor(toolCall.name, toolCall.input as Record<string, unknown>)

                // Emit tool result event
                onEvent({
                  type: 'tool_result',
                  name: toolCall.name,
                  displayName: options?.getToolDisplayName?.(toolCall.name),
                  result: JSON.stringify(result),
                })

                // Add tool result to message history
                extMessages.push({
                  role: 'tool',
                  content: JSON.stringify(result),
                  tool_call_id: toolCall.id,
                })
              } catch (error) {
                const errorResult = {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                }

                // Emit error as tool result
                onEvent({
                  type: 'tool_result',
                  name: toolCall.name,
                  displayName: options?.getToolDisplayName?.(toolCall.name),
                  result: JSON.stringify(errorResult),
                })

                // Add error result to message history
                extMessages.push({
                  role: 'tool',
                  content: JSON.stringify(errorResult),
                  tool_call_id: toolCall.id,
                })
              }
            }
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
  private readonly boundHandleRegistered: (info: ProviderInfo) => void
  private readonly boundHandleUnregistered: (id: string) => void

  constructor(
    extensionHost: ExtensionHost,
    onProviderAdded: (provider: ChatAIProvider) => void,
    onProviderRemoved: (providerId: string) => void
  ) {
    this.extensionHost = extensionHost
    this.onProviderAdded = onProviderAdded
    this.onProviderRemoved = onProviderRemoved

    // Store bound references so dispose() can remove the same listeners
    this.boundHandleRegistered = this.handleProviderRegistered.bind(this)
    this.boundHandleUnregistered = this.handleProviderUnregistered.bind(this)

    // Listen for provider registration events
    this.extensionHost.on('provider-registered', this.boundHandleRegistered)
    this.extensionHost.on('provider-unregistered', this.boundHandleUnregistered)

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
    this.extensionHost.off('provider-registered', this.boundHandleRegistered)
    this.extensionHost.off('provider-unregistered', this.boundHandleUnregistered)
    this.adapters.clear()
  }
}
