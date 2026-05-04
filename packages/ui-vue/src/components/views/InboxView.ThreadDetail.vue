<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Thread } from '@stina/core'
import type { TimelineItem } from '../../composables/useThreads.js'
import InboxViewMessage from './InboxView.Message.vue'
import InboxViewActivityEntry from './InboxView.ActivityEntry.vue'

/**
 * Thread detail (right column) — opened thread with messages and reply
 * composer per §05. The composer maps to either the new-thread create or
 * the reply-to-selected-thread API depending on whether a thread is
 * currently selected; this component handles only the reply case (the
 * trådlistan owns the new-thread composer).
 */

const props = defineProps<{
  thread: Thread | null
  timeline: TimelineItem[]
  isLoading: boolean
}>()

const emit = defineEmits<{ (e: 'reply', text: string): void }>()

const replyText = ref('')

const messageListEl = ref<HTMLElement | null>(null)

watch(
  () => props.timeline.length,
  () => {
    nextTick(() => {
      const el = messageListEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)

function submitReply(e: Event): void {
  e.preventDefault()
  const text = replyText.value.trim()
  if (!text) return
  emit('reply', text)
  replyText.value = ''
}

const canReply = computed(() => props.thread !== null && props.thread.status !== 'archived')

const triggerKindLabels: Record<string, string> = {
  user: 'Du startade tråden',
  mail: 'Mail-tråd',
  calendar: 'Kalenderhändelse',
  scheduled: 'Schemalagt jobb',
  stina: 'Stina öppnade',
}
const triggerLabel = computed(() => {
  if (!props.thread) return ''
  return triggerKindLabels[props.thread.trigger.kind] ?? ''
})
</script>

<template>
  <div class="thread-detail">
    <div v-if="!thread" class="thread-detail__placeholder">
      <p>Välj en tråd till vänster, eller börja en ny konversation med Stina.</p>
    </div>

    <template v-else>
      <header class="thread-detail__header">
        <h2 class="thread-detail__title">{{ thread.title }}</h2>
        <p v-if="triggerLabel" class="thread-detail__subtitle">{{ triggerLabel }}</p>
      </header>

      <div ref="messageListEl" class="thread-detail__messages">
        <p v-if="isLoading" class="thread-detail__loading">Laddar meddelanden…</p>
        <p v-else-if="timeline.length === 0" class="thread-detail__empty">
          Inga meddelanden än.
        </p>
        <template v-for="item in timeline" :key="`${item.kind}-${item.data.id}`">
          <InboxViewMessage v-if="item.kind === 'message'" :message="item.data" />
          <InboxViewActivityEntry v-else :entry="item.data" />
        </template>
      </div>

      <form class="thread-detail__composer" @submit="submitReply">
        <textarea
          v-model="replyText"
          :placeholder="canReply ? 'Skriv ett svar…' : 'Den här tråden är arkiverad'"
          :disabled="!canReply"
          class="thread-detail__composer-input"
          rows="2"
          @keydown.enter.exact.prevent="submitReply"
        />
      </form>
    </template>
  </div>
</template>

<style scoped>
.thread-detail {
  display: flex;
  flex-direction: column;
  height: 100%;

  > .thread-detail__placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--color-text-muted, #6b6359);
    text-align: center;
  }

  > .thread-detail__header {
    padding: 1.25rem 1.75rem 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.06));

    > .thread-detail__title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: var(--color-text, #2a2722);
    }

    > .thread-detail__subtitle {
      margin: 0.25rem 0 0;
      font-size: 0.8rem;
      color: var(--color-text-muted, #6b6359);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  }

  > .thread-detail__messages {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.75rem;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;

    > .thread-detail__loading,
    > .thread-detail__empty {
      color: var(--color-text-muted, #6b6359);
      text-align: center;
      padding: 1rem;
    }
  }

  > .thread-detail__composer {
    border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    padding: 0.875rem 1.25rem;
    background: var(--color-surface-elevated, #fdfcf8);

    > .thread-detail__composer-input {
      width: 100%;
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
      border-radius: 6px;
      font: inherit;
      resize: vertical;
      min-height: 2.5rem;
      background: var(--color-input-bg, #fff);
      color: inherit;

      &:focus {
        outline: none;
        border-color: var(--color-accent, #b48a5a);
      }

      &:disabled {
        background: rgba(0, 0, 0, 0.03);
        cursor: not-allowed;
      }
    }
  }
}
</style>
