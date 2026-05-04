import {
  hoursAgo,
  makeStinaMessage,
  makeSurfacedThread,
} from '../factories/index.js'
import type { Scenario } from './types.js'

/**
 * Fresh-install scenario.
 *
 * The user has just installed the app. The inbox contains exactly the
 * welcome thread spawned by the runtime per §05's first-launch flow:
 * `trigger.kind: 'stina', reason: 'manual'`. No memories, no policies, no
 * activity log entries.
 *
 * Useful for: testing the empty-state UI, the welcome thread special card
 * style, the first-launch onboarding flow.
 */
export function freshInstall(): Scenario {
  const welcomeThreadId = 'fresh-welcome-001'

  const welcomeThread = makeSurfacedThread({
    id: welcomeThreadId,
    trigger: { kind: 'stina', reason: 'manual', insight: 'first-launch welcome' },
    title: 'Välkommen till Stina',
    created_at: hoursAgo(0.5),
    surfaced_at: hoursAgo(0.5),
    notified_at: hoursAgo(0.5),
    last_activity_at: hoursAgo(0.5),
  })

  const welcomeMessage = makeStinaMessage({
    id: 'fresh-welcome-msg-001',
    thread_id: welcomeThreadId,
    content: {
      text:
        'Hej! Det här är din inkorg. När något händer — ett mail kommer in, ' +
        'en kalenderpåminnelse fyrar, eller du frågar mig något — landar det ' +
        'som en tråd här. Jag tar hand om vissa tyst i bakgrunden och lyfter ' +
        'fram de som är värda din uppmärksamhet.\n\n' +
        'För att komma igång, vill du installera ett tillägg som låter mig ' +
        'läsa mail eller kolla din kalender?',
    },
    created_at: hoursAgo(0.5),
  })

  return {
    id: 'fresh-install',
    description: 'Empty inbox + welcome thread (first-launch state).',
    threads: [welcomeThread],
    messages: [welcomeMessage],
    standing_instructions: [],
    profile_facts: [],
    thread_summaries: [],
    auto_policies: [],
    activity_log_entries: [],
  }
}
