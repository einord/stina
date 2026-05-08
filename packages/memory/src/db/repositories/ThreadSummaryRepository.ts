import { eq } from 'drizzle-orm'
import type { ThreadSummary } from '@stina/core'
import { threadSummaries, type MemoryDb } from '../schema.js'

/**
 * Repository for ThreadSummary. Internal index used by `recall` per §03;
 * not surfaced to the user as a "memory" type.
 *
 * Written by the dream pass (§07 tasks 1–2). The repository exposes upsert
 * because re-summarization replaces the prior summary for the same thread.
 */
export class ThreadSummaryRepository {
  constructor(private db: MemoryDb) {}

  async upsert(summary: ThreadSummary): Promise<void> {
    const row = {
      threadId: summary.thread_id,
      summary: summary.summary,
      topics: summary.topics,
      generatedAt: summary.generated_at,
      messageCountAtGeneration: summary.message_count_at_generation,
    }
    await this.db
      .insert(threadSummaries)
      .values(row)
      .onConflictDoUpdate({
        target: threadSummaries.threadId,
        set: {
          summary: row.summary,
          topics: row.topics,
          generatedAt: row.generatedAt,
          messageCountAtGeneration: row.messageCountAtGeneration,
        },
      })
  }

  async getByThread(threadId: string): Promise<ThreadSummary | null> {
    const rows = await this.db
      .select()
      .from(threadSummaries)
      .where(eq(threadSummaries.threadId, threadId))
      .limit(1)
    return rows[0] ? rowToSummary(rows[0]) : null
  }

  async delete(threadId: string): Promise<void> {
    await this.db.delete(threadSummaries).where(eq(threadSummaries.threadId, threadId))
  }
}

interface SummaryRow {
  threadId: string
  summary: string
  topics: string[]
  generatedAt: number
  messageCountAtGeneration: number
}

function rowToSummary(row: SummaryRow): ThreadSummary {
  return {
    thread_id: row.threadId,
    summary: row.summary,
    topics: row.topics,
    generated_at: row.generatedAt,
    message_count_at_generation: row.messageCountAtGeneration,
  }
}
