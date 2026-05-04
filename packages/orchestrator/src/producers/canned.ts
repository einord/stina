import type { Message, StinaMessage, Thread } from '@stina/core'
import type { MemoryContext } from '../memory/MemoryContextLoader.js'
import type { TurnStreamListener } from '../streamEvents.js'

/**
 * Context passed to a producer when running a decision turn. The orchestrator
 * loads everything the producer is allowed to read; the producer decides what
 * to do with it.
 *
 * Composition mirrors §03 "Token budget at thread start" — thread + message
 * history + memory (active standing instructions, profile facts matching
 * linked entities). Future additions (tool registry, severity policies)
 * extend this interface; they do not need new entry points.
 */
export interface DecisionTurnContext {
  thread: Thread
  /** Messages oldest-first, including silent ones if any exist. */
  messages: Message[]
  /**
   * Memory injected per §03: active standing instructions + profile facts
   * matching the thread's linked entities. Empty (`{ active_instructions: [],
   * linked_facts: [] }`) when no memory loader is wired or there is nothing
   * to load.
   */
  memory: MemoryContext
  /**
   * Optional sink for incremental events while the producer is generating
   * its reply. Producers that emit token-level deltas should call this for
   * each chunk; the canned stub fires a single `content_delta` covering the
   * whole reply. Always undefined when no streaming consumer is attached —
   * the producer must therefore not depend on this for correctness.
   */
  onStreamEvent?: TurnStreamListener
}

/**
 * Output a producer returns for a single decision turn. Mirrors the writable
 * fields of a StinaMessage so the orchestrator owns the persistence step.
 *
 * The producer cannot decide thread-level outcomes (surfaced/notified/status);
 * those are derived by the orchestrator from the message's `visibility`.
 */
export interface DecisionTurnOutput {
  visibility: 'normal' | 'silent'
  content: StinaMessage['content']
}

/**
 * A producer is the swappable brain of the decision turn. The v1 stub returns
 * a canned acknowledgement; the v2 implementation will call a provider
 * extension (Ollama / OpenAI) with the system prompt assembled from §03
 * memory.
 */
export type DecisionTurnProducer = (context: DecisionTurnContext) => Promise<DecisionTurnOutput>

/**
 * Stub producer that acknowledges the most recent user message and reports
 * how much memory was injected.
 *
 * Always returns a normal-visibility text reply, so the thread surfaces. The
 * stub deliberately marks itself in the reply text to make it obvious during
 * dev that no real model is in the loop yet, and surfaces the §03 thread-start
 * load count so memory wiring is observable end-to-end.
 */
export const cannedStubProducer: DecisionTurnProducer = async ({ messages, memory, onStreamEvent }) => {
  const lastUser = [...messages].reverse().find((m): m is Extract<Message, { author: 'user' }> => m.author === 'user')
  const userText = lastUser?.content.text?.trim() ?? ''
  const quoted = truncate(userText, 80)

  const memoryNote = formatMemoryNote(memory)

  const opener =
    quoted.length > 0
      ? `Tack, jag har sett ditt meddelande: "${quoted}".`
      : 'Tack, jag har sett din tråd.'

  const text = `${opener} ${memoryNote}(Stub-svar — riktig Stina kopplas in senare.)`

  // The stub doesn't have token-level chunks, but it still emits a single
  // content_delta so streaming consumers can render incrementally on the
  // same code path used by the provider producer.
  onStreamEvent?.({ type: 'content_delta', text })

  return {
    visibility: 'normal',
    content: { text },
  }
}

function formatMemoryNote({ active_instructions, linked_facts }: DecisionTurnContext['memory']): string {
  const parts: string[] = []
  if (active_instructions.length > 0) {
    parts.push(`${active_instructions.length} viktig${active_instructions.length === 1 ? 't' : 'a'} minne${active_instructions.length === 1 ? '' : 'n'}`)
  }
  if (linked_facts.length > 0) {
    parts.push(`${linked_facts.length} faktaminne${linked_facts.length === 1 ? '' : 'n'}`)
  }
  if (parts.length === 0) return ''
  return `(Aktivt: ${parts.join(', ')}.) `
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}
