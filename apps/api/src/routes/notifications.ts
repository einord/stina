import type { FastifyPluginAsync } from 'fastify'
import { ThreadRepository } from '@stina/threads/db'
import { getDatabase } from '@stina/adapters-node'
import { requireAuth } from '@stina/auth'
import type { NotificationDispatcher, NotificationEvent } from '@stina/orchestrator'
import { asThreadsDb } from '../asRedesign2026Db.js'
import { getUserId } from './auth-helpers.js'

export interface NotificationRoutesOptions {
  notificationDispatcher: NotificationDispatcher
}

/**
 * SSE/REST notification routes.
 *
 * GET /notifications/stream — live SSE push, filtered by request.user.id
 * GET /notifications?limit=50 — recent notified threads (REST)
 */
export const notificationRoutes: FastifyPluginAsync<NotificationRoutesOptions> = async (
  fastify,
  options
) => {
  const { notificationDispatcher } = options

  /**
   * SSE stream of notification events for the authenticated user.
   *
   * GET /notifications/stream
   *
   * The dispatcher is process-global; per-user filtering is done in this
   * bridge (event.user_id !== request.user.id → skip). Keep-alive comment
   * lines are sent every 25 s so idle TCP connections are not reaped by
   * proxies / load-balancers (nginx default timeout is 60 s).
   */
  fastify.get('/notifications/stream', { preHandler: requireAuth }, (request, reply) => {
    const userId = getUserId(request)
    const origin = request.headers.origin

    // Hijack — we own the response lifecycle from here.
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    })

    const sendEvent = (event: NotificationEvent) => {
      // Per-user filter: the dispatcher is process-global.
      if (event.user_id !== userId) return
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    // Keep-alive: `: keepalive\n\n` is a comment line per the SSE spec —
    // browsers ignore it but it prevents idle TCP teardown.
    const keepAliveInterval = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n')
      } catch {
        // Client already disconnected.
      }
    }, 25_000)

    const unsubscribe = notificationDispatcher.subscribe(sendEvent)

    // Clean up on disconnect.
    request.raw.on('close', () => {
      clearInterval(keepAliveInterval)
      unsubscribe()
    })
  })

  /**
   * List recent notified threads for the authenticated user.
   *
   * GET /notifications?limit=50
   *
   * Returns threads ordered by notified_at DESC. Since threads are not
   * user-scoped in the DB (v1 is single-user), auth ensures only
   * authenticated users reach this endpoint.
   */
  fastify.get<{
    Querystring: { limit?: string }
    Reply: NotificationEvent[] | { error: string }
  }>('/notifications', { preHandler: requireAuth }, async (request, reply) => {
    const rawDb = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(rawDb))
    const userId = getUserId(request)

    const limitStr = (request.query as { limit?: string }).limit
    const limitNum = limitStr !== undefined ? Number(limitStr) : 50
    if (!Number.isInteger(limitNum) || limitNum <= 0 || limitNum > 500) {
      reply.code(400)
      return { error: 'limit must be a positive integer ≤ 500' }
    }

    const threads = await repo.list({ notifiedOnly: true, limit: limitNum })

    return threads.map<NotificationEvent>((thread) => ({
      thread_id: thread.id,
      user_id: userId,
      title: thread.title,
      preview: '',
      kind: 'normal',
      trigger_kind: thread.trigger.kind,
      extension_id:
        thread.trigger.kind === 'mail' || thread.trigger.kind === 'calendar'
          ? thread.trigger.extension_id
          : undefined,
      notified_at: thread.notified_at ?? 0,
    }))
  })
}
