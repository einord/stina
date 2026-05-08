import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Thread, ThreadStatus, ThreadTrigger, EntityRef, Message } from '@stina/core'
import { threads, messages, type ThreadsDb } from './schema.js'

export interface CreateThreadInput {
  trigger: ThreadTrigger
  title: string
  linkedEntities?: EntityRef[]
}

/**
 * Input shape for appending a message. Each Message subtype is permitted with
 * its own content shape; `source` is required for app-authored messages and
 * forbidden for user/stina messages (matching §02's Message union).
 */
export type AppendMessageInput =
  | (Omit<import('@stina/core').UserMessage, 'id' | 'created_at'> & { id?: string; created_at?: number })
  | (Omit<import('@stina/core').StinaMessage, 'id' | 'created_at'> & { id?: string; created_at?: number })
  | (Omit<import('@stina/core').AppMessage, 'id' | 'created_at'> & { id?: string; created_at?: number })

export interface ListThreadsOptions {
  /** Filter by status. Omit to include all statuses. */
  status?: ThreadStatus | ThreadStatus[]
  /** Filter by surfacing state: 'surfaced' (surfacedAt set) or 'background' (null). */
  surfacing?: 'surfaced' | 'background'
  /** Filter by trigger.kind. */
  triggerKind?: ThreadTrigger['kind']
  limit?: number
  /** Pagination cursor: include only threads with last_activity_at <= cursor. */
  beforeLastActivityAt?: number
  /**
   * When true, include threads where first_turn_completed_at IS NULL (pending threads).
   * Default false — pending threads are excluded from all list surfaces per spec §04.
   */
  includePending?: boolean
  /**
   * When true, include only threads where notified_at IS NOT NULL.
   * Used by GET /notifications to surface the notification history list.
   */
  notifiedOnly?: boolean
  // NOTE: Multi-user `userId` filtering is intentionally NOT exposed here in v1.
  // The threads schema has no `user_id` column; v1 is single-user (the apps
  // resolve a single `defaultUserId`). When multi-user lands, the filter will
  // either grow a `user_id` column on `threads` or extract from the trigger
  // JSON — until then, callers should not assume per-user scoping at this layer.
}

/**
 * Repository for Thread + Message persistence.
 *
 * Threads are the inbox-model conversation primitive (§02). This repository
 * owns reads and writes; higher layers (decision-turn loader, UI) compose on
 * top.
 *
 * Notes:
 * - `surfaced_at` is monotonic — it can be set, but not cleared. The setter
 *   asserts this.
 * - `last_activity_at` advances automatically on every appended message.
 * - The `quiet → active` transition is automatic on activity (§02). The
 *   repository does NOT auto-`quiet` threads on idle — that's a higher-level
 *   concern (the dream pass / background sweeper, per §07).
 */
export class ThreadRepository {
  constructor(private db: ThreadsDb) {}

  // ─── Threads ──────────────────────────────────────────────────────────────

  /** Create a new Thread. Returns the persisted row. */
  async create(input: CreateThreadInput): Promise<Thread> {
    const now = Date.now()
    const row = {
      id: nanoid(),
      trigger: input.trigger,
      status: 'active' as ThreadStatus,
      firstTurnCompletedAt: null,
      surfacedAt: null,
      notifiedAt: null,
      title: input.title,
      summary: null,
      linkedEntities: input.linkedEntities ?? [],
      createdAt: now,
      lastActivityAt: now,
    }
    await this.db.insert(threads).values(row)
    return rowToThread(row)
  }

  async getById(id: string): Promise<Thread | null> {
    const rows = await this.db.select().from(threads).where(eq(threads.id, id)).limit(1)
    const row = rows[0]
    return row ? rowToThread(row) : null
  }

  async list(options: ListThreadsOptions = {}): Promise<Thread[]> {
    const conditions = []

    // spec §04: pending threads (first_turn_completed_at IS NULL) are excluded by default.
    if (!options.includePending) {
      conditions.push(isNotNull(threads.firstTurnCompletedAt))
    }

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      if (statuses.length === 1) {
        conditions.push(eq(threads.status, statuses[0]!))
      } else if (statuses.length > 1) {
        conditions.push(sql`${threads.status} IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`)
      }
    }

