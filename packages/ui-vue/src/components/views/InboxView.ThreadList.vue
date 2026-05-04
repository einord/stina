<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Thread } from '@stina/core'
import InboxViewThreadCard from './InboxView.ThreadCard.vue'

/**
 * Trådlistan — left column of the InboxView.
 *
 * Renders the four §05 segments. Includes a small composer at the bottom for
 * starting a new user-triggered thread. The "Silently handled" segment is
 * collapsed by default and shows the audit-cue counter per §05.
 */

interface Segments {
  active: Thread[]
  quiet: Thread[]
  silentlyHandled: Thread[]
  archived: Thread[]
}

const props = defineProps<{
  segments: Segments
  silentlyHandledCount: number
  selectedId: string | null
  isLoading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'send-new', text: string): void
}>()

// Segment expansion state. Defaults per §05:
// Active + Quiet expanded; Silently handled + Archived collapsed.
const expandedActive = ref(true)
const expandedQuiet = ref(true)
const expandedSilentlyHandled = ref(false)
const expandedArchived = ref(false)

// Local "since last visit" counter — clears when the user expands the segment.
// (v1 keeps it ephemeral per-mount; persistence per §05 lands in a follow-up.)
const silentlyHandledShown = ref(false)
const silentlyHandledCounterDisplay = computed(() =>
  silentlyHandledShown.value ? props.segments.silentlyHandled.length : props.silentlyHandledCount
)

function toggleSilentlyHandled(): void {
  if (!silentlyHandledShown.value) {
    silentlyHandledShown.value = true
  }
  expandedSilentlyHandled.value = !expandedSilentlyHandled.value
}

const composerText = ref('')
function submitComposer(e: Event): void {
  e.preventDefault()
  const text = composerText.value.trim()
  if (!text) return
  emit('send-new', text)
  composerText.value = ''
}

function isEmpty(): boolean {
  return (
    props.segments.active.length === 0 &&
    props.segments.quiet.length === 0 &&
    props.segments.silentlyHandled.length === 0 &&
    props.segments.archived.length === 0
  )
}
</script>

<template>
  <div class="thread-list">
    <header class="thread-list__header">
      <h1>Inkorgen</h1>
    </header>

    <div v-if="error" class="thread-list__error" role="alert">{{ error }}</div>

    <div v-if="isLoading && segments.active.length === 0" class="thread-list__loading">
      Laddar…
    </div>

    <div v-else-if="isEmpty()" class="thread-list__empty">
      <p>Inkorgen är tom.</p>
      <p class="thread-list__empty-hint">Skriv något här nedan för att starta en konversation.</p>
    </div>

    <div v-else class="thread-list__segments">
      <!-- Active -->
      <section class="thread-list__segment">
        <button
          type="button"
          class="thread-list__segment-header"
          :aria-expanded="expandedActive"
          @click="expandedActive = !expandedActive"
        >
          <span class="thread-list__segment-chevron" :class="{ 'is-expanded': expandedActive }">
            ▸
          </span>
          <span class="thread-list__segment-label">Aktiva</span>
          <span class="thread-list__segment-count">{{ segments.active.length }}</span>
        </button>
        <ul v-if="expandedActive" class="thread-list__cards">
          <li v-for="thread in segments.active" :key="thread.id">
            <InboxViewThreadCard
              :thread="thread"
              :selected="thread.id === selectedId"
              @click="emit('select', thread.id)"
            />
          </li>
        </ul>
      </section>

      <!-- Quiet -->
      <section v-if="segments.quiet.length > 0" class="thread-list__segment">
        <button
          type="button"
          class="thread-list__segment-header"
          :aria-expanded="expandedQuiet"
          @click="expandedQuiet = !expandedQuiet"
        >
          <span class="thread-list__segment-chevron" :class="{ 'is-expanded': expandedQuiet }">
            ▸
          </span>
          <span class="thread-list__segment-label">Lugna</span>
          <span class="thread-list__segment-count">{{ segments.quiet.length }}</span>
        </button>
        <ul v-if="expandedQuiet" class="thread-list__cards">
          <li v-for="thread in segments.quiet" :key="thread.id">
            <InboxViewThreadCard
              :thread="thread"
              :selected="thread.id === selectedId"
              @click="emit('select', thread.id)"
            />
          </li>
        </ul>
      </section>

      <!-- Silently handled -->
      <section v-if="segments.silentlyHandled.length > 0" class="thread-list__segment">
        <button
          type="button"
          class="thread-list__segment-header thread-list__segment-header--muted"
          :aria-expanded="expandedSilentlyHandled"
          @click="toggleSilentlyHandled"
        >
          <span
            class="thread-list__segment-chevron"
            :class="{ 'is-expanded': expandedSilentlyHandled }"
          >
            ▸
          </span>
          <span class="thread-list__segment-label">Hanterat tyst</span>
          <span class="thread-list__segment-count">{{ silentlyHandledCounterDisplay }}</span>
        </button>
        <ul v-if="expandedSilentlyHandled" class="thread-list__cards">
          <li v-for="thread in segments.silentlyHandled" :key="thread.id">
            <InboxViewThreadCard
              :thread="thread"
              :selected="thread.id === selectedId"
              @click="emit('select', thread.id)"
            />
          </li>
        </ul>
      </section>

      <!-- Archived -->
      <section v-if="segments.archived.length > 0" class="thread-list__segment">
        <button
          type="button"
          class="thread-list__segment-header thread-list__segment-header--muted"
          :aria-expanded="expandedArchived"
          @click="expandedArchived = !expandedArchived"
        >
          <span class="thread-list__segment-chevron" :class="{ 'is-expanded': expandedArchived }">
            ▸
          </span>
          <span class="thread-list__segment-label">Arkiverat</span>
          <span class="thread-list__segment-count">{{ segments.archived.length }}</span>
        </button>
        <ul v-if="expandedArchived" class="thread-list__cards">
          <li v-for="thread in segments.archived" :key="thread.id">
            <InboxViewThreadCard
              :thread="thread"
              :selected="thread.id === selectedId"
              @click="emit('select', thread.id)"
            />
          </li>
        </ul>
      </section>
    </div>

    <form class="thread-list__composer" @submit="submitComposer">
      <input
        v-model="composerText"
        type="text"
        placeholder="Skriv till Stina…"
        autocomplete="off"
        class="thread-list__composer-input"
      />
    </form>
  </div>
