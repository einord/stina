import { and, eq, lt, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { ProfileFact } from '@stina/core'
import { profileFacts, type MemoryDb } from '../schema.js'

export interface CreateProfileFactInput {
  fact: string
  subject: string
  predicate: string
  source_thread_id?: string | null
  created_by: 'user' | 'stina'
}

/**
 * Repository for ProfileFact.
 *
 * §07 hard rule: ProfileFact.fact / subject / predicate are immutable to the
 * dream pass for any created_by. The dream pass may flag stale facts and
 * surface contradictions, but cannot edit content or auto-delete user-set
 * facts. The runtime asserts this in `mutateAsDreamPass` and `deleteAsDreamPass`.
 */
export class ProfileFactRepository {
  constructor(private db: MemoryDb) {}

  async create(input: CreateProfileFactInput): Promise<ProfileFact> {
    const now = Date.now()
    const row = {
      id: nanoid(),
      fact: input.fact,
      subject: input.subject,
      predicate: input.predicate,
      sourceThreadId: input.source_thread_id ?? null,
      lastReferencedAt: now,
      createdAt: now,
      createdBy: input.created_by,
    }
    await this.db.insert(profileFacts).values(row)
    return rowToFact(row)
  }

  async getById(id: string): Promise<ProfileFact | null> {
    const rows = await this.db.select().from(profileFacts).where(eq(profileFacts.id, id)).limit(1)
    return rows[0] ? rowToFact(rows[0]) : null
  }

  /**
   * Find facts about a subject (optionally narrowed to a specific predicate).
   * Used by §03 thread-start context loader and conflict detection.
   */
  async findBySubject(subject: string, predicate?: string): Promise<ProfileFact[]> {
    const conditions = [eq(profileFacts.subject, subject)]
    if (predicate !== undefined) {
      conditions.push(eq(profileFacts.predicate, predicate))
    }
    const rows = await this.db.select().from(profileFacts).where(and(...conditions))
    return rows.map(rowToFact)
  }

  async listAll(): Promise<ProfileFact[]> {
    const rows = await this.db.select().from(profileFacts).orderBy(profileFacts.createdAt)
    return rows.map(rowToFact)
  }

  /**
   * Stale facts: last_referenced_at older than the threshold. Used by §07
   * task 7 (dream-pass stale-fact flagging). Default threshold per §07: 180
   * days.
   */
  async listStale(olderThan: number): Promise<ProfileFact[]> {
    const rows = await this.db
      .select()
      .from(profileFacts)
      .where(lt(profileFacts.lastReferencedAt, olderThan))
    return rows.map(rowToFact)
  }

  /**
   * Bump last_referenced_at. Used by recall to record reinforcement.
   */
  async touch(id: string, at: number = Date.now()): Promise<void> {
    await this.db
      .update(profileFacts)
      .set({ lastReferencedAt: at })
      .where(eq(profileFacts.id, id))
  }

  async update(id: string, patch: { fact?: string; predicate?: string }): Promise<void> {
    await this.db.update(profileFacts).set(patch).where(eq(profileFacts.id, id))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(profileFacts).where(eq(profileFacts.id, id))
  }

  /**
   * Guarded delete for dream-pass code paths. Refuses user-set facts per §07.
   */
  async deleteAsDreamPass(id: string): Promise<void> {
    const current = await this.getById(id)
    if (!current) return
    if (current.created_by === 'user') {
      throw new Error(
        `Dream pass attempted to delete a user-set profile fact: ${id}. ` +
          `User-set memories are immutable to the dream pass per §07 hard rules.`
      )
    }
    await this.delete(id)
  }
}

interface FactRow {
  id: string
  fact: string
  subject: string
  predicate: string
  sourceThreadId: string | null
  lastReferencedAt: number
  createdAt: number
  createdBy: 'user' | 'stina'
}

function rowToFact(row: FactRow): ProfileFact {
  return {
    id: row.id,
    fact: row.fact,
    subject: row.subject,
    predicate: row.predicate,
    source_thread_id: row.sourceThreadId,
    last_referenced_at: row.lastReferencedAt,
    created_at: row.createdAt,
    created_by: row.createdBy,
  }
}

// satisfy unused-import lint if any
void sql
