export type QueuedMessageRole = 'user' | 'instruction'
export type QueuedMessageContext = 'conversation-start' | 'settings-update'

export interface QueuedMessage {
  id: string
  text: string
  role: QueuedMessageRole
  context?: QueuedMessageContext
  createdAt: string
}

export interface QueueState {
  queued: Array<{ id: string; role: QueuedMessageRole; preview: string }>
  isProcessing: boolean
}

const PREVIEW_MAX_LENGTH = 50
const PREVIEW_TRIM_LENGTH = 47

/**
 * FIFO queue for chat messages.
 * Stores pending messages only; active message is tracked by ChatOrchestrator.
 */
export class ChatMessageQueue {
  private items: QueuedMessage[] = []

  enqueue(item: QueuedMessage): void {
    this.items.push(item)
  }

  shift(): QueuedMessage | undefined {
    return this.items.shift()
  }

  remove(id: string): QueuedMessage | null {
    const index = this.items.findIndex((item) => item.id === id)
    if (index === -1) return null
    const [removed] = this.items.splice(index, 1)
    return removed ?? null
  }

  clear(): QueuedMessage[] {
    const removed = [...this.items]
    this.items = []
    return removed
  }

  get length(): number {
    return this.items.length
  }

  getSnapshot(isProcessing: boolean): QueueState {
    return {
      isProcessing,
      queued: this.items.map((item) => ({
        id: item.id,
        role: item.role,
        preview: this.buildPreview(item.text),
      })),
    }
  }

  private buildPreview(text: string): string {
    const trimmed = text.trim()
    if (trimmed.length <= PREVIEW_MAX_LENGTH) return trimmed
    return `${trimmed.slice(0, PREVIEW_TRIM_LENGTH)}...`
  }
}
