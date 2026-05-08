import type { RuntimeMarkersRepository } from '@stina/autonomy/db'
import type { ThreadTrigger, AppContent } from '@stina/core'

/**
 * The welcome message shown on first boot (§04 "post-upgrade welcome thread"
 * use case). Swedish, using bullet character • (not an emoji).
 *
 * Single source of truth — avoids string drift between the spawned AppMessage
 * and any future tests or documentation references.
 */
export const WELCOME_MESSAGE_TEXT = `Hej och välkommen till din nya inkorg.

Stina hanterar nu händelser som kommer in — mejl, kalenderhändelser, schemalagda jobb — och visar dem här i Inkorgen. Hon resonerar tyst i bakgrunden och avbryter dig bara när det är värt din tid.

Tre snabba tips:
• Installera tillägg från Inställningar → Tillägg för att låta Stina läsa mejl, kalender eller annat.
• Skapa stående instruktioner och autopolicyer under Autonomi när du vill att Stina ska göra något automatiskt.
• Kolla Aktivitetslogg när du vill se vad som hänt i bakgrunden.

Om du undrar något — fråga direkt här. Trevligt att jobba ihop!`

/**
 * The marker key used to guard the welcome thread against duplicate spawns.
 * Bump to 'welcome_thread_v2' if the copy is rewritten significantly and we
 * want existing users to receive the new version.
 */
const WELCOME_MARKER_KEY = 'welcome_thread_v1'

/**
 * The title shown on the welcome thread's inbox card.
 *
 * An explicit override is used because deriveTitleFromAppContent for 'system'
 * content truncates the message body to 200 codepoints — functionally fine,
 * but "Välkommen till Stina" reads cleaner as a card headline.
 */
const WELCOME_THREAD_TITLE = 'Välkommen till Stina'

// IMPORTANT: the emitEventInternal callback shape is declared INLINE here.
// EmitEventInternalInput is exported from the apps (apps/api/server.ts,
// apps/electron/main/index.ts) but @stina/orchestrator cannot import from
// apps — that would invert the package layer (apps depend on packages, never
// the reverse). The inline shape mirrors the app-level type structurally
// and stays compatible via TypeScript structural typing.

/** Dependencies injected into `spawnWelcomeThreadIfNew`. */
export interface WelcomeThreadDeps {
  markersRepo: RuntimeMarkersRepository
  emitEventInternal: (input: {
    trigger: ThreadTrigger
    content: AppContent
    source?: { extension_id?: string; component?: string }
    title?: string
  }) => Promise<{ thread_id: string }>
  logger: {
    info: (msg: string, ctx?: Record<string, unknown>) => void
    warn: (msg: string, ctx?: Record<string, unknown>) => void
  }
}

/**
 * Spawn the welcome thread on first boot for the given user.
 *
 * - Checks `runtime_markers` for `welcome_thread_v1` keyed by userId.
 * - If present → no-op (already spawned on a previous boot).
 * - If absent → spawns a `kind: 'stina'` + `reason: 'system_notice'` thread
 *   with `kind: 'system'` content, then sets the marker.
 *
 * Best-effort: errors are logged but never thrown. Safe to call from the
 * app boot path — the welcome thread is a polish feature, not load-bearing.
 *
 * Marker write order: spawn first, set marker after success. If spawn fails,
 * returns `{ spawned: false }` and does not touch the marker (next boot
 * retries). If the marker write fails after a successful spawn, logs a warn
 * and returns `{ spawned: true, thread_id }` — accepts the tiny risk that the
 * next boot spawns a duplicate welcome thread (harmless; user can close one).
 *
 * Marker key version (`v1`): if the welcome copy is significantly rewritten in
 * the future, bump to `welcome_thread_v2`. Existing users get the v2 thread
 * once; their v1 thread remains in the inbox as historical artifact.
 */
export async function spawnWelcomeThreadIfNew(
  deps: WelcomeThreadDeps,
  args: { userId: string }
): Promise<{ spawned: boolean; thread_id?: string }> {
  const { markersRepo, emitEventInternal, logger } = deps
  const { userId } = args

  try {
    // Guard: skip if the welcome thread has already been spawned for this user.
    const alreadySpawned = await markersRepo.has(WELCOME_MARKER_KEY, userId)
    if (alreadySpawned) {
      return { spawned: false }
    }
  } catch (err) {
    logger.warn('spawnWelcomeThreadIfNew: failed to read marker — skipping welcome thread', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { spawned: false }
  }

  // Spawn the welcome thread. source is intentionally omitted so
  // emitEventInternal defaults to RUNTIME_EXTENSION_ID.
  let thread_id: string
  try {
    const result = await emitEventInternal({
      trigger: { kind: 'stina', reason: 'system_notice' },
      content: { kind: 'system', message: WELCOME_MESSAGE_TEXT },
      title: WELCOME_THREAD_TITLE,
    })
    thread_id = result.thread_id
  } catch (err) {
    logger.warn('spawnWelcomeThreadIfNew: emitEventInternal failed — welcome thread not spawned', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { spawned: false }
  }

  // Set the marker AFTER a successful spawn. If this fails, log but still
  // report success — the thread exists. Next boot will attempt to spawn again;
  // a duplicate welcome thread is an acceptable v1 trade-off.
  try {
    await markersRepo.set(WELCOME_MARKER_KEY, userId)
  } catch (err) {
    logger.warn(
      'spawnWelcomeThreadIfNew: marker write failed after successful spawn — duplicate possible on next boot',
      {
        userId,
        thread_id,
        err: err instanceof Error ? err.message : String(err),
      }
    )
  }

  logger.info('spawnWelcomeThreadIfNew: welcome thread spawned', { userId, thread_id })
  return { spawned: true, thread_id }
}
