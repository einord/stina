import type { FastifyPluginAsync } from 'fastify'
import { ActivityLogRepository } from '@stina/autonomy/db'
import type { ActivityLogEntry, ActivityLogKind, ToolSeverity } from '@stina/core'
import { getDatabase } from '@stina/adapters-node'
import { requireAuth } from '@stina/auth'
import { asAutonomyDb } from '../asRedesign2026Db.js'

/**
 * Cross-thread activity log API for the redesign-2026 audit-trail surface.
 *
 * Per §05 §"Activity log (under the menu)", the activity log is the
 * cross-thread surface where every autonomous decision Stina has made is
 * browsable. The inline rendering inside each thread (handled by
 * `GET /threads/:id/activity`) is the first-line awareness; this endpoint
 * powers the dedicated cross-thread view with filter chips for kind,
 * severity, and date range.
 *
 *   GET /activity?kind=auto_action,memory_change&severity=high&after=...&before=...&limit=100
 *
 * Multiple `kind` values may be passed comma-separated. Returns
 * `ActivityLogEntry[]` ordered by `created_at` descending. The over-the-wire
 * shape is the `@stina/core` type directly — no DTO layer.
 */

interface ListActivityQuery {
  kind?: string
  after?: string
  before?: string
  severity?: string
  limit?: string
}

const VALID_KINDS: ActivityLogKind[] = [
  'event_handled',
  'event_silenced',
  'auto_action',
  'action_blocked',
  'memory_change',
  'thread_created',
  'dream_pass_run',
  'dream_pass_flag',
  'settings_migration',
  'migration_completed',
]
const VALID_KIND_SET = new Set<string>(VALID_KINDS)

const VALID_SEVERITIES: ToolSeverity[] = ['low', 'medium', 'high', 'critical']
const VALID_SEVERITY_SET = new Set<string>(VALID_SEVERITIES)

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export const activityRoutes: FastifyPluginAsync = async (fastify) => {
  const rawDb = getDatabase()
  const activityRepo = new ActivityLogRepository(asAutonomyDb(rawDb))

  /**
   * List activity log entries across threads with optional filters.
   *
   * GET /activity?kind=auto_action,memory_change&severity=high&after=...&before=...&limit=100
   *
   * - `kind` accepts a single value or comma-separated values; if omitted,
   *   all kinds are returned.
   * - `severity` is a single value (`low|medium|high|critical`).
   * - `after` / `before` are unix milliseconds (`created_at > after`,
   *   `created_at < before`).
   * - `limit` defaults to 100, capped at 500.
   *
   * Returns entries newest-first.
   */
  fastify.get<{
    Querystring: ListActivityQuery
    Reply: ActivityLogEntry[] | { error: string }
  }>('/activity', { preHandler: requireAuth }, async (request, reply) => {
    const { kind, after, before, severity, limit } = request.query

    // Parse and validate `kind` (comma-separated or single value).
    let kinds: ActivityLogKind[] | undefined
    if (kind !== undefined && kind.length > 0) {
      const parts = kind.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      for (const k of parts) {
        if (!VALID_KIND_SET.has(k)) {
          reply.code(400)
          return { error: `Invalid kind: ${k}` }
        }
      }
      kinds = parts as ActivityLogKind[]
    }

    // Validate severity.
    if (severity !== undefined && !VALID_SEVERITY_SET.has(severity)) {
      reply.code(400)
      return { error: `Invalid severity: ${severity}` }
    }

    // Parse and validate `after` / `before` as integer ms.
    let afterMs: number | undefined
    if (after !== undefined) {
      const parsed = Number(after)
      if (!Number.isInteger(parsed) || parsed < 0) {
        reply.code(400)
        return { error: 'after must be a non-negative integer (unix ms)' }
      }
      afterMs = parsed
    }
    let beforeMs: number | undefined
    if (before !== undefined) {
      const parsed = Number(before)
      if (!Number.isInteger(parsed) || parsed < 0) {
        reply.code(400)
        return { error: 'before must be a non-negative integer (unix ms)' }
      }
      beforeMs = parsed
    }

    // Validate limit.
    let limitNum = DEFAULT_LIMIT
    if (limit !== undefined) {
      const parsed = Number(limit)
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {
        reply.code(400)
        return { error: `limit must be a positive integer ≤ ${MAX_LIMIT}` }
      }
      limitNum = parsed
    }

    // Repository handles `kind` (single or array) directly. `severity` is not
    // supported as a filter on the repo, so we filter post-hoc — the result
    // sets are bounded by `limit` anyway, and severity filtering is rare
    // enough that adding a repo-level option isn't justified yet.
    const all = await activityRepo.list({
      ...(kinds !== undefined ? { kind: kinds.length === 1 ? kinds[0]! : kinds } : {}),
      ...(afterMs !== undefined ? { after: afterMs } : {}),
      ...(beforeMs !== undefined ? { before: beforeMs } : {}),
      // When severity filtering is requested, fetch up to MAX_LIMIT and
      // filter in memory; otherwise honor the requested limit at the SQL
      // layer.
      limit: severity !== undefined ? MAX_LIMIT : limitNum,
    })

    if (severity !== undefined) {
      return all.filter((e) => e.severity === severity).slice(0, limitNum)
    }
    return all
  })
}
