import type { Message, StinaMessage, Thread } from '@stina/core'

/**
 * Context passed to a producer when running a decision turn. The orchestrator
 * loads everything the producer is allowed to read; the producer decides what
 * to do with it.
 *
 * v1 keeps this minimal: thread + chronological message history. Future
 * additions (active standing instructions, profile facts matching trigger
 * entities, tool registry, severity policies) extend this interface — they
 * do not need new entry points.
 */
export interface DecisionTurnContext {
  thread: Thread
  /** Messages oldest-first, including silent ones if any exist. */
  messages: Message[]
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
 * Stub producer that acknowledges the most recent user message.
 *
 * Always returns a normal-visibility text reply, so the thread surfaces. The
 * stub deliberately marks itself in the reply text to make it obvious during
 * dev that no real model is in the loop yet.
 */
export const cannedStubProducer: DecisionTurnProducer = async ({ messages }) => {
  const lastUser = [...messages].reverse().find((m): m is Extract<Message, { author: 'user' }> => m.author === 'user')
  const userText = lastUser?.content.text?.trim() ?? ''
  const quoted = truncate(userText, 80)

  const text =
    quoted.length > 0
      ? `Tack, jag har sett ditt meddelande: "${quoted}". (Stub-svar — riktig Stina kopplas in senare.)`
      : 'Tack, jag har sett din tråd. (Stub-svar — riktig Stina kopplas in senare.)'

  return {
    visibility: 'normal',
    content: { text },
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}
