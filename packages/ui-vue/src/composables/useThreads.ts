import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Thread, Message, ActivityLogEntry } from '@stina/core'
import type { ToolSeverity } from '@stina/extension-api'
import { useApi } from './useApi.js'

/**
 * One entry in the merged thread timeline that mixes Messages and inline
 * ActivityLogEntries in chronological order per §05.
 */
export type TimelineItem =
  | { kind: 'message'; created_at: number; data: Message }
  | { kind: 'activity'; created_at: number; data: ActivityLogEntry }

/**
 * Live state for an in-flight decision turn. Mirrors the server-side
 * `TurnStreamEvent` sequence: `text` accumulates `content_delta`s, `tools`
 * tracks each `tool_start` and updates to `'done' | 'error'` on the
 * matching `tool_end`.
 */
export interface StreamingDraft {
  threadId: string
  text: string
  tools: StreamingToolCall[]
}

export interface StreamingToolCall {
  id: string
  name: string
  status: 'running' | 'done' | 'error' | 'blocked'
  /**
   * Severity carried on the originating `tool_start` event. Drives the
   * inbox streaming card's per-row visual weight per §05. The matching
   * `tool_end` only flips the status — severity is captured once at
   * start and reused for the lifetime of the row.
   */
  severity: ToolSeverity
}

/**
 * Inbox-model state for the redesign-2026 UI. Loads threads + messages from
 * the threads/messages API and exposes them as reactive refs grouped by the
 * §05 segments.
 *
 * Designed as a fresh instance per InboxView mount (no global singleton) so
 * unmounting the view tears down listeners and lets the next mount reload.
 */
export interface UseThreadsOptions {
  /** Optional initial scroll behaviour after loading; defaults to nothing. */
  selectFirstAfterLoad?: boolean
}

export interface UseThreadsReturn {
  /** All threads, sorted most-recent-first. */
  threads: Ref<Thread[]>
  /** Loading flag for the list. */
  isLoading: Ref<boolean>
  /** Error from the most recent list/select call (cleared on retry). */
  error: Ref<string | null>

  /** Threads grouped by segment (per §05). */
  segments: ComputedRef<{
    active: Thread[]
    quiet: Thread[]
    silentlyHandled: Thread[]
    archived: Thread[]
  }>
  /** Counter for the "Silently handled" segment label per §05. */
  silentlyHandledCount: ComputedRef<number>

  /** Currently-open thread (id or null). */
  selectedId: Ref<string | null>
  /** Resolved selected thread object (computed from id + threads list). */
  selectedThread: ComputedRef<Thread | null>
  /** Messages of the selected thread; reloaded each time selectedId changes. */
  messages: Ref<Message[]>
  /** Inline activity log entries for the selected thread (§05). */
  activityEntries: Ref<ActivityLogEntry[]>
  /** Messages + activity entries merged chronologically — what the UI renders. */
  timeline: ComputedRef<TimelineItem[]>
  /** Loading flag for messages of the selected thread. */
  isLoadingMessages: Ref<boolean>
  /**
   * Live in-flight Stina reply, populated as the server streams events.
   * `null` when no turn is streaming. The view renders this as a special
   * placeholder card after the persisted timeline.
   */
  streamingDraft: Ref<StreamingDraft | null>

  /** Load (or reload) the thread list. */
  loadThreads(): Promise<void>
  /** Select a thread, reloading its messages. Pass null to clear. */
  selectThread(id: string | null): Promise<void>
  /** Create a new user-triggered thread + first message; selects it on success. */
  createUserThread(text: string, title?: string): Promise<Thread>
  /** Append a user reply to the currently-selected thread. */
  replyToSelected(text: string): Promise<Message | null>
}

