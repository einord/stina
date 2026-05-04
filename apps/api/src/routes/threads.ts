import type { FastifyPluginAsync } from 'fastify'
import { ThreadRepository } from '@stina/threads/db'
import { ActivityLogRepository } from '@stina/autonomy/db'
import { StandingInstructionRepository, ProfileFactRepository } from '@stina/memory/db'
import {
  runDecisionTurn,
  DefaultMemoryContextLoader,
  type DecisionTurnProducer,
  type MemoryContextLoader,
  type TurnStreamEvent,
} from '@stina/orchestrator'
import type {
  Thread,
  Message,
  ThreadStatus,
  ThreadTrigger,
  ActivityLogEntry,
} from '@stina/core'
import { getDatabase } from '@stina/adapters-node'
import { requireAuth } from '@stina/auth'
import { asThreadsDb, asAutonomyDb, asMemoryDb } from '../asRedesign2026Db.js'
import { getUserId } from './auth-helpers.js'

export interface ThreadRoutesOptions {
  /**
   * Static override for the producer used by the decision turn. Wins over
   * `getDecisionTurnProducer` when set. Tests inject deterministic producers
   * here.
   */
  decisionTurnProducer?: DecisionTurnProducer
  /**
   * Dynamic factory consulted per-turn with the requesting user's id. Used
   * by production wiring to look up the user's default model config and
   * build a provider-backed producer; returning `null` (or omitting the
   * option) falls back to the canned stub from @stina/orchestrator.
   */
  getDecisionTurnProducer?: (userId: string) => Promise<DecisionTurnProducer | null>
  /**
   * Override the memory context loader used at the start of every decision
   * turn. Defaults to `DefaultMemoryContextLoader` reading from the live
   * @stina/memory repositories. Tests pass a stub here to assert behavior
   * with controlled memory contents.
   */
  memoryContextLoader?: MemoryContextLoader
}

/**
 * Threads + messages API for the redesign-2026 inbox model.
 *
 * Routes (single-user model in v1; auth still required for consistency with
 * the rest of the API surface):
 *
 *   GET  /threads                      List threads with optional filters
 *   GET  /threads/:id                  Get a single thread
 *   GET  /threads/:id/messages         List messages in a thread
 *   POST /threads                      Create a user-triggered thread
 *   POST /threads/:id/messages         Append a user message to a thread
 *
 * The over-the-wire shapes are the @stina/core types directly — Thread,
 * Message, etc. The frontend already depends on @stina/core for type
 * definitions, so no separate DTO layer is needed for the redesign-2026
 * types.
 */

interface ListThreadsQuery {
  status?: ThreadStatus
  surfacing?: 'surfaced' | 'background'
  triggerKind?: ThreadTrigger['kind']
  limit?: string
}

interface CreateThreadBody {
  title?: string
  content: { text: string }
}

interface CreateMessageBody {
  content: { text: string }
}

const VALID_STATUSES: ThreadStatus[] = ['active', 'quiet', 'archived']
const VALID_SURFACING = new Set(['surfaced', 'background'])
const VALID_TRIGGER_KINDS: ThreadTrigger['kind'][] = [
  'user',
  'mail',
  'calendar',
  'scheduled',
  'stina',
]

