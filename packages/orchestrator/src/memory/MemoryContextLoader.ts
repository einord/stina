import type {
  Thread,
  StandingInstruction,
  ProfileFact,
  RecallResult,
} from '@stina/core'
import type { StandingInstructionRepository, ProfileFactRepository } from '@stina/memory/db'
import type { RecallProviderRegistry } from '@stina/memory'
import type { Logger } from '@stina/core'

/**
 * Maximum number of recall results kept per decision turn (v1 magic number,
 * §03 "bounded by entity count"). Pull into a named constant so future tuning
 * is one-line.
 */
export const MAX_RECALL_RESULTS_PER_TURN = 15

/**
 * Maximum total characters for the ## Information från extensions section
 * rendered into the system prompt. A hostile or buggy provider can return
 * very large content; without this cap the section grows without bound.
 */
export const MAX_RECALL_SECTION_CHARS = 8000

/**
 * Truncate a single recall result's content to 499 chars + … when it exceeds
 * 500 chars. Prevents a single provider result from dominating the prompt.
 *
 * Pure function — safe to test without any I/O.
 */
export function truncateResultContent(content: string): string {
  if (content.length <= 500) return content
  return content.slice(0, 499) + '…'
}

/**
 * Apply the section character budget by walking the result list and stopping
 * once the running total would exceed MAX_RECALL_SECTION_CHARS.
 *
 * Each line contributes `source_detail.length + 2 + content.length` characters
 * (matching the "- {source_detail}: {content}" render format).
 *
 * Pure function — safe to test without any I/O.
 */
export function applyRecallSectionBudget(results: RecallResult[]): RecallResult[] {
  const kept: RecallResult[] = []
  let total = 0
  for (const r of results) {
    const lineLen = r.source_detail.length + 2 + r.content.length
    if (total + lineLen > MAX_RECALL_SECTION_CHARS) break
    kept.push(r)
    total += lineLen
  }
  return kept
}

/**
 * Read-side memory injected into Stina's decision-turn context per §03's
 * "Token budget at thread start":
 *
 *  1. all active standing instructions, and
 *  2. profile facts directly matching the thread's trigger entities, and
 *  3. recall results from registered extension recall providers, queried in
 *     parallel with the fact lookups (one query per linked entity's ref_id).
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
  /**
   * Recall results from registered extension recall providers. Populated when
   * the loader was constructed with a RecallProviderRegistry and the thread
   * has linked entities. Empty (`[]`) otherwise.
   *
   * Results are deduplicated by (source_detail, ref_id) tuple, capped to
   * MAX_RECALL_RESULTS_PER_TURN, and sorted by score descending.
   * Per-result content is truncated to 500 chars (truncateResultContent).
   */
  recall_results: RecallResult[]
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
 *
 * Recall providers (optional, via recallProviderRegistry constructor argument):
 *
 * Per-entity recall query contract (v1):
 *  - Query shape: `{ query: entity.ref_id, scope: ['extensions'], limit: 5 }`.
 *    The `ref_id` is the match key standardised on in Phase 8d (lowercased
 *    email, calendar event_id, etc.). This is a **best-effort string match**:
 *    every provider receives every entity's ref_id, and providers are
 *    responsible for recognising/ignoring keys they don't own. There is no
 *    entity-type discriminator on RecallQuery in v1 — adding one is a v2 spec
 *    change. Providers that don't know what to do with an opaque key must
 *    return `[]`, not guess.
 *  - `scope: ['extensions']` is set **for forward-compat only**.
 *    RecallProviderRegistry.query() does NOT inspect scope today — it
 *    dispatches every query to every registered handler verbatim. Providers
 *    may use scope; the registry does not. A future reader should not chase a
 *    missing filter — none exists in v1.
 *  - The registry uses Promise.allSettled internally, so per-provider failures
 *    do not block the loader. An `onError` callback is passed so silently-
 *    failing providers are visible in logs.
 *  - If the registry-level query itself throws (not a per-provider failure),
 *    the loader catches and returns `recall_results: []` while still returning
 *    the standing instructions and linked facts. The decision turn proceeds
 *    without extension context rather than failing entirely.
 *
 * Deduplication uses a tuple-keyed Map<source_detail, Map<ref_id, RecallResult>>
 * rather than a string-concatenated key to avoid collisions when either field
 * contains `::` (extensions may legitimately use such ref_ids).
 *
 * Sorting is stable in modern JS engines (V8, SpiderMonkey, JSC ≥ 2019), so
 * equal-score ties preserve insertion order (= provider-registration order).
 */
