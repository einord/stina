import type { FastifyPluginAsync } from 'fastify'
import { ThreadRepository } from '@stina/threads/db'
import { ActivityLogRepository } from '@stina/autonomy/db'
import { runDecisionTurn, type DecisionTurnProducer } from '@stina/orchestrator'
import type {
  Thread,
  Message,
  ThreadStatus,
  ThreadTrigger,
  ActivityLogEntry,
} from '@stina/core'
import { getDatabase } from '@stina/adapters-node'
import { requireAuth } from '@stina/auth'
import { asThreadsDb, asAutonomyDb } from '../asRedesign2026Db.js'

export interface ThreadRoutesOptions {
  /**
   * Override the producer used by the decision turn after every user-authored
   * post. Defaults to the canned stub from @stina/orchestrator. Tests use this
   * to inject deterministic producers; once the provider integration lands the
   * server wires a real producer here.
   */
  decisionTurnProducer?: DecisionTurnProducer
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
  const decisionTurnProducer = options?.decisionTurnProducer

  /**
   * Runs Stina's decision turn for the thread and swallows producer errors so
   * they don't undo the user's persisted message. Errors are logged with the
   * thread id; the client can retry by re-posting or by another user action.
   */
  async function runTurnSafely(threadId: string): Promise<void> {
    try {
      await runDecisionTurn({
        threadId,
        threadRepo: repo,
        ...(decisionTurnProducer ? { producer: decisionTurnProducer } : {}),
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
    await runTurnSafely(thread.id)

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
    await runTurnSafely(thread.id)
    reply.code(201)
    return message
  })
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
