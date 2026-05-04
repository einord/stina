<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityLogEntry } from '@stina/core'

/**
 * Inline activity log entry rendering per §02 / §05.
 *
 * Renders memory_change, auto_action, action_blocked, event_silenced and
 * related kinds with severity-driven visual weight (low → quiet grey one-
 * liner, medium → visible row with icon, high → accented row with border-
 * left, critical → strong border).
 */

const props = defineProps<{
  entry: ActivityLogEntry
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

const timestampLabel = computed(() =>
  new Date(props.entry.created_at).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  })
)
</script>

<template>
  <div
    class="ae"
    :class="[`ae--${entry.kind}`, `ae--severity-${entry.severity}`]"
    :title="`${label} · ${timestampLabel}`"
  >
    <span class="ae__icon" aria-hidden="true">{{ icon }}</span>
    <span class="ae__label">{{ label }}</span>
    <span class="ae__summary">{{ entry.summary }}</span>
    <span class="ae__time">{{ timestampLabel }}</span>
  </div>
</template>

<style scoped>
.ae {
  display: grid;
  grid-template-columns: 1.25rem auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 0.5rem 0.75rem;
  padding: 0.375rem 0.875rem;
  border-radius: 4px;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-muted, #6b6359);
  background: rgba(0, 0, 0, 0.015);
  align-self: stretch;
  margin: 0 1rem;

  > .ae__icon {
    color: var(--color-text-muted, #6b6359);
    opacity: 0.7;
  }

  > .ae__label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.7;
    white-space: nowrap;
  }

  > .ae__summary {
    color: var(--color-text, #2a2722);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > .ae__time {
    font-size: 0.7rem;
    opacity: 0.6;
    white-space: nowrap;
  }
}

/* Severity-driven visual weight per §05 severity table. */

.ae--severity-low {
  background: transparent;
  opacity: 0.7;

  > .ae__summary {
    color: var(--color-text-muted, #6b6359);
  }
}

.ae--severity-medium {
  background: rgba(0, 0, 0, 0.025);
}

.ae--severity-high {
  background: rgba(180, 138, 90, 0.08);
  border-left: 3px solid var(--color-accent, #b48a5a);
  padding-left: 0.625rem;

  > .ae__summary {
    color: var(--color-text, #2a2722);
    font-weight: 500;
  }
}

.ae--severity-critical {
  background: rgba(196, 115, 106, 0.1);
  border: 1px solid var(--color-accent-rose, #c4736a);
  border-left-width: 3px;
  padding: 0.5rem 0.875rem;

  > .ae__summary {
    color: var(--color-text, #2a2722);
    font-weight: 600;
  }
}

/* Per-kind tweaks where the §05 voice differs from severity alone. */

.ae--action_blocked {
  > .ae__icon {
    color: var(--color-accent-rose, #c4736a);
    opacity: 1;
  }
}

.ae--auto_action {
  > .ae__icon {
    color: var(--color-accent, #b48a5a);
    opacity: 1;
  }
}
</style>