export class DefaultMemoryContextLoader implements MemoryContextLoader {
  constructor(
    private readonly instructions: StandingInstructionRepository,
    private readonly facts: ProfileFactRepository,
    private readonly recallRegistry?: RecallProviderRegistry,
    private readonly logger?: Logger
  ) {}

  async load(thread: Thread, at: number = Date.now()): Promise<MemoryContext> {
    const active_instructions = await this.instructions.listActive(at)

    const subjectKeys = new Set<string>()
    for (const entity of thread.linked_entities) {
      if (entity.ref_id) subjectKeys.add(entity.ref_id)
      if (entity.snapshot.display) subjectKeys.add(entity.snapshot.display)
    }

    if (subjectKeys.size === 0) {
      return { active_instructions, linked_facts: [], recall_results: [] }
    }

    // Fact lookups + extension recall queries run in parallel — neither depends
    // on the other. Only entities with a ref_id are recall-queried;
    // snapshot.display is free-text and would yield noisy provider results
    // (extensions should index by ref_id).
    const [factGroups, recall_results] = await Promise.all([
      Promise.all([...subjectKeys].map((s) => this.facts.findBySubject(s))),
      this.loadRecallResults(thread),
    ])
    const linked_facts = dedupeById(factGroups.flat())

    return { active_instructions, linked_facts, recall_results }
  }

  private async loadRecallResults(thread: Thread): Promise<RecallResult[]> {
    if (!this.recallRegistry) return []

    const entityRefIds = thread.linked_entities
      .map((e) => e.ref_id)
      .filter((id): id is string => Boolean(id))

    if (entityRefIds.length === 0) return []

    let rawResults: RecallResult[] = []
    try {
      const perEntityResults = await Promise.all(
        entityRefIds.map((refId) =>
          this.recallRegistry!.query(
            { query: refId, scope: ['extensions'], limit: 5 },
            {
              onError: (extensionId, err) => {
                this.logger?.warn('Recall provider failed', {
                  extensionId,
                  refId,
                  error: err instanceof Error ? err.message : String(err),
                })
              },
            }
          )
        )
      )
      rawResults = perEntityResults.flat()
    } catch (err) {
      this.logger?.warn('Recall registry query failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }

    // Dedupe by (source_detail, ref_id) tuple — use nested Map to avoid
    // collisions when either field contains '::'.
    // First occurrence wins; provider-registration order is preserved for
    // equal-score ties after the sort below.
    const seen = new Map<string, Map<string, RecallResult>>()
    const deduped: RecallResult[] = []
    for (const result of rawResults) {
      let byRefId = seen.get(result.source_detail)
      if (!byRefId) {
        byRefId = new Map()
        seen.set(result.source_detail, byRefId)
      }
      if (!byRefId.has(result.ref_id)) {
        byRefId.set(result.ref_id, result)
        deduped.push(result)
      }
    }

    // Sort by score descending. Array.sort is stable in modern engines, so
    // equal-score ties preserve insertion order (= provider-registration order).
    // Document this in a comment so future tests don't assert ordering that
    // depends on flaky engine details.
    deduped.sort((a, b) => b.score - a.score)

    // Apply the per-turn count cap.
    const capped = deduped.slice(0, MAX_RECALL_RESULTS_PER_TURN)

    // Apply per-result content truncation.
    const truncated = capped.map((r) =>
      r.content.length > 500
        ? { ...r, content: truncateResultContent(r.content) }
        : r
    )

    // Apply the section character budget.
    return applyRecallSectionBudget(truncated)
  }
}

/**
 * Null loader: returns empty memory. Used as a default in places that don't
 * yet wire a real loader (e.g. legacy callers, narrowly-scoped tests).
 */
export const emptyMemoryContextLoader: MemoryContextLoader = {
  async load(): Promise<MemoryContext> {
    return { active_instructions: [], linked_facts: [], recall_results: [] }
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
