import type { ThreadRepository } from '@stina/threads/db'
import type { Message, StinaMessage } from '@stina/core'
import { cannedStubProducer, type DecisionTurnProducer } from './producers/canned.js'
import { emptyMemoryContextLoader, type MemoryContextLoader } from './memory/MemoryContextLoader.js'

export interface RunDecisionTurnInput {
  threadId: string
  threadRepo: ThreadRepository
  /**
   * Loader for the §03 thread-start memory context (active standing
   * instructions + profile facts matching linked entities). Defaults to a
   * null loader that returns empty memory — sufficient for tests focused on
   * orchestration mechanics. Pass `DefaultMemoryContextLoader` in production.
   */
  memoryLoader?: MemoryContextLoader
  /**
   * Producer that synthesises Stina's reply. Defaults to the canned stub
   * producer; pass a real producer once the provider integration lands.
   */
  producer?: DecisionTurnProducer
}

export interface RunDecisionTurnResult {
  thread_id: string
  message: StinaMessage
  /** True iff the thread became surfaced (or already was) after this turn. */
  surfaced: boolean
}

/**
 * Run a single decision turn on a thread.
 *
 * Steps:
 *   1. Load the thread (404 surfaces as a thrown Error — the route layer maps it).
 *   2. Load the message timeline as the producer's context (silent messages
 *      included so the producer sees the full audit trail).
 *   3. Invoke the producer to get a {visibility, content} reply.
 *   4. Append the reply as a 'stina'-authored message.
 *   5. If the reply is normal-visibility, mark the thread surfaced (idempotent).
 *
 * Tool calls and memory writes are out of scope for the v1 stub — adding them
 * extends `DecisionTurnContext` and `DecisionTurnOutput` without changing this
 * orchestration shape.
 */
export async function runDecisionTurn(input: RunDecisionTurnInput): Promise<RunDecisionTurnResult> {
  const {
    threadId,
    threadRepo,
    producer = cannedStubProducer,
    memoryLoader = emptyMemoryContextLoader,
  } = input

  const thread = await threadRepo.getById(threadId)
  if (!thread) {
    throw new Error(`Thread not found: ${threadId}`)
  }
  if (thread.status === 'archived') {
    throw new Error(`Cannot run decision turn on archived thread: ${threadId}`)
  }

  const [messages, memory] = await Promise.all([
    threadRepo.listMessages(threadId, { includeSilent: true }),
    memoryLoader.load(thread),
  ])

  const output = await producer({ thread, messages, memory })

  const appended = (await threadRepo.appendMessage({
    thread_id: threadId,
    author: 'stina',
    visibility: output.visibility,
    content: output.content,
  })) as StinaMessage

  let surfaced = thread.surfaced_at !== null
  if (output.visibility === 'normal') {
    await threadRepo.markSurfaced(threadId)
    surfaced = true
  }

  return {
    thread_id: threadId,
    message: appended,
    surfaced,
  }
}

// Re-exported here so single-file consumers don't need a barrel import.
export type { Message }
