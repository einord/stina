<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ActivityLogKind, ToolSeverity } from '@stina/core'
import { useActivityLog } from '../../composables/useActivityLog.js'
import { localDateToMs, msToLocalDateStr } from '../../composables/activityLogDateUtils.js'
import ActivityLogViewEntryRow from './ActivityLogView.EntryRow.vue'
import ActivityLogViewInspector from './ActivityLogView.Inspector.vue'

/**
 * Cross-thread activity log view per docs/redesign-2026/05-ui-ux.md
 * §"Activity log (under the menu)".
 *
 * Layout: filter row at the top, entry list (newest-first) in the center, an
 * inspector pane on the right that shows full audit detail of the clicked
 * entry. The inline rendering inside threads (in the inbox timeline) handles
 * first-line awareness; this view handles cross-thread exploration.
 *
 * v1 covers: kind multi-select, severity single-select, dream-pass and auto-
 * action quick filters, and the inspector.
 * v2 adds: date range (Från/Till), tool filter chips (client-side), and the
 * "Rensa filter" extracted function that resets all four filter dimensions.
 * Extension filter chips are deferred.
 *
 * Emits `open-thread` so the surrounding shell can switch to the inbox view
 * with the given thread selected. The shell wires this up.
 */

const emit = defineEmits<{
  (e: 'open-thread', threadId: string): void
}>()

const log = useActivityLog()

const ALL_KINDS: ActivityLogKind[] = [
  'event_handled',
  'event_silenced',
  'auto_action',
  'action_blocked',
  'memory_change',
  'thread_created',
  'dream_pass_run',
  'dream_pass_flag',
  'settings_migration',
  'migration_completed',
]

const KIND_LABELS: Record<ActivityLogKind, string> = {
  event_handled: 'Hanterat',
  event_silenced: 'Tyst hanterat',
  auto_action: 'Auto-handling',
  action_blocked: 'Stoppad',
  memory_change: 'Minne',
  thread_created: 'Tråd skapad',
  dream_pass_run: 'Drömpass',
  dream_pass_flag: 'Drömpass-flagga',
  settings_migration: 'Inställningsmigrering',
  migration_completed: 'Migrering klar',
}

const SEVERITIES: ToolSeverity[] = ['low', 'medium', 'high', 'critical']
const SEVERITY_LABELS: Record<ToolSeverity, string> = {
  low: 'Låg',
  medium: 'Medel',
  high: 'Hög',
  critical: 'Kritisk',
}

const DREAM_PASS_KINDS: ActivityLogKind[] = ['dream_pass_run', 'dream_pass_flag']
const AUTO_ACTION_KINDS: ActivityLogKind[] = ['auto_action']

// ── Tool filter (client-side only) ───────────────────────────────────────────

const toolFilter = ref<string | null>(null)