</template>

<style scoped>
.thread-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--font-body, system-ui, sans-serif);

  > .thread-list__header {
    padding: 1.25rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.06));

    > h1 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--color-text-muted, #6b6359);
      text-transform: uppercase;
    }
  }

  > .thread-list__error {
    margin: 0.75rem 1.25rem;
    padding: 0.75rem;
    border-left: 3px solid var(--color-accent-rose, #c4736a);
    background: rgba(196, 115, 106, 0.08);
    border-radius: 0 4px 4px 0;
    font-size: 0.875rem;
  }

  > .thread-list__loading,
  > .thread-list__empty {
    padding: 2rem 1.25rem;
    color: var(--color-text-muted, #6b6359);
    text-align: center;

    > .thread-list__empty-hint {
      font-size: 0.875rem;
      margin-top: 0.5rem;
      opacity: 0.7;
    }
  }

  > .thread-list__segments {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 0.5rem 0;
  }

  > .thread-list__composer {
    border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    padding: 0.75rem 1rem;
    background: var(--color-surface-elevated, #fdfcf8);

    > .thread-list__composer-input {
      width: 100%;
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
      border-radius: 6px;
      font: inherit;
      background: var(--color-input-bg, #fff);
      color: inherit;

      &:focus {
        outline: none;
        border-color: var(--color-accent, #b48a5a);
      }
    }
  }
}

.thread-list__segment {
  margin-bottom: 0.25rem;

  > .thread-list__segment-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1.25rem;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #6b6359);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;

    &:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    &.thread-list__segment-header--muted {
      opacity: 0.7;
    }

    > .thread-list__segment-chevron {
      display: inline-block;
      transition: transform 120ms ease;
      font-size: 0.7rem;

      &.is-expanded {
        transform: rotate(90deg);
      }
    }

    > .thread-list__segment-label {
      flex: 1;
    }

    > .thread-list__segment-count {
      font-weight: 500;
      opacity: 0.7;
      font-size: 0.75rem;
    }
  }

  > .thread-list__cards {
    list-style: none;
    padding: 0;
    margin: 0;
  }
}
</style>