    if (options.surfacing === 'surfaced') {
      conditions.push(isNotNull(threads.surfacedAt))
    } else if (options.surfacing === 'background') {
      conditions.push(isNull(threads.surfacedAt))
    }

    if (options.triggerKind) {
      conditions.push(sql`json_extract(${threads.trigger}, '$.kind') = ${options.triggerKind}`)
    }

    if (options.beforeLastActivityAt !== undefined) {
      conditions.push(sql`${threads.lastActivityAt} <= ${options.beforeLastActivityAt}`)
    }

    if (options.notifiedOnly) {
      conditions.push(isNotNull(threads.notifiedAt))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    // When listing notified threads, sort by most-recently-notified first so
    // the notification history dropdown shows newest at the top.
    const orderColumn = options.notifiedOnly ? desc(threads.notifiedAt) : desc(threads.lastActivityAt)
    const query = this.db
      .select()
      .from(threads)
      .where(where)
      .orderBy(orderColumn)

    const rows = options.limit ? await query.limit(options.limit) : await query
    return rows.map(rowToThread)
  }

  /**
   * Set the thread's status. Enforces the legal transitions from §02:
   * active ↔ quiet (automatic), quiet → archived (user-driven).
   * Throws on invalid transitions.
   */
  async setStatus(id: string, status: ThreadStatus): Promise<void> {
    const current = await this.getById(id)
    if (!current) {
      throw new Error(`Thread not found: ${id}`)
    }
    if (!isLegalStatusTransition(current.status, status)) {
      throw new Error(`Illegal thread status transition: ${current.status} → ${status}`)
    }
    await this.db.update(threads).set({ status }).where(eq(threads.id, id))
  }

  /**
   * Mark the thread as surfaced. Sets `surfaced_at` to `at` (or now). Idempotent
   * for the same thread — subsequent calls do not re-set the timestamp, since
   * surfacing is monotonic.
   */
  async markSurfaced(id: string, at: number = Date.now()): Promise<void> {
    const current = await this.getById(id)
    if (!current) {
      throw new Error(`Thread not found: ${id}`)
    }
    if (current.surfaced_at !== null) {
      // Already surfaced — monotonic, no-op.
      return
    }
    await this.db.update(threads).set({ surfacedAt: at }).where(eq(threads.id, id))
  }

  /**
   * Mark the thread as notified. Independent from surfacing — see §02 and §04.
   * Monotonic — subsequent calls are no-ops.
   * @returns true if the timestamp was written, false if already notified (monotonic no-op).
   */
  async markNotified(id: string, at: number = Date.now()): Promise<boolean> {
    const current = await this.getById(id)
    if (!current) {
      throw new Error(`Thread not found: ${id}`)
    }
    if (current.notified_at !== null) {
      // Already notified — monotonic, no-op.
      return false
    }
    await this.db.update(threads).set({ notifiedAt: at }).where(eq(threads.id, id))
    return true
  }

  /**
   * Lift the §04 pending-first-turn gate. Sets `first_turn_completed_at` to `at` (or now).
   * Monotonic — subsequent calls are no-ops. Throws if thread not found.
   */
  async markFirstTurnCompleted(id: string, at: number = Date.now()): Promise<void> {
    const current = await this.getById(id)
    if (!current) {
      throw new Error(`Thread not found: ${id}`)
    }
    if (current.first_turn_completed_at !== null) {
      // Already completed — monotonic, no-op.
      return
    }
    await this.db.update(threads).set({ firstTurnCompletedAt: at }).where(eq(threads.id, id))
  }

  /** Replace the thread's title. */
  async setTitle(id: string, title: string): Promise<void> {
    await this.db.update(threads).set({ title }).where(eq(threads.id, id))
  }

