import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { Thread, Message } from '@stina/core'
import { useApi } from './useApi.js'

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
  /** Loading flag for messages of the selected thread. */
  isLoadingMessages: Ref<boolean>

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
  const isLoadingMessages = ref(false)

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

  async function selectThread(id: string | null): Promise<void> {
    selectedId.value = id
    messages.value = []
    if (!id) return
    isLoadingMessages.value = true
    error.value = null
    try {
      messages.value = await api.threads.listMessages(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      isLoadingMessages.value = false
    }
  }

  async function createUserThread(text: string, title?: string): Promise<Thread> {
    error.value = null
    const created = await api.threads.create({
      content: { text },
      ...(title ? { title } : {}),
    })
    // Insert at the top of the list (most-recent-activity-first ordering).
    threads.value = [created, ...threads.value]
    await selectThread(created.id)
    return created
  }

  async function replyToSelected(text: string): Promise<Message | null> {
    const id = selectedId.value
    if (!id) return null
    error.value = null
    const message = await api.threads.appendMessage(id, { content: { text } })
    messages.value = [...messages.value, message]
    // The thread's last_activity_at advanced and a quiet thread may have
    // auto-revived to active — refresh the thread list to reflect that.
    await loadThreads()
    return message
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
    isLoadingMessages,
    loadThreads,
    selectThread,
    createUserThread,
    replyToSelected,
  }
}
