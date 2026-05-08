<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityLogEntry, Thread } from '@stina/core'

/**
 * Inspector pane for the activity log view (§05 §"Activity log (under the
 * menu)" → Inspector). Shows the full audit detail of a single entry: kind,
 * severity, source thread (clickable), retention, summary, and the raw
 * `details` payload formatted as JSON.
 *
 * v1 does not include undo/recreate affordances — those land in a follow-up
 * once the §06 collision-handling runtime exists. The thread link is a
 * lightweight hand-off that the surrounding view turns into navigation.
 */

const props = defineProps<{
  entry: ActivityLogEntry | null
  threadById: Map<string, Thread>
}>()

const emit = defineEmits<{
  (e: 'open-thread', threadId: string): void
}>()

const fullTimestamp = computed(() => {
  if (!props.entry) return ''
  return new Date(props.entry.created_at).toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const sourceThread = computed<Thread | null>(() => {
  if (!props.entry?.thread_id) return null
  return props.threadById.get(props.entry.thread_id) ?? null
})

const detailsJson = computed(() => {
  if (!props.entry) return ''
  return JSON.stringify(props.entry.details, null, 2)
})

function openThread(): void {
  if (props.entry?.thread_id) {
    emit('open-thread', props.entry.thread_id)
  }
}
</script>

<template>
  <aside class="inspector">
    <div v-if="!entry" class="inspector__empty">
      Välj en post för att se detaljer.
    </div>
    <div v-else class="inspector__content">
      <header class="inspector__header">
        <h3 class="inspector__title">{{ entry.summary }}</h3>
        <button
          type="button"
          class="inspector__close"
          aria-label="Stäng inspektor"
          @click="$emit('open-thread', '')"
        ></button>
      </header>

      <dl class="inspector__meta">
        <div class="inspector__row">
          <dt>Typ</dt>
          <dd>{{ entry.kind }}</dd>
        </div>
        <div class="inspector__row">
          <dt>Allvarlighet</dt>
          <dd :class="`severity severity--${entry.severity}`">{{ entry.severity }}</dd>
        </div>
        <div class="inspector__row">
          <dt>Tidpunkt</dt>
          <dd>{{ fullTimestamp }}</dd>
        </div>
        <div class="inspector__row">
          <dt>Källtråd</dt>
          <dd>
            <button
              v-if="entry.thread_id"
              type="button"
              class="inspector__thread-link"
              @click="openThread"
            >
              {{ sourceThread?.title ?? entry.thread_id }}
            </button>
            <span v-else class="inspector__muted">Ingen tråd</span>
          </dd>
        </div>
        <div class="inspector__row">
          <dt>Behållningstid</dt>
          <dd>{{ entry.retention_days }} dagar</dd>
        </div>
        <div class="inspector__row">
          <dt>ID</dt>
          <dd class="inspector__mono">{{ entry.id }}</dd>
        </div>
      </dl>

      <section class="inspector__details">
        <h4>Detaljer</h4>
        <pre class="inspector__json">{{ detailsJson }}</pre>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface-alt, #f5f1e9);
  border-left: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
  overflow-y: auto;
  padding: 1rem 1.25rem;
  color: var(--color-text, #2a2722);

  > .inspector__empty {
    margin: auto;
    color: var(--color-text-muted, #6b6359);
    font-size: 0.9rem;
    text-align: center;
  }

  > .inspector__content {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > .inspector__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;

      > .inspector__title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.3;
      }
    }
  }
}

.inspector__meta {
  margin: 0;
  display: grid;
  gap: 0.5rem;

  > .inspector__row {
    display: grid;
    grid-template-columns: 9rem 1fr;
    gap: 0.75rem;
    align-items: baseline;
    font-size: 0.85rem;

    > dt {
      color: var(--color-text-muted, #6b6359);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    > dd {
      margin: 0;
      color: var(--color-text, #2a2722);
      word-break: break-word;
    }
  }
}

.inspector__thread-link {
  all: unset;
  cursor: pointer;
  color: var(--color-accent, #b48a5a);
  text-decoration: underline;
  text-underline-offset: 0.2em;

  &:hover {
    color: var(--color-text, #2a2722);
  }
}

.inspector__muted {
  color: var(--color-text-muted, #6b6359);
}

.inspector__mono {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.78rem;
}

.inspector__details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  > h4 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted, #6b6359);
  }

  > .inspector__json {
    margin: 0;
    padding: 0.75rem;
    background: var(--color-surface, #faf8f3);
    border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    border-radius: 4px;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.78rem;
    line-height: 1.45;
    overflow-x: auto;
    white-space: pre;
    color: var(--color-text, #2a2722);
  }
}

.severity {
  font-weight: 500;
}
.severity--low {
  color: var(--color-text-muted, #6b6359);
}
.severity--medium {
  color: var(--color-text, #2a2722);
}
.severity--high {
  color: var(--color-accent, #b48a5a);
}
.severity--critical {
  color: var(--color-accent-rose, #c4736a);
  font-weight: 600;
}
</style>
