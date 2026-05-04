/**
 * @stina/memory — standing instructions, profile facts, thread summaries,
 * recall coordination, dream pass.
 *
 * Implements the memory layer described in
 * docs/redesign-2026/02-data-model.md §Memory and the behavior in
 * docs/redesign-2026/03-memory.md (extraction model, confirmation pattern,
 * conflict resolution, recall) and docs/redesign-2026/07-dream-pass.md
 * (consolidation, summarization, flagging).
 *
 * Public types live in @stina/core (StandingInstruction, ProfileFact,
 * ThreadSummary, RecallQuery/Result). This package owns the database
 * schema, the migrations, the single-writer memory pipeline, the recall
 * provider registry, and the dream-pass runner.
 *
 * v0.1.0: skeleton — schema and types only. Implementation lands in
 * subsequent commits.
 */

export {} // intentional empty barrel until implementation lands
