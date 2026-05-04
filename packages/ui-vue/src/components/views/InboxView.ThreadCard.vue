<script setup lang="ts">
import { computed } from 'vue'
import type { Thread, AppContent } from '@stina/core'

/**
 * A single thread card per §05.
 *
 * Renders title, last-activity time, snippet, and a trigger-kind icon.
 * Surfaced threads get a left-edge accent (the unread cue per §05); the
 * accent color is currently picked from the trigger kind as a v1 default
 * — extension-supplied ExtensionThreadHints will override this in a
 * follow-up commit.
 */

const props = defineProps<{
  thread: Thread
  selected: boolean
}>()

const emit = defineEmits<{ (e: 'click'): void }>()

const accentByTriggerKind: Record<string, string> = {
  user: 'graphite',
  mail: 'sky',
  calendar: 'olive',
  scheduled: 'sand',
  stina: 'amber',
}

const accent = computed(() => accentByTriggerKind[props.thread.trigger.kind] ?? 'graphite')

const iconByTriggerKind: Record<string, string> = {
  user: '✎',
  mail: '✉',
  calendar: '📅',
  scheduled: '⏰',
  stina: '✦',
}
const triggerIcon = computed(() => iconByTriggerKind[props.thread.trigger.kind] ?? '•')

const isUnread = computed(() => props.thread.status === 'active' && props.thread.surfaced_at !== null)

const lastActivityLabel = computed(() => {
  const ts = props.thread.last_activity_at
  const now = Date.now()
  const diff = now - ts
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return 'just nu'
  if (diff < hour) return `${Math.floor(diff / minute)} min`
  if (diff < day) return `${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `${Math.floor(diff / day)} d`
  return new Date(ts).toLocaleDateString('sv-SE')
})

/**
 * Best-effort snippet derived from the trigger payload. For mail/calendar
 * it picks a payload field; for user/stina threads it falls back to the
 * thread summary. Real extension-supplied snippets land later.
 */
const snippet = computed(() => {
  const t = props.thread
  if (t.summary) return t.summary
  // Trigger-kind specific defaults that read like a card preview:
  switch (t.trigger.kind) {
    case 'mail':
      return `Mail från ${(t.trigger as { mail_id: string }).mail_id ?? '–'}`
    case 'calendar':
      return 'Kalenderhändelse'
    case 'scheduled':
      return 'Schemalagt jobb'
    case 'stina':
      return 'Stina öppnade tråden'
    default:
      return ''
  }
})

// AppContent is referenced as a type only for the snippet override pattern
// we'll add later; suppress unused-import lint.
type _AppContent = AppContent
</script>

<template>
  <button
    type="button"
    class="thread-card"
    :class="[
      `thread-card--accent-${accent}`,
      {
        'is-selected': selected,
        'is-unread': isUnread,
      },
    ]"
    @click="emit('click')"
  >
    <span class="thread-card__icon" aria-hidden="true">{{ triggerIcon }}</span>
    <span class="thread-card__body">
      <span class="thread-card__title">{{ thread.title }}</span>
      <span v-if="snippet" class="thread-card__snippet">{{ snippet }}</span>
    </span>
    <span class="thread-card__time">{{ lastActivityLabel }}</span>
  </button>
</template>

<style scoped>
.thread-card {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.5rem 0.75rem;
  width: 100%;
  padding: 0.625rem 1.25rem 0.625rem 1rem;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 100ms ease;

  &:hover {
    background: rgba(0, 0, 0, 0.025);
  }

  &.is-selected {
    background: rgba(180, 138, 90, 0.08);
  }

  &.is-unread {
    > .thread-card__title {
      font-weight: 600;
    }
  }

  /*
   * Accent palette per §05. Light values only for v1; dark-mode pairs land
   * with the theme work in a follow-up commit.
   */
  &.thread-card--accent-sand    { border-left-color: #d8c8a4; }
  &.thread-card--accent-olive   { border-left-color: #a3b08d; }
  &.thread-card--accent-rose    { border-left-color: #c4736a; }
  &.thread-card--accent-sky     { border-left-color: #8aa9bf; }
  &.thread-card--accent-plum    { border-left-color: #9c7898; }
  &.thread-card--accent-graphite { border-left-color: #8a8480; }
  &.thread-card--accent-amber   { border-left-color: #c89a4a; }

  > .thread-card__icon {
    font-size: 1rem;
    color: var(--color-text-muted, #6b6359);
    line-height: 1.5;
  }

  > .thread-card__body {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;

    > .thread-card__title {
      font-size: 0.95rem;
      line-height: 1.3;
      color: var(--color-text, #2a2722);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > .thread-card__snippet {
      font-size: 0.825rem;
      color: var(--color-text-muted, #6b6359);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  > .thread-card__time {
    font-size: 0.75rem;
    color: var(--color-text-muted, #6b6359);
    white-space: nowrap;
    padding-top: 0.125rem;
  }
}
</style>
