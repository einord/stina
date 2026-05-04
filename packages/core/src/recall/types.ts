/**
 * Recall types — see docs/redesign-2026/02-data-model.md §Recall API and
 * docs/redesign-2026/03-memory.md.
 *
 * `recall` is a built-in tool available to Stina from any thread. It queries
 * memory and registered extension recall providers in parallel and merges
 * results by score.
 */

export type RecallScope =
  | 'standing_instructions'
  | 'profile_facts'
  | 'thread_summaries'
  | 'extensions'

export interface RecallQuery {
  query: string
  /** If omitted, queries all sources. */
  scope?: RecallScope[]
  limit?: number
}

export interface RecallResult {
  source: 'memory' | 'extension'
  /** Memory type for memory-source results, extension_id for extension-source. */
  source_detail: string
  content: string
  /** thread_id, fact_id, instruction_id, or extension-defined ref. */
  ref_id: string
  score: number
}
