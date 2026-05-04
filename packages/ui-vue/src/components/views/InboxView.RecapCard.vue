<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Thread, Message } from '@stina/core'
import { useApi } from '../../composables/useApi.js'

/**
 * Special-case card for the daily recap thread per §05.
 *
 * Differences vs the normal ThreadCard:
 * - Full-width, taller layout with the amber accent.
 * - Larger title: Stina's morning greeting reads as a header.
 * - Renders the first stina-authored message inline so the user can read
 *   the briefing without opening the thread. On desktop the body is
 *   height-capped (~60vh) and fades to a "Show full recap" affordance
 *   when clipped; on `< 768 px` only a snippet (~120 chars) is shown.
 *
 * Briefing text is lazy-loaded on mount via `api.threads.listMessages`
 * — keeps the change contained to this component and avoids polluting
 * the shared `useThreads` state with a recap-specific fetch.
 *
 * Click still opens the thread normally; the parent owns the selection
 * mechanics via the `click` emit.
 */

const props = defineProps<{
  thread: Thread
  selected: boolean
}>()

const emit = defineEmits<{ (e: 'click'): void }>()

const api = useApi()

const briefingText = ref<string | null>(null)
const isLoadingBriefing = ref(false)

onMounted(async () => {
  isLoadingBriefing.value = true
  try {
    const messages: Message[] = await api.threads.listMessages(props.thread.id)
    // Find the first stina-authored message with text content. The recap
    // thread's first message is the morning briefing per the seed/runtime
    // contract (§05 Recap composition), but we defensively skip any
    // earlier non-stina messages and any stina messages without text.
    const first = messages.find(
      (m): m is Extract<Message, { author: 'stina' }> =>
        m.author === 'stina' && typeof m.content.text === 'string' && m.content.text.length > 0
    )
    briefingText.value = first?.content.text ?? null
  } catch {
    // Silent failure: the user can still click into the thread to read
    // the briefing. Nothing to surface in the card itself.
    briefingText.value = null
  } finally {
    isLoadingBriefing.value = false
  }
})

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

// Mobile snippet: first ~120 chars of the briefing, trailing ellipsis if
// truncated. Honors §05's "snippet-only on `< 768 px`".
const SNIPPET_MAX = 120
const briefingSnippet = computed(() => {
  const text = briefingText.value
  if (!text) return ''
  if (text.length <= SNIPPET_MAX) return text
  return `${text.slice(0, SNIPPET_MAX).trimEnd()}…`
})

const isUnread = computed(
  () => props.thread.status === 'active' && props.thread.surfaced_at !== null
)
</script>

<template>
  <button
    type="button"
    class="recap-card thread-card--accent-amber"
    :class="{ 'is-selected': selected, 'is-unread': isUnread }"
    @click="emit('click')"
  >
    <header class="recap-card__header">
      <span class="recap-card__icon" aria-hidden="true">✦</span>
      <span class="recap-card__title">{{ thread.title }}</span>
      <span class="recap-card__time">{{ lastActivityLabel }}</span>
    </header>

    <div class="recap-card__body">
      <p v-if="isLoadingBriefing && !briefingText" class="recap-card__placeholder">
        Laddar morgonbriefing…
      </p>

      <template v-else-if="briefingText">
        <!-- Desktop: full briefing with height cap -->
        <p class="recap-card__briefing recap-card__briefing--full">
          {{ briefingText }}
        </p>
        <!-- Mobile: snippet only -->
        <p class="recap-card__briefing recap-card__briefing--snippet">
          {{ briefingSnippet }}
        </p>
      </template>

      <p v-else class="recap-card__placeholder">Öppna tråden för att läsa briefingen.</p>
    </div>
  </button>
</template>

<style scoped>
.recap-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* Margin pulls the card in from both edges of the trådlista column;
   * box-sizing keeps `width: auto` (the default) honest with the border. */
  box-sizing: border-box;
  width: auto;
  margin: 0.5rem 0.75rem 0.75rem;
  padding: 1rem 1.125rem;
  border: 1px solid rgba(200, 154, 74, 0.35);
  border-left: 4px solid #c89a4a;
  border-radius: 8px;
  background: rgba(200, 154, 74, 0.06);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease;
  font-family: var(--font-body, system-ui, sans-serif);

  &:hover {
    background: rgba(200, 154, 74, 0.1);
    border-color: rgba(200, 154, 74, 0.5);
  }

  &.is-selected {
    background: rgba(200, 154, 74, 0.14);
    box-shadow: 0 0 0 1px rgba(200, 154, 74, 0.45) inset;
  }

  > .recap-card__header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.625rem;

    > .recap-card__icon {
      font-size: 1.05rem;
      color: #b48a4a;
      line-height: 1;
    }

    > .recap-card__title {
      font-size: 1.15rem;
      font-weight: 600;
      line-height: 1.25;
      color: var(--color-text, #2a2722);
      letter-spacing: -0.005em;
      /* Wrap the greeting; do NOT ellipsize — it reads as a header. */
      white-space: normal;
      overflow: visible;
    }

    > .recap-card__time {
      font-size: 0.75rem;
      color: var(--color-text-muted, #6b6359);
      white-space: nowrap;
    }
  }

  > .recap-card__body {
    /*
     * Desktop height cap per §05: ~60vh. The full briefing renders inside
     * a vertically-scrollable region, then a soft fade hints at clipped
     * content. Clicking the card opens the thread for the full view.
     */
    max-height: 60vh;
    overflow: hidden;
    position: relative;
    line-height: 1.55;

    > .recap-card__briefing {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.95rem;
      color: var(--color-text, #2a2722);
    }

    /* On desktop hide the snippet variant; on mobile flip the visibility. */
    > .recap-card__briefing--snippet {
      display: none;
    }

    > .recap-card__placeholder {
      margin: 0;
      font-size: 0.875rem;
      color: var(--color-text-muted, #6b6359);
      font-style: italic;
    }

    /* Soft fade at the bottom of the cap; cosmetic affordance for clipped
     * content. The full briefing is always available by clicking the
     * card, which opens the thread (per §05 "Show full recap"). */
    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2.25rem;
      pointer-events: none;
      background: linear-gradient(
        to bottom,
        rgba(250, 248, 243, 0) 0%,
        rgba(250, 248, 243, 0.85) 100%
      );
    }
  }
}

@media (max-width: 768px) {
  .recap-card {
    > .recap-card__body {
      /* Snippet-only on small screens per §05 — drop the height cap and
       * the fade since the snippet is short by construction. */
      max-height: none;

      &::after {
        display: none;
      }

      > .recap-card__briefing--full {
        display: none;
      }

      > .recap-card__briefing--snippet {
        display: block;
      }
    }
  }
}
</style>
