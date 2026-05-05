<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Thread } from '@stina/core'
import type { TimelineItem, StreamingToolCall } from '../../composables/useThreads.js'
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
  /**
   * In-flight Stina reply text, populated as content_delta events arrive.
   * `null` when no turn is streaming for this thread. Rendered as a
   * placeholder card after the persisted timeline.
   */
  streamingDraftText?: string | null
  /**
   * Tool calls observed during the in-flight turn, oldest-first. Each
   * entry's status flips from `running` → `done` (or `error`) when the
   * matching tool_end arrives.
   */
  streamingDraftTools?: StreamingToolCall[]
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

watch(
  () => props.streamingDraftText,
  () => {
    nextTick(() => {
      const el = messageListEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)

const isStreaming = computed(() => props.streamingDraftText !== null && props.streamingDraftText !== undefined)

const streamingTools = computed<StreamingToolCall[]>(() => props.streamingDraftTools ?? [])

function toolStatusLabel(status: StreamingToolCall['status']): string {
  if (status === 'running') return 'Använder verktyg'
  if (status === 'error') return 'Misslyckades'
  if (status === 'blocked') return 'Blockerat'
  return 'Klart'
}

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

        <!--
          In-flight Stina reply. The composable holds the live text in
          `streamingDraft.text`; when it's null, no turn is running and
          this card is hidden. Empty text (model hasn't sent its first
          chunk yet) renders the pulsing-dot placeholder.
        -->
        <div v-if="isStreaming" class="thread-detail__streaming-card" aria-live="polite">
          <div class="thread-detail__streaming-author">Stina</div>
          <ul v-if="streamingTools.length > 0" class="thread-detail__streaming-tools">
            <li
              v-for="tool in streamingTools"
              :key="tool.id"
              :class="[
                'thread-detail__streaming-tool',
                `is-${tool.status}`,
                `severity-${tool.severity}`,
              ]"
            >
              <span class="thread-detail__streaming-tool-icon" aria-hidden="true">{{
                tool.status === 'done' ? '✓' : tool.status === 'error' ? '✕' : tool.status === 'blocked' ? '🚫' : '⚙'
              }}</span>
              <span class="thread-detail__streaming-tool-label"
                >{{ toolStatusLabel(tool.status) }}: <code>{{ tool.name }}</code></span
              >
            </li>
          </ul>
          <div v-if="streamingDraftText" class="thread-detail__streaming-text">
            {{ streamingDraftText
            }}<span class="thread-detail__streaming-cursor" aria-hidden="true">▍</span>
          </div>
          <div
            v-else-if="streamingTools.length === 0"
            class="thread-detail__streaming-typing"
            aria-label="Stina skriver"
          >
            <span></span><span></span><span></span>
          </div>
        </div>
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

    > .thread-detail__streaming-card {
      align-self: flex-start;
      max-width: 80%;
      background: var(--color-surface-elevated, #fdfcf8);
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      border-radius: 8px;
      padding: 0.75rem 0.875rem;
      color: var(--color-text-muted, #6b6359);
      opacity: 0.95;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);

      > .thread-detail__streaming-author {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted, #6b6359);
        margin-bottom: 0.25rem;
      }

      > .thread-detail__streaming-text {
        white-space: pre-wrap;
        color: var(--color-text, #2a2722);

        > .thread-detail__streaming-cursor {
          display: inline-block;
          margin-left: 1px;
          color: var(--color-accent, #b48a5a);
          animation: thread-detail-streaming-blink 1s steps(1) infinite;
        }
      }

      > .thread-detail__streaming-tools {
        list-style: none;
        margin: 0 0 0.5rem;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        > .thread-detail__streaming-tool {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--color-text-muted, #6b6359);

          > .thread-detail__streaming-tool-icon {
            display: inline-block;
            width: 1rem;
            text-align: center;
            font-weight: 600;
          }

          > .thread-detail__streaming-tool-label > code {
            background: rgba(0, 0, 0, 0.04);
            padding: 0.05rem 0.25rem;
            border-radius: 3px;
            font-size: 0.85em;
          }

          &.is-running > .thread-detail__streaming-tool-icon {
            animation: thread-detail-streaming-spin 1.5s linear infinite;
            color: var(--color-accent, #b48a5a);
          }
          &.is-done > .thread-detail__streaming-tool-icon {
            color: var(--color-success, #4a7c4a);
          }
          &.is-error > .thread-detail__streaming-tool-icon {
            color: var(--color-error, #c34a4a);
          }
          &.is-blocked {
            opacity: 0.85;
            > .thread-detail__streaming-tool-icon {
              color: var(--color-accent-rose, #c4736a);
            }
            > .thread-detail__streaming-tool-label {
              color: var(--color-text-muted, #6b6359);
              font-style: italic;
            }
          }

          /* Severity-driven visual weight per §05, mirroring the pattern
             in InboxView.ActivityEntry.vue. low = quiet, medium = baseline
             (the existing look), high = accented border-left, critical =
             full rose border. */
          &.severity-low {
            opacity: 0.7;

            > .thread-detail__streaming-tool-label {
              color: var(--color-text-muted, #6b6359);
            }
          }

          &.severity-high {
            background: rgba(180, 138, 90, 0.08);
            border-left: 3px solid var(--color-accent, #b48a5a);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;

            > .thread-detail__streaming-tool-label {
              color: var(--color-text, #2a2722);
              font-weight: 500;
            }
          }

          &.severity-critical {
            background: rgba(196, 115, 106, 0.1);
            border: 1px solid var(--color-accent-rose, #c4736a);
            border-left-width: 3px;
            padding: 0.375rem 0.625rem;
            border-radius: 4px;

            > .thread-detail__streaming-tool-label {
              color: var(--color-text, #2a2722);
              font-weight: 600;
            }
          }
        }
      }

      > .thread-detail__streaming-typing {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        height: 1.25em;

        > span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-text-muted, #6b6359);
          opacity: 0.5;
          animation: thread-detail-streaming-pulse 1.2s ease-in-out infinite;
        }
        > span:nth-child(2) {
          animation-delay: 0.15s;
        }
        > span:nth-child(3) {
          animation-delay: 0.3s;
        }
      }
    }
  }

  @keyframes thread-detail-streaming-blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }

  @keyframes thread-detail-streaming-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes thread-detail-streaming-pulse {
    0%,
    100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    50% {
      transform: translateY(-3px);
      opacity: 1;
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