const availableTools = computed(() => {
  const map = new Map<string, string>()
  for (const e of log.entries.value) {
    if (e.kind === 'auto_action' || e.kind === 'action_blocked') {
      const d = e.details as Record<string, unknown>
      const id = typeof d['tool_id'] === 'string' ? d['tool_id'] : null
      const name = typeof d['tool_name'] === 'string' ? d['tool_name'] : id
      if (id) map.set(id, name ?? id)
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
})

const displayedEntries = computed(() => {
  if (!toolFilter.value) return log.entries.value
  return log.entries.value.filter((e) => {
    const d = e.details as Record<string, unknown>
    return d['tool_id'] === toolFilter.value
  })
})

// ── Date range (Från / Till) ─────────────────────────────────────────────────

const afterDateStr = computed(() =>
  log.afterMs.value !== null ? msToLocalDateStr(log.afterMs.value) : '',
)

const beforeDateStr = computed(() =>
  log.beforeMs.value !== null ? msToLocalDateStr(log.beforeMs.value - 86_400_000) : '',
)

async function setAfterDate(e: Event): Promise<void> {
  const val = (e.target as HTMLInputElement).value
  log.afterMs.value = val ? localDateToMs(val) : null
  await log.loadEntries()
}

async function setBeforeDate(e: Event): Promise<void> {
  const val = (e.target as HTMLInputElement).value
  log.beforeMs.value = val ? localDateToMs(val) + 86_400_000 : null
  await log.loadEntries()
}

// ── Clear all filters ─────────────────────────────────────────────────────────

const isAnyFilterActive = computed(
  () =>
    log.kindFilter.value.length > 0 ||
    log.severityFilter.value !== null ||
    log.afterMs.value !== null ||
    log.beforeMs.value !== null ||
    toolFilter.value !== null,
)

async function clearAllFilters(): Promise<void> {
  log.kindFilter.value = []
  log.severityFilter.value = null
  log.afterMs.value = null
  log.beforeMs.value = null
  toolFilter.value = null
  await log.loadEntries()
}

// ── Lifecycle / misc ──────────────────────────────────────────────────────────

onMounted(async () => {
  // Kick off thread title resolution + initial load in parallel.
  await Promise.all([log.loadThreadTitles(), log.loadEntries()])
})

function isKindSelected(k: ActivityLogKind): boolean {
  return log.kindFilter.value.includes(k)
}

async function toggleKind(k: ActivityLogKind): Promise<void> {
  const current = log.kindFilter.value
  if (current.includes(k)) {
    log.kindFilter.value = current.filter((x) => x !== k)
  } else {
    log.kindFilter.value = [...current, k]
  }
  await log.loadEntries()
}

async function clearKindFilter(): Promise<void> {
  log.kindFilter.value = []
  await log.loadEntries()
}

const dreamPassActive = computed(() => {
  const current = log.kindFilter.value
  if (current.length !== DREAM_PASS_KINDS.length) return false
  return DREAM_PASS_KINDS.every((k) => current.includes(k))
})

async function toggleDreamPass(): Promise<void> {
  if (dreamPassActive.value) {
    log.kindFilter.value = []
  } else {
    log.kindFilter.value = [...DREAM_PASS_KINDS]
  }
  await log.loadEntries()
}

const autoActionActive = computed(() => {
  const current = log.kindFilter.value
  return current.length === 1 && current[0] === 'auto_action'
})

async function toggleAutoAction(): Promise<void> {
  if (autoActionActive.value) {
    log.kindFilter.value = []
  } else {
    log.kindFilter.value = [...AUTO_ACTION_KINDS]
  }
  await log.loadEntries()
}

async function setSeverity(s: ToolSeverity | null): Promise<void> {
  log.severityFilter.value = s
  await log.loadEntries()
}

function handleEntrySelect(id: string): void {
  log.selectEntry(id)
}

function handleOpenThread(threadId: string): void {
  // The inspector emits an empty string when the close button is pressed —
  // treat that as "deselect" instead of "navigate".
  if (!threadId) {
    log.selectEntry(null)
    return
  }
  emit('open-thread', threadId)
}
</script>

<template>
  <div class="activity-log-view">
    <header class="activity-log-view__filters">
      <h2 class="activity-log-view__title">Aktivitetslogg</h2>

      <div class="activity-log-view__quick-row">
        <button
          type="button"
          class="chip chip--quick"
          :class="{ 'chip--active': dreamPassActive }"
          @click="toggleDreamPass"
        >
          ☾ Drömpass
        </button>
        <button
          type="button"
          class="chip chip--quick"
          :class="{ 'chip--active': autoActionActive }"
          @click="toggleAutoAction"
        >
          ⚡ Auto-handlingar
        </button>
        <button
          type="button"
          class="chip chip--ghost"
          :disabled="!isAnyFilterActive"
          @click="clearAllFilters"
        >
          Rensa filter
        </button>
      </div>

      <div class="activity-log-view__chip-group">
        <span class="activity-log-view__chip-label">Typ</span>
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': log.kindFilter.value.length === 0 }"
          @click="clearKindFilter"
        >
          Alla
        </button>
        <button
          v-for="k in ALL_KINDS"
          :key="k"
          type="button"
          class="chip"
          :class="{ 'chip--active': isKindSelected(k) }"
          @click="toggleKind(k)"
        >
          {{ KIND_LABELS[k] }}
        </button>
      </div>

      <div class="activity-log-view__chip-group">
        <span class="activity-log-view__chip-label">Allvarlighet</span>
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': log.severityFilter.value === null }"
          @click="setSeverity(null)"
        >
          Alla
        </button>
        <button
          v-for="s in SEVERITIES"
          :key="s"
          type="button"
          class="chip"
          :class="[
            `chip--severity-${s}`,
            { 'chip--active': log.severityFilter.value === s },
          ]"
          @click="setSeverity(s)"
        >
          {{ SEVERITY_LABELS[s] }}
        </button>
      </div>

      <div class="activity-log-view__date-row">
        <span class="activity-log-view__chip-label">Datum</span>
        <label class="activity-log-view__date-label">
          Från
          <input type="date" :value="afterDateStr" @change="setAfterDate" />
        </label>
        <label class="activity-log-view__date-label">
          Till
          <input type="date" :value="beforeDateStr" @change="setBeforeDate" />
        </label>
      </div>

      <div v-if="availableTools.length > 0" class="activity-log-view__chip-group">
        <span class="activity-log-view__chip-label">Verktyg</span>
        <span class="activity-log-view__chip-caption">laddade poster</span>
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': toolFilter === null }"
          @click="toolFilter = null"
        >
          Alla
        </button>
        <button
          v-for="t in availableTools"
          :key="t.id"
          type="button"
          class="chip"
          :class="{ 'chip--active': toolFilter === t.id }"
          @click="toolFilter = t.id"
        >
          {{ t.name }}
        </button>
      </div>
    </header>

    <div class="activity-log-view__body">
      <section class="activity-log-view__list">
        <div v-if="log.isLoading.value" class="activity-log-view__status">
          Laddar…
        </div>
        <div v-else-if="log.error.value" class="activity-log-view__status activity-log-view__status--error">
          {{ log.error.value }}
        </div>
        <div v-else-if="displayedEntries.length === 0" class="activity-log-view__status">
          Inga poster matchar filtren.
        </div>
        <div v-else class="activity-log-view__rows">
          <ActivityLogViewEntryRow
            v-for="entry in displayedEntries"
            :key="entry.id"
            :entry="entry"
            :thread-by-id="log.threadById.value"
            :selected="log.selectedEntryId.value === entry.id"
            @select="handleEntrySelect"
          />
        </div>
      </section>

      <ActivityLogViewInspector
        :entry="log.selectedEntry.value"
        :thread-by-id="log.threadById.value"
        @open-thread="handleOpenThread"
      />
    </div>
  </div>
</template>

<style scoped>
.activity-log-view {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  width: 100%;
  background: var(--color-surface, #faf8f3);
  color: var(--color-text, #2a2722);
  min-height: 0;

  > .activity-log-view__filters {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    display: flex;
    flex-direction: column;
    gap: 0.625rem;

    > .activity-log-view__title {
      margin: 0 0 0.25rem 0;
      font-size: 1.05rem;
      font-weight: 600;
    }

    > .activity-log-view__quick-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    > .activity-log-view__chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      align-items: center;

      > .activity-log-view__chip-label {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted, #6b6359);
        margin-right: 0.5rem;
        min-width: 5.5rem;
      }

      > .activity-log-view__chip-caption {
        font-size: 0.68rem;
        color: var(--color-text-muted, #6b6359);
        opacity: 0.7;
        margin-right: 0.25rem;
      }
    }

    > .activity-log-view__date-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      align-items: center;

      > .activity-log-view__chip-label {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted, #6b6359);
        margin-right: 0.5rem;
        min-width: 5.5rem;
      }
    }
  }

  > .activity-log-view__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 22rem);
    min-height: 0;
    overflow: hidden;
  }
}