export const threadRoutes: FastifyPluginAsync<ThreadRoutesOptions> = async (fastify, options) => {
  const rawDb = getDatabase()
  const repo = new ThreadRepository(asThreadsDb(rawDb))
  const activityRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
  const staticProducer = options?.decisionTurnProducer
  const dynamicProducer = options?.getDecisionTurnProducer
  const memoryLoader: MemoryContextLoader =
    options?.memoryContextLoader ??
    new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(rawDb)),
      new ProfileFactRepository(asMemoryDb(rawDb))
    )

  /**
   * Resolve the producer for a single turn. Priority: static override >
   * dynamic factory result > canned stub. Errors in the factory log + fall
   * back to the canned stub so onboarding paths stay usable.
   */
  async function resolveProducer(threadId: string, userId: string): Promise<DecisionTurnProducer | undefined> {
    if (staticProducer) return staticProducer
    if (!dynamicProducer) return undefined
    try {
      const result = await dynamicProducer(userId)
      return result ?? undefined
    } catch (err) {
      fastify.log.warn(
        { err, threadId, userId },
        'decision-turn producer factory failed; falling back to canned stub'
      )
      return undefined
    }
  }

  /**
   * Runs Stina's decision turn for the thread and swallows producer errors
   * so they don't undo the user's persisted message. Errors are logged with
   * the thread id; the client can retry by re-posting or by another user
   * action. Used by the non-streaming POST endpoints.
   */
  async function runTurnSafely(threadId: string, userId: string): Promise<void> {
    const producer = await resolveProducer(threadId, userId)
    try {
      await runDecisionTurn({
        threadId,
        threadRepo: repo,
        memoryLoader,
        ...(producer ? { producer } : {}),
      })
    } catch (err) {
      fastify.log.warn({ err, threadId }, 'decision turn failed')
    }
  }

  /**
   * List threads.
   *
   * GET /threads?status=active&surfacing=surfaced&triggerKind=mail&limit=50
   *
   * Filters compose. Default sort: most recent activity first.
   */
  fastify.get<{
    Querystring: ListThreadsQuery
    Reply: Thread[] | { error: string }
  }>('/threads', { preHandler: requireAuth }, async (request, reply) => {
    const { status, surfacing, triggerKind, limit } = request.query

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      reply.code(400)
      return { error: `Invalid status: ${status}` }
    }
    if (surfacing !== undefined && !VALID_SURFACING.has(surfacing)) {
      reply.code(400)
      return { error: `Invalid surfacing: ${surfacing}` }
    }
    if (triggerKind !== undefined && !VALID_TRIGGER_KINDS.includes(triggerKind)) {
      reply.code(400)
      return { error: `Invalid triggerKind: ${triggerKind}` }
    }

    const limitNum = limit !== undefined ? Number(limit) : undefined
    if (limitNum !== undefined && (!Number.isInteger(limitNum) || limitNum <= 0 || limitNum > 500)) {
      reply.code(400)
      return { error: 'limit must be a positive integer ≤ 500' }
    }

    return repo.list({
      ...(status !== undefined ? { status } : {}),
      ...(surfacing !== undefined ? { surfacing } : {}),
      ...(triggerKind !== undefined ? { triggerKind } : {}),
      ...(limitNum !== undefined ? { limit: limitNum } : {}),
    })
  })

  /**
   * Get a single thread by id.
   *
   * GET /threads/:id
   */
  fastify.get<{
    Params: { id: string }
    Reply: Thread | { error: string }
  }>('/threads/:id', { preHandler: requireAuth }, async (request, reply) => {
    const thread = await repo.getById(request.params.id)
    if (!thread) {
      reply.code(404)
      return { error: 'Thread not found' }
    }
    return thread
  })

  /**
   * List messages in a thread, oldest-first.
   *
   * GET /threads/:id/messages?includeSilent=true
   *
   * Default excludes silent messages — those are visible only via the
   * activity-log inspector or with the explicit query flag.
   */
  fastify.get<{
    Params: { id: string }
    Querystring: { includeSilent?: string }
    Reply: Message[] | { error: string }
  }>('/threads/:id/messages', { preHandler: requireAuth }, async (request, reply) => {
    const thread = await repo.getById(request.params.id)
    if (!thread) {
      reply.code(404)
      return { error: 'Thread not found' }
    }
    const includeSilent = request.query.includeSilent === 'true'
    return repo.listMessages(request.params.id, { includeSilent })
  })

  /**
   * List activity log entries for a thread, oldest-first.
   *
   * GET /threads/:id/activity
   *
   * Used by the UI to interleave inline activity entries (memory_change,
   * auto_action, action_blocked, event_silenced, etc.) between messages —
   * see §05's "inline rendering of activity log entries".
   */
  fastify.get<{
    Params: { id: string }
    Reply: ActivityLogEntry[] | { error: string }
  }>('/threads/:id/activity', { preHandler: requireAuth }, async (request, reply) => {
    const thread = await repo.getById(request.params.id)
    if (!thread) {
      reply.code(404)
      return { error: 'Thread not found' }
    }
    return activityRepo.listForThreadInline(request.params.id)
  })

  /**
   * Create a user-triggered thread.
   *
   * POST /threads
   * Body: { title?, content: { text } }
   *
   * The trigger is always { kind: 'user' }. Surfacing is set immediately
   * because user-initiated threads are by definition addressed to (and from)
   * the user. The `content.text` becomes the first user message.
   */
  fastify.post<{
    Body: CreateThreadBody
    Reply: Thread | { error: string }
  }>('/threads', { preHandler: requireAuth }, async (request, reply) => {
    const { title, content } = request.body ?? ({} as CreateThreadBody)
    if (!content || typeof content.text !== 'string' || content.text.trim().length === 0) {
      reply.code(400)
      return { error: 'content.text is required and must be a non-empty string' }
    }

    const generatedTitle = (title?.trim() || deriveTitleFromText(content.text)).slice(0, 200)
    const thread = await repo.create({
      trigger: { kind: 'user' },
      title: generatedTitle,
    })

    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: content.text },
    })
    await repo.markSurfaced(thread.id)
    await runTurnSafely(thread.id, getUserId(request))

    const refreshed = await repo.getById(thread.id)
    if (!refreshed) {
      reply.code(500)
      return { error: 'Thread vanished after creation' }
    }
    reply.code(201)
    return refreshed
  })

  /**
   * Append a user message to an existing thread.
   *
   * POST /threads/:id/messages
   * Body: { content: { text } }
   *
   * The thread must exist. The author is always 'user'. Quiet threads are
   * automatically revived to 'active' (handled by ThreadRepository.appendMessage
   * per §02).
   */
  fastify.post<{
    Params: { id: string }
    Body: CreateMessageBody
    Reply: Message | { error: string }
  }>('/threads/:id/messages', { preHandler: requireAuth }, async (request, reply) => {
    const { content } = request.body ?? ({} as CreateMessageBody)
    if (!content || typeof content.text !== 'string' || content.text.trim().length === 0) {
      reply.code(400)
      return { error: 'content.text is required and must be a non-empty string' }
    }
    const thread = await repo.getById(request.params.id)
    if (!thread) {
      reply.code(404)
      return { error: 'Thread not found' }
    }
    if (thread.status === 'archived') {
      reply.code(409)
      return { error: 'Cannot append to an archived thread' }
    }

    const message = await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: content.text },
    })
    await runTurnSafely(thread.id, getUserId(request))
    reply.code(201)
    return message
  })

  /**
   * Create a user-triggered thread + run Stina's decision turn over SSE.
   *
   * POST /threads/stream
   * Body: { title?, content: { text } }
   *
   * Event sequence written as `data: <json>\n\n` lines:
   *   { type: 'thread_created', thread: Thread }
   *   { type: 'user_message',   message: Message }   // the seed user message
   *   { type: 'content_delta',  text: string }       // 0..N from producer
   *   { type: 'message_appended', message: Message } // Stina's persisted reply
   *   { type: 'done' }                               // OR { type: 'error', message }
   */
  fastify.post<{
    Body: CreateThreadBody
  }>('/threads/stream', { preHandler: requireAuth }, async (request, reply) => {
    const { title, content } = request.body ?? ({} as CreateThreadBody)
    if (!content || typeof content.text !== 'string' || content.text.trim().length === 0) {
      reply.code(400)
      return { error: 'content.text is required and must be a non-empty string' }
    }

    const generatedTitle = (title?.trim() || deriveTitleFromText(content.text)).slice(0, 200)
    const thread = await repo.create({
      trigger: { kind: 'user' },
      title: generatedTitle,
    })
    const userMessage = await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: content.text },
    })
    await repo.markSurfaced(thread.id)
    const refreshed = (await repo.getById(thread.id))!

    const userId = getUserId(request)
    const producer = await resolveProducer(thread.id, userId)

    openSseResponse(reply, request.headers.origin)
    sendSse(reply, { type: 'thread_created', thread: refreshed })
    sendSse(reply, { type: 'user_message', message: userMessage })

    try {
      await runDecisionTurn({
        threadId: thread.id,
        threadRepo: repo,
        memoryLoader,
        ...(producer ? { producer } : {}),
        onStreamEvent: (event) => sendSse(reply, event),
      })
    } catch (err) {
      // Error event is already emitted by runDecisionTurn's onStreamEvent path.
      fastify.log.warn({ err, threadId: thread.id }, 'streaming decision turn failed')
    } finally {
      reply.raw.end()
    }
  })

  /**
   * Append a user message to an existing thread + run Stina's decision turn
   * over SSE.
   *
   * POST /threads/:id/messages/stream
   * Body: { content: { text } }
   *
   * Event sequence is the subset of /threads/stream without `thread_created`.
   * 4xx errors fall through to the standard JSON shape — SSE is only used
   * once the user message has been accepted and the turn is starting.
   */
  fastify.post<{
    Params: { id: string }
    Body: CreateMessageBody
  }>('/threads/:id/messages/stream', { preHandler: requireAuth }, async (request, reply) => {
    const { content } = request.body ?? ({} as CreateMessageBody)
    if (!content || typeof content.text !== 'string' || content.text.trim().length === 0) {
      reply.code(400)
      return { error: 'content.text is required and must be a non-empty string' }
    }
    const thread = await repo.getById(request.params.id)
    if (!thread) {
      reply.code(404)
      return { error: 'Thread not found' }
    }
    if (thread.status === 'archived') {
      reply.code(409)
      return { error: 'Cannot append to an archived thread' }
    }

    const userMessage = await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: content.text },
    })
    const userId = getUserId(request)
    const producer = await resolveProducer(thread.id, userId)

    openSseResponse(reply, request.headers.origin)
    sendSse(reply, { type: 'user_message', message: userMessage })

    try {
      await runDecisionTurn({
        threadId: thread.id,
        threadRepo: repo,
        memoryLoader,
        ...(producer ? { producer } : {}),
        onStreamEvent: (event) => sendSse(reply, event),
      })
    } catch (err) {
      fastify.log.warn({ err, threadId: thread.id }, 'streaming decision turn failed')
    } finally {
      reply.raw.end()
    }
  })
}

/**
 * SSE helpers. Mirrors the chatStream pattern: hijack the reply, write
 * standard SSE headers, and emit each event as a single `data: ` line.
 */
function openSseResponse(
  reply: { hijack: () => void; raw: { writeHead: (s: number, h: Record<string, string>) => void } },
  origin: string | undefined
): void {
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  })
}

type ThreadStreamEvent =
  | { type: 'thread_created'; thread: Thread }
  | { type: 'user_message'; message: Message }
  | TurnStreamEvent

function sendSse(
  reply: { raw: { write: (chunk: string) => void } },
  event: ThreadStreamEvent
): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * Derive a human-readable title from the user's first message text.
 * Heuristic: first sentence (up to ~60 chars), trimmed.
 */
function deriveTitleFromText(text: string): string {
  const trimmed = text.trim()
  // Prefer the first sentence (period, question, exclamation).
  const firstSentence = trimmed.split(/[.!?\n]/, 1)[0] ?? trimmed
  if (firstSentence.length <= 60) return firstSentence
  return firstSentence.slice(0, 57).trimEnd() + '…'
}
