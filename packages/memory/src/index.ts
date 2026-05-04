/**
 * @stina/memory — standing instructions, profile facts, thread summaries,
 * recall coordination.
 *
 * Implements the memory layer described in
 * docs/redesign-2026/02-data-model.md §Memory and the behavior in
 * docs/redesign-2026/03-memory.md (extraction model, confirmation pattern,
 * conflict resolution, recall) and docs/redesign-2026/07-dream-pass.md
 * (consolidation, summarization, flagging).
 *
 * Public types live in @stina/core. This package owns the database schema,
 * the migrations, the repositories with §07-hard-rule guards, and the recall
 * provider registry.
 */

export {
  StandingInstructionRepository,
  ProfileFactRepository,
  ThreadSummaryRepository,
  standingInstructions,
  profileFacts,
  threadSummaries,
  memorySchema,
  getMemoryMigrationsPath,
  type MemoryDb,
  type CreateStandingInstructionInput,
  type CreateProfileFactInput,
} from './db/index.js'

export {
  RecallProviderRegistry,
  type RecallProviderHandler,
} from './recall/RecallProviderRegistry.js'
