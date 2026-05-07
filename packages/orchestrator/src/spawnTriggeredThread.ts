import type { ThreadTrigger, AppContent } from '@stina/core'
import type { ThreadRepository } from '@stina/threads/db'
import { deriveTitleFromAppContent, deriveLinkedEntities } from '@stina/threads'
import type { ActivityLogRepository } from '@stina/autonomy/db'
import type { MemoryContextLoader } from './memory/MemoryContextLoader.js'
import type { DecisionTurnProducer } from './producers/canned.js'
import { runDecisionTurn } from './runDecisionTurn.js'
import { applyFailureFraming } from './applyFailureFraming.js'

/**
 * Input for spawning a triggered thread. Accepts the full `ThreadTrigger` and
 * `AppContent` unions — including `kind: 'stina'` triggers and `kind: 'system'`
 * content — so both the public extension path (after host validation) and the
 * runtime-internal path (`emitEventInternal`, see §04 line 49) can use the same
 * pipeline.
 *
 * `source` is REQUIRED here. The public path stamps it from the host's
 * authoritative extensionId; the internal path stamps `RUNTIME_EXTENSION_ID`.
 * Use the app-level `emitEventInternal` wrapper to get the default-RUNTIME_EXTENSION_ID
 * behaviour with optional source override.
 */
export interface SpawnTriggeredThreadInput {
  trigger: ThreadTrigger
  content: AppContent
  source: { extension_id: string; component?: string }
  /**
   * Optional explicit title. When provided, overrides the title derived from
   * the content via `deriveTitleFromAppContent`. Useful for runtime callers
   * (welcome, recap, dream-pass) where the content-derived default is awkward.
   */
  title?: string
}

/**
 * Dependencies injected into `spawnTriggeredThread`. Mirrors the pattern used
 * by `applyFailureFraming` so a single deps object can be constructed once and
 * reused across calls.
 */
export interface SpawnTriggeredThreadDeps {
  threadRepo: ThreadRepository
  activityLogRepo: ActivityLogRepository
  memoryLoader?: MemoryContextLoader
  producer?: DecisionTurnProducer
  logger: { warn: (msg: string, ctx?: Record<string, unknown>) => void }
}

/**
 * Create a triggered thread and run the decision turn.
 *
 * This is the single source of truth for the thread-create + appendMessage +
 * decision-turn + failure-framing pipeline. Both the public extension path
 * (via `EventsHandler.emitThreadEvent`) and the runtime-internal path
 * (`emitEventInternal`, §04 line 49 / acceptance line 204) delegate here.
 *
 * Lifecycle (per §04):
 *   1. Thread created with `status: 'active'`, `surfaced_at: null`.
 *   2. Initial AppMessage appended.
 *   3. Decision turn runs (success → `markFirstTurnCompleted` inside `runDecisionTurn`;
 *      failure → `applyFailureFraming` lifts the gate after framing append).
 *   4. Returns `{ thread_id }` — never throws (errors are framed in-thread).
 */
export async function spawnTriggeredThread(
  deps: SpawnTriggeredThreadDeps,
  input: SpawnTriggeredThreadInput
): Promise<{ thread_id: string }> {
  const { threadRepo, activityLogRepo, memoryLoader, producer, logger } = deps
  const { trigger, content, source } = input

  // Derive title and linked entities from content, unless an explicit title override was provided.
  const title = input.title ?? deriveTitleFromAppContent(content)
  const linkedEntities = deriveLinkedEntities({ trigger, content })

  const thread = await threadRepo.create({ trigger, title, linkedEntities })

  await threadRepo.appendMessage({
    thread_id: thread.id,
    author: 'app',
    visibility: 'normal',
    source,
    content,
  })

  try {
    await runDecisionTurn({
      threadId: thread.id,
      threadRepo,
      ...(memoryLoader ? { memoryLoader } : {}),
      ...(producer ? { producer } : {}),
    })
  } catch (err) {
    await applyFailureFraming(
      { threadRepo, activityLogRepo, logger },
      { thread_id: thread.id, error: err }
    )
  }

  return { thread_id: thread.id }
}