.activity-log-view__date-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  color: var(--color-text-muted, #6b6359);

  > input[type='date'] {
    appearance: none;
    border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.12));
    background: var(--color-surface-alt, #f5f1e9);
    color: var(--color-text, #2a2722);
    font-size: 0.78rem;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    cursor: pointer;
    height: 1.875rem; /* matches chip height */
    box-sizing: border-box;

    &:focus {
      outline: none;
      border-color: var(--color-accent, #b48a5a);
    }
  }
}

.activity-log-view__list {
  overflow-y: auto;
  padding: 0.75rem 1rem;
  min-height: 0;

  > .activity-log-view__rows {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
}

.activity-log-view__status {
  padding: 1rem;
  text-align: center;
  color: var(--color-text-muted, #6b6359);
  font-size: 0.9rem;

  &.activity-log-view__status--error {
    color: var(--color-accent-rose, #c4736a);
  }
}

.chip {
  appearance: none;
  border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.12));
  background: var(--color-surface-alt, #f5f1e9);
  color: var(--color-text, #2a2722);
  font-size: 0.78rem;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;

  &:hover:not(:disabled) {
    background: var(--color-surface, #faf8f3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &.chip--active {
    background: var(--color-accent, #b48a5a);
    color: var(--color-on-accent, #fffaf0);
    border-color: var(--color-accent, #b48a5a);
  }

  &.chip--quick {
    font-weight: 600;
  }

  &.chip--ghost {
    background: transparent;
    color: var(--color-text-muted, #6b6359);
    border-color: transparent;
  }
}

.chip--severity-critical.chip--active {
  background: var(--color-accent-rose, #c4736a);
  border-color: var(--color-accent-rose, #c4736a);
}

@media (max-width: 900px) {
  .activity-log-view > .activity-log-view__body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
}
</style>