export function useThreads(_options: UseThreadsOptions = {}): UseThreadsReturn {
  const api = useApi()

  const threads = ref<Thread[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const selectedId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const activityEntries = ref<ActivityLogEntry[]>([])
  const isLoadingMessages = ref(false)
  const streamingDraft = ref<StreamingDraft | null>(null)

  const timeline = computed<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.value.map(
        (m): TimelineItem => ({ kind: 'message', created_at: m.created_at, data: m })
      ),
      ...activityEntries.value.map(
        (a): TimelineItem => ({ kind: 'activity', created_at: a.created_at, data: a })
      ),
    ]
    items.sort((a, b) => a.created_at - b.created_at)
    return items
  })

  const selectedThread = computed<Thread | null>(() => {
    const id = selectedId.value
    if (!id) return null
    return threads.value.find((t) => t.id === id) ?? null
  })

  const segments = computed(() => {
    const active: Thread[] = []
    const quiet: Thread[] = []
    const silentlyHandled: Thread[] = []
    const archived: Thread[] = []
    for (const t of threads.value) {
      if (t.status === 'archived') {
        archived.push(t)
      } else if (t.surfaced_at === null) {
        // Per §04: background thread = not surfaced. Lives in §05's
        // "Silently handled" segment regardless of active/quiet status.
        silentlyHandled.push(t)
      } else if (t.status === 'quiet') {
        quiet.push(t)
      } else {
        active.push(t)
      }
    }
    return { active, quiet, silentlyHandled, archived }
  })

  const silentlyHandledCount = computed(() => segments.value.silentlyHandled.length)

  async function loadThreads(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      threads.value = await api.threads.list()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      threads.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function loadMessages(id: string): Promise<void> {
    isLoadingMessages.value = true
    error.value = null
    try {
      const [msgs, activity] = await Promise.all([
        api.threads.listMessages(id),
        api.threads.listActivity(id),
      ])
      messages.value = msgs
      activityEntries.value = activity
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isLoadingMessages.value = false
    }
  }

  async function selectThread(id: string | null): Promise<void> {
    selectedId.value = id
    messages.value = []
    activityEntries.value = []
    if (!id) return
    await loadMessages(id)
  }

  /**
   * Apply one `ThreadStreamEvent` to the reactive state. Hoisted so both
   * createUserThread and replyToSelected stay in sync as the wire format
   * grows (e.g. tool_start / tool_end added in phase 7a).
   */
  function applyStreamEvent(
    event: import('@stina/api-client').ThreadStreamEvent,
    onAppended?: (m: Message) => void
  ): void {
    if (event.type === 'thread_created') {
      threads.value = [event.thread, ...threads.value]
      selectedId.value = event.thread.id
      messages.value = []
      activityEntries.value = []
      streamingDraft.value = { threadId: event.thread.id, text: '', tools: [] }
    } else if (event.type === 'user_message') {
      messages.value = [...messages.value, event.message]
    } else if (event.type === 'content_delta') {
      const draft = streamingDraft.value
      if (draft) streamingDraft.value = { ...draft, text: draft.text + event.text }
    } else if (event.type === 'tool_start') {
      const draft = streamingDraft.value
      if (draft) {
        streamingDraft.value = {
          ...draft,
          tools: [
            ...draft.tools,
            {
              id: event.tool_call_id,
              name: event.name,
              status: 'running',
              severity: event.severity,
            },
          ],
        }
      }
    } else if (event.type === 'tool_end') {
      const draft = streamingDraft.value
      if (draft) {
        // tool_end without a matching tool_start is a no-op: the map below
        // simply doesn't find a row to update. We deliberately don't
        // synthesize one because we wouldn't know the right severity.
        streamingDraft.value = {
          ...draft,
          tools: draft.tools.map((t) =>
            t.id === event.tool_call_id
              ? { ...t, status: event.error ? 'error' : 'done' }
              : t
          ),
        }
      }
    } else if (event.type === 'tool_blocked') {
      const draft = streamingDraft.value
      if (draft) {
        // Match by tool_call_id and set status to 'blocked'. If the row
        // doesn't exist yet (unlikely but defensive), it is a no-op.
        streamingDraft.value = {
          ...draft,
          tools: draft.tools.map((t) =>
            t.id === event.tool_call_id ? { ...t, status: 'blocked' } : t
          ),
        }
      }
    } else if (event.type === 'message_appended') {
      messages.value = [...messages.value, event.message]
      streamingDraft.value = null
      onAppended?.(event.message)
    } else if (event.type === 'error') {
      error.value = event.message
      streamingDraft.value = null
    }
  }

  async function createUserThread(text: string, title?: string): Promise<Thread> {
    error.value = null
    let createdThread: Thread | null = null

    try {
      await api.threads.streamCreate(
        { content: { text }, ...(title ? { title } : {}) },
        (event) => {
          if (event.type === 'thread_created') {
            createdThread = event.thread
          }
          applyStreamEvent(event)
        }
      )
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      streamingDraft.value = null
    } finally {
      await loadThreads()
    }

    if (!createdThread) {
      throw new Error(error.value ?? 'Stream completed without creating a thread')
    }
    return createdThread
  }

  async function replyToSelected(text: string): Promise<Message | null> {
    const id = selectedId.value
    if (!id) return null
    error.value = null
    streamingDraft.value = { threadId: id, text: '', tools: [] }

    let userMessage: Message | null = null
    let stinaMessage: Message | null = null

    try {
      await api.threads.streamAppendMessage(id, { content: { text } }, (event) => {
        if (event.type === 'user_message') userMessage = event.message
        applyStreamEvent(event, (m) => {
          stinaMessage = m
        })
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      streamingDraft.value = null
    } finally {
      await loadThreads()
    }

    return stinaMessage ?? userMessage
  }

  return {
    threads,
    isLoading,
    error,
    segments,
    silentlyHandledCount,
    selectedId,
    selectedThread,
    messages,
    activityEntries,
    timeline,
    isLoadingMessages,
    streamingDraft,
    loadThreads,
    selectThread,
    createUserThread,
    replyToSelected,
  }
}
