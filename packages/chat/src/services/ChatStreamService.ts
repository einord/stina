import EventEmitter from 'eventemitter3'
import type { StreamEvent } from '../types/provider.js'
import type { Message, ToolCall } from '../types/message.js'
import { MessageType } from '../types/message.js'
import { STINA_NO_REPLY } from '../constants/index.js'

/**
 * Platform-neutral chat streaming service using EventEmitter
 * Browser-compatible using eventemitter3
 * Can be wrapped in reactive state for Vue or used directly in Node/API
 */
export class ChatStreamService extends EventEmitter {
  private currentThinking: string = ''
  private currentContent: string = ''
  private currentTools: ToolCall[] = []
  private activeTool: Partial<ToolCall> | null = null

  /**
   * Process a stream event from provider
   */
  handleStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'thinking':
        this.currentThinking += event.text
        this.emit('thinking-update', this.currentThinking)
        break

      case 'tool':
        this.activeTool = {
          name: event.name,
          payload: event.payload,
          metadata: { createdAt: new Date().toISOString() },
        }
        this.emit('tool-start', event.name)
        break

      case 'tool_result':
        if (this.activeTool && this.activeTool.name === event.name) {
          this.activeTool.result = event.result
          this.currentTools.push(this.activeTool as ToolCall)
          this.emit('tool-complete', this.activeTool as ToolCall)
          this.activeTool = null
        }
        break

      case 'content':
        this.currentContent += event.text
        this.emit('content-update', this.currentContent)
        break

      case 'done':
        this.emit('stream-complete', this.buildMessages())
        this.reset()
        break

      case 'error':
        this.emit('stream-error', event.error)
        this.reset()
        break
    }
  }

  /**
   * Build final messages from accumulated stream data
   */
  private buildMessages(): Message[] {
    const messages: Message[] = []
    const now = new Date().toISOString()

    // Add thinking if present
    if (this.currentThinking.trim()) {
      messages.push({
        type: MessageType.THINKING,
        text: this.currentThinking.trim(),
        metadata: { createdAt: now },
      })
    }

    // Add tools if present
    if (this.currentTools.length > 0) {
      messages.push({
        type: MessageType.TOOLS,
        tools: this.currentTools,
        metadata: { createdAt: now },
      })
    }

    // Add content if not STINA_NO_REPLY
    if (this.currentContent.trim() && this.currentContent.trim() !== STINA_NO_REPLY) {
      messages.push({
        type: MessageType.STINA,
        text: this.currentContent.trim(),
        metadata: { createdAt: now },
      })
    }

    return messages
  }

  /**
   * Reset service state
   */
  private reset(): void {
    this.currentThinking = ''
    this.currentContent = ''
    this.currentTools = []
    this.activeTool = null
  }

  /**
   * Get current thinking text (for real-time updates)
   */
  getCurrentThinking(): string {
    return this.currentThinking
  }

  /**
   * Get current content text (for real-time updates)
   */
  getCurrentContent(): string {
    return this.currentContent
  }

  /**
   * Get current tools (for real-time updates)
   */
  getCurrentTools(): ToolCall[] {
    return [...this.currentTools]
  }
}
