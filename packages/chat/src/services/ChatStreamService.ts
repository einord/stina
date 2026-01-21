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
  private thinkingDone: boolean = false

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
        // Mark thinking as done when tools start
        this.markThinkingDone()
        this.activeTool = {
          name: event.name,
          displayName: event.displayName,
          payload: event.payload,
          metadata: { createdAt: new Date().toISOString() },
        }
        this.emit('tool-start', event.displayName || event.name)
        break

      case 'tool_result':
        if (this.activeTool && this.activeTool.name === event.name) {
          this.activeTool.result = event.result
          // Use displayName from event if available (may have been resolved later)
          if (event.displayName && !this.activeTool.displayName) {
            this.activeTool.displayName = event.displayName
          }
          this.currentTools.push(this.activeTool as ToolCall)
          this.emit('tool-complete', this.activeTool as ToolCall)
          this.activeTool = null
        }
        break

      case 'content':
        // Mark thinking as done when content starts
        this.markThinkingDone()
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
   * Mark current thinking block as done and emit event
   */
  private markThinkingDone(): void {
    if (this.currentThinking && !this.thinkingDone) {
      this.thinkingDone = true
      this.emit('thinking-done')
    }
  }

  /**
   * Build final messages from accumulated stream data
   */
  private buildMessages(): Message[] {
    const messages: Message[] = []
    const now = new Date().toISOString()

    // Add thinking if present (always marked as done in final messages)
    if (this.currentThinking.trim()) {
      messages.push({
        type: MessageType.THINKING,
        text: this.currentThinking.trim(),
        done: true,
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
    this.thinkingDone = false
  }

  /**
   * Reset stream state (public)
   */
  resetState(): void {
    this.reset()
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
