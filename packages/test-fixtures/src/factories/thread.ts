import type {
  AppContent,
  AppMessage,
  EntityRef,
  Message,
  StinaMessage,
  Thread,
  ThreadStatus,
  ThreadTrigger,
  UserMessage,
} from '@stina/core'
import { FIXTURE_NOW_MS, hoursAgo, idGenerator } from './deterministic.js'

const threadId = idGenerator('tx-thread')
const messageId = idGenerator('tx-msg')

/**
 * Build a Thread record with sane defaults. All fields can be overridden.
 *
 * Defaults to a user-triggered, active, background thread created an hour
 * before FIXTURE_NOW_MS. The `id` is auto-generated deterministically;
 * pass `id` to override.
 */
export function makeThread(overrides: Partial<Thread> = {}): Thread {
  const created = overrides.created_at ?? hoursAgo(1)
  return {
    id: overrides.id ?? threadId(),
    trigger: overrides.trigger ?? { kind: 'user' },
    status: overrides.status ?? 'active',
    surfaced_at: overrides.surfaced_at ?? null,
    notified_at: overrides.notified_at ?? null,
    title: overrides.title ?? 'Sample thread',
    summary: overrides.summary ?? null,
    linked_entities: overrides.linked_entities ?? [],
    created_at: created,
    last_activity_at: overrides.last_activity_at ?? created,
  }
}

/**
 * Convenience for the common case "surfaced thread that triggered a notification".
 */
export function makeSurfacedThread(overrides: Partial<Thread> = {}): Thread {
  const created = overrides.created_at ?? hoursAgo(2)
  const surfaced = overrides.surfaced_at ?? created + 1000 * 30 // 30s later
  return makeThread({
    surfaced_at: surfaced,
    notified_at: overrides.notified_at ?? surfaced,
    last_activity_at: overrides.last_activity_at ?? surfaced,
    ...overrides,
  })
}

/**
 * Convenience for the common case "background thread that Stina handled silently".
 */
export function makeBackgroundThread(overrides: Partial<Thread> = {}): Thread {
  return makeThread({
    surfaced_at: null,
    notified_at: null,
    ...overrides,
  })
}

/**
 * Convenience: a quiet (idled-out) surfaced thread.
 */
export function makeQuietThread(overrides: Partial<Thread> = {}): Thread {
  return makeSurfacedThread({
    status: 'quiet' as ThreadStatus,
    summary: 'Conversation went quiet.',
    ...overrides,
  })
}

/**
 * Build an AppContent payload of the given kind with sensible defaults.
 * Overrides are applied last and may replace any field.
 */
export function makeAppContent<K extends AppContent['kind']>(
  kind: K,
  overrides: Partial<Extract<AppContent, { kind: K }>> = {} as Partial<Extract<AppContent, { kind: K }>>
): AppContent {
  switch (kind) {
    case 'mail':
      return {
        kind: 'mail',
        from: 'peter@example.com',
        subject: 'Q2 plan',
        snippet: 'Hej, hur går det med rapporten?',
        mail_id: 'm-fixture-1',
        ...(overrides as object),
      } as AppContent
    case 'calendar':
      return {
        kind: 'calendar',
        title: 'Standup',
        starts_at: FIXTURE_NOW_MS + 60 * 60 * 1000,
        ends_at: FIXTURE_NOW_MS + 90 * 60 * 1000,
        location: 'Konferensrum 2',
        event_id: 'e-fixture-1',
        ...(overrides as object),
      } as AppContent
    case 'scheduled':
      return {
        kind: 'scheduled',
        job_id: 'job-fixture-1',
        description: 'Daglig genomgång',
        ...(overrides as object),
      } as AppContent
    case 'extension_status':
      return {
        kind: 'extension_status',
        extension_id: 'stina-ext-mail',
        status: 'needs_reauth',
        detail: 'Tokenet har gått ut.',
        ...(overrides as object),
      } as AppContent
    case 'system':
      return {
        kind: 'system',
        message: 'Stina kunde inte bearbeta detta event automatiskt.',
        ...(overrides as object),
      } as AppContent
    default: {
      // Exhaustiveness check
      const _exhaustive: never = kind
      throw new Error(`Unknown AppContent kind: ${String(_exhaustive)}`)
    }
  }
}

