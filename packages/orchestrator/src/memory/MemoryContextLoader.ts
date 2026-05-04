import type {
  Thread,
  StandingInstruction,
  ProfileFact,
} from '@stina/core'
import type { StandingInstructionRepository, ProfileFactRepository } from '@stina/memory/db'

/**
 * Read-side memory injected into Stina's decision-turn context per §03's
 * "Token budget at thread start":
 *
 *  1. all active standing instructions, and
 *  2. profile facts directly matching the thread's trigger entities.
 *
 * Nothing else is auto-loaded. Thread summaries, broad recall, raw history of
 * other threads — all require an explicit `recall` call from inside the turn.
 */
export interface MemoryContext {
  /** Active standing instructions at turn time (valid_from ≤ at ≤ valid_until). */
  active_instructions: StandingInstruction[]
  /**
   * Profile facts whose subject matches one of the thread's `linked_entities`.
   * Empty for user-triggered threads with no linked entities — by design (§03
   * does not auto-load all facts about "user").
   */
  linked_facts: ProfileFact[]
}

export interface MemoryContextLoader {
  load(thread: Thread, at?: number): Promise<MemoryContext>
}

/**
 * Loader that reads from the live @stina/memory repositories.
 *
 * Subject-matching for profile facts: an entity contributes two candidate
 * subject keys — its `ref_id` (extension-internal id like a mail address or
 * person id) and its `snapshot.display` (human-readable form). Facts saved
 * against either form are picked up. This keeps the loader compatible with
 * extensions that haven't standardised on one subject convention yet, at the
 * cost of two queries per entity. Acceptable while the typical entity count
 * per thread is in the single digits (§03 "bounded by entity count").
 */
export class DefaultMemoryContextLoader implements MemoryContextLoader {
  constructor(
    private readonly instructions: StandingInstructionRepository,
    private readonly facts: ProfileFactRepository
  ) {}

  async load(thread: Thread, at: number = Date.now()): Promise<MemoryContext> {
    const active_instructions = await this.instructions.listActive(at)

    const subjectKeys = new Set<string>()
    for (const entity of thread.linked_entities) {
      if (entity.ref_id) subjectKeys.add(entity.ref_id)
      if (entity.snapshot.display) subjectKeys.add(entity.snapshot.display)
    }

    if (subjectKeys.size === 0) {
      return { active_instructions, linked_facts: [] }
    }

    const factGroups = await Promise.all(
      [...subjectKeys].map((s) => this.facts.findBySubject(s))
    )
    const linked_facts = dedupeById(factGroups.flat())

    return { active_instructions, linked_facts }
  }
}

/**
 * Null loader: returns empty memory. Used as a default in places that don't
 * yet wire a real loader (e.g. legacy callers, narrowly-scoped tests).
 */
export const emptyMemoryContextLoader: MemoryContextLoader = {
  async load(): Promise<MemoryContext> {
    return { active_instructions: [], linked_facts: [] }
  },
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}
