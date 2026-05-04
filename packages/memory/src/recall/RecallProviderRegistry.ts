import type { RecallQuery, RecallResult } from '@stina/core'

/**
 * A handler an extension registers via `registerRecallProvider` (per §02
 * Recall API and §03). Returns ranked results from the extension's domain
 * data; the registry merges results from all registered handlers.
 */
export type RecallProviderHandler = (query: RecallQuery) => Promise<RecallResult[]>

/**
 * In-process registry for recall providers. Extensions register handlers via
 * the public extension API; the registry runs them in parallel when `recall`
 * is invoked from a Stina decision turn.
 *
 * The merge step (rank + truncate to `limit`) is intentionally simple in v1
 * — a stable score-descending sort. Per §03, semantic similarity is a
 * follow-up gated on embedding-backed search.
 */
export class RecallProviderRegistry {
  private providers = new Map<string, RecallProviderHandler>()

  /**
   * Register a handler under the given extension id. Re-registering with the
   * same id replaces the prior handler (extensions may re-load).
   */
  register(extensionId: string, handler: RecallProviderHandler): void {
    this.providers.set(extensionId, handler)
  }

  unregister(extensionId: string): void {
    this.providers.delete(extensionId)
  }

  has(extensionId: string): boolean {
    return this.providers.has(extensionId)
  }

  size(): number {
    return this.providers.size
  }

  /**
   * Run the query against all registered providers in parallel. Errors in any
   * one provider do not abort the rest — failed providers are skipped (and
   * the error is delivered via the optional `onError` callback for logging).
   * Results are sorted by score descending and truncated to query.limit.
   */
  async query(
    query: RecallQuery,
    options: { onError?: (extensionId: string, error: unknown) => void } = {}
  ): Promise<RecallResult[]> {
    const entries = Array.from(this.providers.entries())
    const settled = await Promise.allSettled(entries.map(([, handler]) => handler(query)))

    const merged: RecallResult[] = []
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]!
      const entry = entries[i]!
      if (result.status === 'fulfilled') {
        merged.push(...result.value)
      } else {
        options.onError?.(entry[0], result.reason)
      }
    }

    merged.sort((a, b) => b.score - a.score)
    if (query.limit !== undefined) {
      return merged.slice(0, query.limit)
    }
    return merged
  }
}
