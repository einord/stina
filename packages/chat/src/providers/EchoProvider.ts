import type { AIProvider, StreamEvent } from '../types/provider.js'
import type { Message } from '../types/message.js'

/**
 * Echo provider - returns the user's message back
 * Used as fallback when no AI provider is configured
 * Also useful for testing
 */
export class EchoProvider implements AIProvider {
  id = 'echo'
  name = 'Echo Provider'

  async sendMessage(
    messages: Message[],
    systemPrompt: string,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    // Simulate streaming delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Find last user message
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m) => m.type === 'user')

    if (lastUserMessage && 'text' in lastUserMessage) {
      // Simulate streaming with chunks
      const text = `Echo: ${lastUserMessage.text}`
      const chunkSize = 5

      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize)
        onEvent({ type: 'content', text: chunk })

        // Simulate delay between chunks
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    } else {
      // No user message found
      onEvent({ type: 'content', text: 'Echo: (no user message found)' })
    }

    // Signal completion
    onEvent({ type: 'done' })
  }
}

/**
 * Singleton instance
 */
export const echoProvider = new EchoProvider()
