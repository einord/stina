<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityLogEntry, Thread } from '@stina/core'

/**
 * One row in the cross-thread activity log list. Reuses the severity-driven
 * visual weight from `InboxView.ActivityEntry.vue` (low → quiet, medium →
 * visible, high → accented border-left, critical → strong border) but adds a
 * source-thread title column and a richer timestamp (date + time, since the
 * cross-thread view spans days/months).
 *
 * Dream-pass-origin entries (`details.source: 'dream_pass'` or kind starting
 * with `dream_pass_`) carry a small persistent dream-pass marker per §05's
 * "dream pass" filter contract.
 */

const props = defineProps<{
  entry: ActivityLogEntry
  threadById: Map<string, Thread>
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const iconByKind: Record<string, string> = {
  memory_change: '✎',
  auto_action: '⚡',
  action_blocked: '⚠',
  event_silenced: '∅',
  event_handled: '•',
  thread_created: '＋',
  dream_pass_run: '☾',
  dream_pass_flag: '⚑',
  settings_migration: '⇄',
  migration_completed: '✓',
}
const icon = computed(() => iconByKind[props.entry.kind] ?? '•')

const labelByKind: Record<string, string> = {
  memory_change: 'Minne',
  auto_action: 'Auto-handling',
  action_blocked: 'Handling stoppad',
  event_silenced: 'Tyst hanterat',
  event_handled: 'Hanterat',
  thread_created: 'Tråd skapad',
  dream_pass_run: 'Drömpass',
  dream_pass_flag: 'Flaggat av Stina',
  settings_migration: 'Inställningsmigrering',
  migration_completed: 'Migrering klar',
}
const label = computed(() => labelByKind[props.entry.kind] ?? props.entry.kind)

const timestampLabel = computed(() => {
  const d = new Date(props.entry.created_at)
  return d.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
})

const sourceThreadTitle = computed<string | null>(() => {
  if (!props.entry.thread_id) return null
  const t = props.threadById.get(props.entry.thread_id)
  return t?.title ?? props.entry.thread_id
})

const isDreamPass = computed(() => {
  if (props.entry.kind === 'dream_pass_run' || props.entry.kind === 'dream_pass_flag') {
    return true
  }
  const source = (props.entry.details as Record<string, unknown> | null)?.['source']
  return source === 'dream_pass'
})

function handleClick(): void {
  emit('select', props.entry.id)
}
</script>

<template>
  <button
    type="button"
    class="ae-row"
    :class="[
      `ae-row--${entry.kind}`,
      `ae-row--severity-${entry.severity}`,
      { 'ae-row--selected': selected },
    ]"
    @click="handleClick"
  >
    <span class="ae-row__icon" aria-hidden="true">{{ icon }}</span>
    <span class="ae-row__label">{{ label }}</span>
    <span class="ae-row__summary">{{ entry.summary }}</span>
    <span v-if="isDreamPass" class="ae-row__dream" title="Drömpass-ursprung">☾</span>
    <span class="ae-row__source">{{ sourceThreadTitle ?? '—' }}</span>
    <span class="ae-row__time">{{ timestampLabel }}</span>
  </button>
</template>

<style scoped>
.ae-row {
  all: unset;
  display: grid;
  grid-template-columns: 1.25rem auto minmax(0, 2fr) auto minmax(0, 1.5fr) auto;
  align-items: baseline;
  gap: 0.5rem 0.875rem;
  padding: 0.5rem 0.875rem;
  border-radius: 4px;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--color-text-muted, #6b6359);
  background: rgba(0, 0, 0, 0.015);
  cursor: pointer;
  border: 1px solid transparent;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  > .ae-row__icon {
    color: var(--color-text-muted, #6b6359);
    opacity: 0.7;
  }

  > .ae-row__label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.7;
    white-space: nowrap;
  }

  > .ae-row__summary {
    color: var(--color-text, #2a2722);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > .ae-row__dream {
    font-size: 0.85rem;
    color: var(--color-accent, #b48a5a);
    opacity: 0.8;
  }

  > .ae-row__source {
    font-size: 0.78rem;
    color: var(--color-text-muted, #6b6359);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > .ae-row__time {
    font-size: 0.72rem;
    opacity: 0.6;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
}

.ae-row--selected {
  background: rgba(180, 138, 90, 0.12);
  border-color: var(--color-accent, #b48a5a);
}

/* Severity-driven visual weight per §05 severity table. */

.ae-row--severity-low {
  background: transparent;
  opacity: 0.78;

  > .ae-row__summary {
    color: var(--color-text-muted, #6b6359);
  }
}

.ae-row--severity-medium {
  background: rgba(0, 0, 0, 0.025);
}

.ae-row--severity-high {
  background: rgba(180, 138, 90, 0.08);
  border-left: 3px solid var(--color-accent, #b48a5a);
  padding-left: 0.625rem;

  > .ae-row__summary {
    color: var(--color-text, #2a2722);
    font-weight: 500;
  }
}

.ae-row--severity-critical {
  background: rgba(196, 115, 106, 0.1);
  border: 1px solid var(--color-accent-rose, #c4736a);
  border-left-width: 3px;

  > .ae-row__summary {
    color: var(--color-text, #2a2722);
    font-weight: 600;
  }
}

.ae-row--action_blocked {
  > .ae-row__icon {
    color: var(--color-accent-rose, #c4736a);
    opacity: 1;
  }
}

.ae-row--auto_action {
  > .ae-row__icon {
    color: var(--color-accent, #b48a5a);
    opacity: 1;
  }
}
</style>