  /** Replace the thread's summary. Used by the dream pass per §07. */
  async setSummary(id: string, summary: string | null): Promise<void> {
    await this.db.update(threads).set({ summary }).where(eq(threads.id, id))
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  /** Append a Message to a Thread, updating last_activity_at. */
  async appendMessage(message: AppendMessageInput): Promise<Message> {
    const now = message.created_at ?? Date.now()
    const id = message.id ?? nanoid()
    const persisted = {
      ...(message as object),
      id,
      created_at: now,
    } as Message

    // better-sqlite3 transactions are synchronous; the drizzle wrapper exposes
    // them as a callback that must NOT return a Promise.
    this.db.transaction((tx) => {
      tx.insert(messages)
        .values({
          id,
          threadId: persisted.thread_id,
          author: persisted.author,
          visibility: persisted.visibility,
          source: persisted.author === 'app' ? persisted.source : null,
          content: persisted.content,
          createdAt: now,
        })
        .run()

      // Auto-revive quiet threads on new activity (per §02).
      const current = tx
        .select({ status: threads.status })
        .from(threads)
        .where(eq(threads.id, persisted.thread_id))
        .limit(1)
        .all()
      const currentStatus = current[0]?.status
      const updates: { lastActivityAt: number; status?: ThreadStatus } = { lastActivityAt: now }
      if (currentStatus === 'quiet') {
        updates.status = 'active'
      }
      tx.update(threads).set(updates).where(eq(threads.id, persisted.thread_id)).run()
    })

    return persisted
  }

  /** List messages in a thread in chronological order. */
  async listMessages(threadId: string, options: { includeSilent?: boolean } = {}): Promise<Message[]> {
    const conditions = [eq(messages.threadId, threadId)]
    if (!options.includeSilent) {
      conditions.push(eq(messages.visibility, 'normal'))
    }
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(messages.createdAt)
    return rows.map(rowToMessage)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const LEGAL_STATUS_TRANSITIONS: Record<ThreadStatus, ThreadStatus[]> = {
  active: ['quiet', 'archived'],
  quiet: ['active', 'archived'],
  archived: [], // archived is terminal in v1 (per §02)
}

function isLegalStatusTransition(from: ThreadStatus, to: ThreadStatus): boolean {
  if (from === to) return true
  return LEGAL_STATUS_TRANSITIONS[from].includes(to)
}

interface ThreadRow {
  id: string
  trigger: ThreadTrigger
  status: ThreadStatus
  firstTurnCompletedAt: number | null
  surfacedAt: number | null
  notifiedAt: number | null
  title: string
  summary: string | null
  linkedEntities: EntityRef[]
  createdAt: number
  lastActivityAt: number
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    first_turn_completed_at: row.firstTurnCompletedAt,
    surfaced_at: row.surfacedAt,
    notified_at: row.notifiedAt,
    title: row.title,
    summary: row.summary,
    linked_entities: row.linkedEntities,
    created_at: row.createdAt,
    last_activity_at: row.lastActivityAt,
  }
}

interface MessageRow {
  id: string
  threadId: string
  author: 'user' | 'stina' | 'app'
  visibility: 'normal' | 'silent'
  source: { extension_id: string; component?: string } | null
  content: unknown
  createdAt: number
}

function rowToMessage(row: MessageRow): Message {
  const base = {
    id: row.id,
    thread_id: row.threadId,
    visibility: row.visibility,
    created_at: row.createdAt,
  } as const

  if (row.author === 'user') {
    return {
      ...base,
      author: 'user',
      content: row.content as { text: string; attachments?: unknown[] },
    } as Message
  }
  if (row.author === 'stina') {
    return {
      ...base,
      author: 'stina',
      content: row.content as { text?: string; tool_calls?: unknown[]; tool_results?: unknown[] },
    } as Message
  }
  // 'app'
  return {
    ...base,
    author: 'app',
    source: row.source ?? { extension_id: 'unknown' },
    content: row.content as Message extends { author: 'app'; content: infer C } ? C : never,
  } as Message
}
