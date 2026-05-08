import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'

/** Gap in milliseconds that triggers a new thread segment (24 hours). */
const IDLE_GAP_MS = 24 * 60 * 60 * 1000

export interface ChatMigratorStats {
  legacyInteractionCount: number
  migratedMessageCount: number
  skippedMessageCount: number
  threadCount: number
  /** IDs of every thread row inserted by this migration run. */
  threadIds: string[]
}

interface LegacyInteraction {
  id: string
  conversation_id: string
  created_at: number
  messages: string // raw JSON
}

interface LegacyMessage {
  type: string
  text?: string
  metadata?: {
    createdAt?: string
    [key: string]: unknown
  }
}

/**
 * Migrates legacy chat data (chat_conversations + chat_interactions) into the
 * redesign-2026 threads + messages schema.
 *
 * Each (user_id, conversation_id) pair is processed independently. Within each
 * conversation, interactions are ordered by created_at ASC and split into
 * thread segments whenever the gap between consecutive interactions is >= 24 h.
 */
export class ChatMigrator {
  constructor(private readonly db: Database.Database) {}

  /** Run the migration and return statistics. */
  migrate(): ChatMigratorStats {
    const stats: ChatMigratorStats = {
      legacyInteractionCount: 0,
      migratedMessageCount: 0,
      skippedMessageCount: 0,
      threadCount: 0,
      threadIds: [],
    }

    // Check that the legacy tables exist — if not, there's nothing to migrate.
    const hasConversations = this.tableExists('chat_conversations')
    const hasInteractions = this.tableExists('chat_interactions')
    if (!hasConversations || !hasInteractions) {
      return stats
    }

    // Iterate per user deterministically.
    const users = this.db
      .prepare('SELECT DISTINCT user_id FROM chat_conversations ORDER BY user_id')
      .all() as Array<{ user_id: string }>

    for (const { user_id } of users) {
      const conversations = this.db
        .prepare(
          'SELECT id FROM chat_conversations WHERE user_id = ? ORDER BY created_at ASC'
        )
        .all(user_id) as Array<{ id: string }>

      for (const { id: conversation_id } of conversations) {
        const interactions = this.db
          .prepare(
            `SELECT id, conversation_id, created_at, messages
             FROM chat_interactions
             WHERE conversation_id = ?
             ORDER BY created_at ASC`
          )
          .all(conversation_id) as LegacyInteraction[]

        stats.legacyInteractionCount += interactions.length

        if (interactions.length === 0) continue

        // Split interactions into segments by idle gap.
        const segments = splitByIdleGap(interactions)

        for (const segment of segments) {
          const partialStats = this.migrateSegment(segment)
          stats.threadCount += 1
          stats.threadIds.push(partialStats.threadId)
          stats.migratedMessageCount += partialStats.migratedMessageCount
          stats.skippedMessageCount += partialStats.skippedMessageCount
        }
      }
    }

    return stats
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private tableExists(name: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
      .get(name)
    return row !== undefined
  }

  /**
   * Migrates one segment (a contiguous slice of interactions) into a single
   * archived Thread + its Messages. Returns partial counts.
   */
  private migrateSegment(
    segment: LegacyInteraction[]
  ): { threadId: string; migratedMessageCount: number; skippedMessageCount: number } {
    const first = segment[0]!
    const last = segment[segment.length - 1]!

    // Collect all legacy messages in this segment for title generation.
    const allMessages = collectMessages(segment)

    const title = buildTitle(allMessages, first.created_at)

    const threadId = nanoid()
    this.db
      .prepare(
        `INSERT INTO threads
           (id, trigger, status, surfaced_at, notified_at, title, summary,
            linked_entities, created_at, last_activity_at)
         VALUES (?, ?, 'archived', NULL, NULL, ?, NULL, '[]', ?, ?)`
      )
      .run(threadId, JSON.stringify({ kind: 'user' }), title, first.created_at, last.created_at)

    let migratedMessageCount = 0
    let skippedMessageCount = 0

    for (const interaction of segment) {
      let parsedMessages: LegacyMessage[]
      try {
        const raw: unknown = JSON.parse(interaction.messages)
        if (!Array.isArray(raw)) {
          skippedMessageCount++
          continue
        }
        parsedMessages = raw as LegacyMessage[]
      } catch {
        // Malformed JSON — skip entire interaction.
        skippedMessageCount++
        continue
      }

      for (const msg of parsedMessages) {
        if (msg.type === 'user' || msg.type === 'stina') {
          const text = typeof msg.text === 'string' ? msg.text : ''
          const createdAt = parseTimestamp(
            msg.metadata?.createdAt,
            interaction.created_at
          )
          const author = msg.type === 'user' ? 'user' : 'stina'
          const content = JSON.stringify({ text })
          const msgId = nanoid()

          this.db
            .prepare(
              `INSERT INTO messages
                 (id, thread_id, author, visibility, source, content, created_at)
               VALUES (?, ?, ?, 'normal', NULL, ?, ?)`
            )
            .run(msgId, threadId, author, content, createdAt)

          migratedMessageCount++
        } else {
          // instruction, information, thinking, tools → skip
          skippedMessageCount++
        }
      }
    }

    return { threadId, migratedMessageCount, skippedMessageCount }
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Splits an ordered list of interactions into segments where consecutive
 * interactions are separated by < IDLE_GAP_MS. A gap >= IDLE_GAP_MS starts
 * a new segment.
 */
function splitByIdleGap(
  interactions: LegacyInteraction[]
): LegacyInteraction[][] {
  if (interactions.length === 0) return []

  const segments: LegacyInteraction[][] = []
  let current: LegacyInteraction[] = [interactions[0]!]

  for (let i = 1; i < interactions.length; i++) {
    const prev = interactions[i - 1]!
    const curr = interactions[i]!
    const gap = curr.created_at - prev.created_at
    if (gap >= IDLE_GAP_MS) {
      segments.push(current)
      current = [curr]
    } else {
      current.push(curr)
    }
  }
  segments.push(current)
  return segments
}

/**
 * Collects all raw legacy messages from a segment of interactions (preserving
 * interaction order, messages within each interaction in array order).
 * Returns only parseable interactions; malformed JSON interactions yield [].
 */
function collectMessages(
  segment: LegacyInteraction[]
): Array<LegacyMessage & { _interactionCreatedAt: number }> {
  const result: Array<LegacyMessage & { _interactionCreatedAt: number }> = []
  for (const interaction of segment) {
    try {
      const raw: unknown = JSON.parse(interaction.messages)
      if (Array.isArray(raw)) {
        for (const m of raw as LegacyMessage[]) {
          result.push({ ...m, _interactionCreatedAt: interaction.created_at })
        }
      }
    } catch {
      // Ignore malformed interactions for title generation.
    }
  }
  return result
}

/**
 * Builds the title for a migrated thread segment.
 *
 * Rules (per spec):
 * - Use the first user message whose text.trim() is non-empty.
 * - Truncate to exactly 60 codepoints (no ellipsis, no word-boundary).
 * - Fallback: "Conversation from YYYY-MM-DD" using the segment's first
 *   interaction created_at (UTC calendar date).
 */
function buildTitle(
  messages: Array<LegacyMessage & { _interactionCreatedAt: number }>,
  segmentCreatedAt: number
): string {
  for (const msg of messages) {
    if (msg.type === 'user' && typeof msg.text === 'string') {
      const trimmed = msg.text.trim()
      if (trimmed.length > 0) {
        // Truncate to 60 codepoints.
        const codepoints = [...trimmed]
        if (codepoints.length > 60) {
          return codepoints.slice(0, 60).join('')
        }
        return trimmed
      }
    }
  }

  // Fallback: "Conversation from YYYY-MM-DD"
  const date = new Date(segmentCreatedAt)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `Conversation from ${year}-${month}-${day}`
}

/**
 * Converts an ISO 8601 string to unix milliseconds.
 * Falls back to the interaction's created_at if the string is missing or NaN.
 */
function parseTimestamp(
  createdAt: string | undefined,
  fallback: number
): number {
  if (!createdAt) return fallback
  const ms = new Date(createdAt).getTime()
  return Number.isNaN(ms) ? fallback : ms
}
