import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  ActivityLogEntry,
  ActivityLogKind,
  Thread,
  ToolSeverity,
} from '@stina/core'
import { useApi } from './useApi.js'

/**
 * State + loading logic for the cross-thread activity log view (§05).
 *
 * Filters compose: `kindFilter` (multi-select), `severityFilter` (single),
 * `afterMs` / `beforeMs` (date range). The view uses these refs directly and
 * calls `loadEntries()` after mutating any of them; this keeps the API calls
 * explicit instead of having a watch-effect fan-out behavior.
 *
 * Source-thread titles are looked up via a thread cache populated by
 * `loadThreadTitles()`, which makes one request to `/threads` (or the
 * Electron equivalent) and indexes by id. Entries with `thread_id === null`
 * (dream-pass entries, settings migrations, etc.) display "—".
 */
export interface UseActivityLogReturn {
  /** Currently-loaded entries, newest-first. */
  entries: Ref<ActivityLogEntry[]>
  /** Loading flag for the list. */
  isLoading: Ref<boolean>
  /** Error from the most recent load (cleared on retry). */
  error: Ref<string | null>

  /** Filter: which kinds to include. Empty = all kinds. */
  kindFilter: Ref<ActivityLogKind[]>
  /** Filter: severity to match exactly. null = all. */
  severityFilter: Ref<ToolSeverity | null>
  /** Filter: only entries newer than this. null = no lower bound. */
  afterMs: Ref<number | null>
  /** Filter: only entries older than this. null = no upper bound. */
  beforeMs: Ref<number | null>

  /** Currently-selected entry for the inspector pane. */
  selectedEntryId: Ref<string | null>
  /** Resolved selected entry. */
  selectedEntry: ComputedRef<ActivityLogEntry | null>

  /** Map of thread_id -> Thread for source-thread titles. */
  threadById: Ref<Map<string, Thread>>

  /** (Re)load the entries with the current filters. */
  loadEntries(): Promise<void>
  /** Load the thread list once so entries can resolve source titles. */
  loadThreadTitles(): Promise<void>
  /** Select an entry to populate the inspector pane. Pass null to clear. */
  selectEntry(id: string | null): void
}

export function useActivityLog(): UseActivityLogReturn {
  const api = useApi()

  const entries = ref<ActivityLogEntry[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const kindFilter = ref<ActivityLogKind[]>([])
  const severityFilter = ref<ToolSeverity | null>(null)
  const afterMs = ref<number | null>(null)
  const beforeMs = ref<number | null>(null)

  const selectedEntryId = ref<string | null>(null)
  const selectedEntry = computed<ActivityLogEntry | null>(() => {
    const id = selectedEntryId.value
    if (!id) return null
    return entries.value.find((e) => e.id === id) ?? null
  })

  const threadById = ref<Map<string, Thread>>(new Map())

  async function loadEntries(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const opts: Parameters<typeof api.activityLog.list>[0] = {}
      if (kindFilter.value.length > 0) opts.kind = kindFilter.value
      if (severityFilter.value !== null) opts.severity = severityFilter.value
      if (afterMs.value !== null) opts.after = afterMs.value
      if (beforeMs.value !== null) opts.before = beforeMs.value
      entries.value = await api.activityLog.list(opts)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      entries.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function loadThreadTitles(): Promise<void> {
    try {
      const list = await api.threads.list()
      const map = new Map<string, Thread>()
      for (const t of list) map.set(t.id, t)
      threadById.value = map
    } catch {
      // Source-title resolution is best-effort; leave the map empty.
    }
  }

  function selectEntry(id: string | null): void {
    selectedEntryId.value = id
  }

  return {
    entries,
    isLoading,
    error,
    kindFilter,
    severityFilter,
    afterMs,
    beforeMs,
    selectedEntryId,
    selectedEntry,
    threadById,
    loadEntries,
    loadThreadTitles,
    selectEntry,
  }
}
