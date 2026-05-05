<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useThreads } from '../../composables/useThreads.js'
import InboxViewThreadList from './InboxView.ThreadList.vue'
import InboxViewThreadDetail from './InboxView.ThreadDetail.vue'

/**
 * Redesign-2026 inbox view (per docs/redesign-2026/05-ui-ux.md).
 *
 * Two-column layout: threadlist on the left, opened thread on the right.
 * The extension widgets panel and the ☰ menu are owned by AppShell — this
 * view fills the center column.
 */

const inbox = useThreads()

onMounted(() => {
  void inbox.loadThreads()
})

async function handleSelect(id: string): Promise<void> {
  await inbox.selectThread(id)
}

async function handleSendNew(text: string): Promise<void> {
  if (!text.trim()) return
  await inbox.createUserThread(text)
}

async function handleReply(text: string): Promise<void> {
  if (!text.trim()) return
  await inbox.replyToSelected(text)
}

/**
 * Show the streaming draft only when its threadId matches the currently
 * selected thread — protects against rendering the in-flight Stina reply
 * inside a different thread the user just navigated to.
 */
const streamingDraftTextForSelected = computed<string | null>(() => {
  const draft = inbox.streamingDraft.value
  if (!draft) return null
  if (draft.threadId !== inbox.selectedId.value) return null
  return draft.text
})

const streamingDraftToolsForSelected = computed(() => {
  const draft = inbox.streamingDraft.value
  if (!draft) return []
  if (draft.threadId !== inbox.selectedId.value) return []
  return draft.tools
})
</script>

<template>
  <div class="inbox-view">
    <aside class="inbox-view__list">
      <InboxViewThreadList
        :segments="inbox.segments.value"
        :silently-handled-count="inbox.silentlyHandledCount.value"
        :selected-id="inbox.selectedId.value"
        :is-loading="inbox.isLoading.value"
        :error="inbox.error.value"
        @select="handleSelect"
        @send-new="handleSendNew"
      />
    </aside>
    <main class="inbox-view__detail">
      <InboxViewThreadDetail
        :thread="inbox.selectedThread.value"
        :timeline="inbox.timeline.value"
        :is-loading="inbox.isLoadingMessages.value"
        :streaming-draft-text="streamingDraftTextForSelected"
        :streaming-draft-tools="streamingDraftToolsForSelected"
        @reply="handleReply"
      />
    </main>
  </div>
</template>

<style scoped>
.inbox-view {
  display: grid;
  grid-template-columns: minmax(280px, 32%) minmax(0, 1fr);
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--color-surface, #faf8f3);
  color: var(--color-text, #2a2722);

  > .inbox-view__list {
    border-right: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    overflow-y: auto;
    min-height: 0;
  }

  > .inbox-view__detail {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
}

@media (max-width: 768px) {
  .inbox-view {
    grid-template-columns: 1fr;

    > .inbox-view__list {
      border-right: none;
      border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
    }
  }
}
</style>