/**
 * Build a user Message with sane defaults.
 */
export function makeUserMessage(overrides: Partial<UserMessage> = {}): UserMessage {
  return {
    id: overrides.id ?? messageId(),
    thread_id: overrides.thread_id ?? 'tx-thread-001',
    author: 'user',
    visibility: overrides.visibility ?? 'normal',
    content: overrides.content ?? { text: 'Hej Stina, hur ser dagen ut?' },
    created_at: overrides.created_at ?? hoursAgo(1),
  }
}

/**
 * Build a Stina Message with sane defaults.
 */
export function makeStinaMessage(overrides: Partial<StinaMessage> = {}): StinaMessage {
  return {
    id: overrides.id ?? messageId(),
    thread_id: overrides.thread_id ?? 'tx-thread-001',
    author: 'stina',
    visibility: overrides.visibility ?? 'normal',
    content: overrides.content ?? { text: 'God morgon! Lugnt tempo idag.' },
    created_at: overrides.created_at ?? hoursAgo(1),
  }
}

/**
 * Build an App Message with sane defaults. Caller supplies content via `makeAppContent`
 * (or directly).
 */
export function makeAppMessage(
  overrides: Partial<Omit<AppMessage, 'author'>> & { content: AppContent }
): AppMessage {
  return {
    id: overrides.id ?? messageId(),
    thread_id: overrides.thread_id ?? 'tx-thread-001',
    author: 'app',
    visibility: overrides.visibility ?? 'normal',
    source: overrides.source ?? { extension_id: 'stina-ext-mail' },
    content: overrides.content,
    created_at: overrides.created_at ?? hoursAgo(1),
  }
}

/** Discriminated-union typed Message factory. */
export function makeMessage(message: Message): Message {
  return message
}

/**
 * Convenience: an EntityRef with a snapshot. Common for mail/calendar threads.
 */
export function makeEntityRef(overrides: Partial<EntityRef> = {}): EntityRef {
  return {
    kind: overrides.kind ?? 'person',
    extension_id: overrides.extension_id ?? 'stina-ext-people',
    ref_id: overrides.ref_id ?? 'p-fixture-1',
    snapshot: overrides.snapshot ?? {
      display: 'Peter Andersson',
      excerpt: 'Manager · Q2 plan',
    },
  }
}

/** Reset internal id counters. Useful between test runs to get stable ids. */
export function resetThreadIdCounters(): void {
  // The closures capture their own counters; we expose a reset by replacing
  // them. Tests that need a clean slate import resetThreadIdCounters and call it.
  // Implementation re-creates the closures via module-level reassignment.
  // (For now, callers can simply override `id` manually; this hook is a
  // placeholder for more elaborate reset logic if needed.)
  /* intentional no-op in v0.1 — see comment */
}

/**
 * Build a `ThreadTrigger` of the given kind with sensible defaults.
 */
export function makeThreadTrigger(kind: ThreadTrigger['kind'], overrides: Record<string, unknown> = {}): ThreadTrigger {
  switch (kind) {
    case 'user':
      return { kind: 'user' }
    case 'mail':
      return {
        kind: 'mail',
        extension_id: 'stina-ext-mail',
        mail_id: 'm-fixture-1',
        ...overrides,
      } as ThreadTrigger
    case 'calendar':
      return {
        kind: 'calendar',
        extension_id: 'stina-ext-calendar',
        event_id: 'e-fixture-1',
        ...overrides,
      } as ThreadTrigger
    case 'scheduled':
      return {
        kind: 'scheduled',
        job_id: 'job-fixture-1',
        ...overrides,
      } as ThreadTrigger
    case 'stina':
      return {
        kind: 'stina',
        reason: 'manual',
        ...overrides,
      } as ThreadTrigger
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unknown ThreadTrigger kind: ${String(_exhaustive)}`)
    }
  }
}
