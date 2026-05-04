<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { ActivityLogKind, ToolSeverity } from '@stina/core'
import { useActivityLog } from '../../composables/useActivityLog.js'
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
 * action quick filters, and the inspector. Date range, tool filter, and
 * extension filter are deferred — the API supports `after`/`before`, so the
 * date range is one UX iteration away. Tool/extension live in `details` and
 * need a v2 schema decision before being exposed as filter chips.
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
          :disabled="log.kindFilter.value.length === 0 && log.severityFilter.value === null"
          @click="
            async () => {
              log.kindFilter.value = []
              log.severityFilter.value = null
              await log.loadEntries()
            }
          "
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
    </header>

    <div class="activity-log-view__body">
      <section class="activity-log-view__list">
        <div v-if="log.isLoading.value" class="activity-log-view__status">
          Laddar…
        </div>
        <div v-else-if="log.error.value" class="activity-log-view__status activity-log-view__status--error">
          {{ log.error.value }}
        </div>
        <div v-else-if="log.entries.value.length === 0" class="activity-log-view__status">
          Inga poster matchar filtren.
        </div>
        <div v-else class="activity-log-view__rows">
          <ActivityLogViewEntryRow
            v-for="entry in log.entries.value"
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
    }
  }

  > .activity-log-view__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 22rem);
    min-height: 0;
    overflow: hidden;
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
