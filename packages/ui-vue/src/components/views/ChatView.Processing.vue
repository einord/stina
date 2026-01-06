<script setup lang="ts">
import { computed, inject } from 'vue'
import IconToggleButton from '../buttons/IconToggleButton.vue'
import type { useChat } from './ChatView.service.js'

const chat = inject<ReturnType<typeof useChat>>('chat')!
if (!chat) {
  throw new Error('ChatView.Processing: chat not provided')
}

const queuedItems = computed(() => chat.queuedItems.value)
const showQueue = computed(() => queuedItems.value.length > 0)
const showThinking = computed(() => chat.isQueueProcessing.value || chat.isStreaming.value)
const showProcessing = computed(
  () => showThinking.value || showQueue.value
)

async function removeQueued(id: string) {
  await chat.removeQueued(id)
}
</script>

<template>
  <div v-if="showProcessing" class="chat-view-processing">
    <div v-if="showThinking" class="thinking">
      <span class="pulse" aria-hidden="true"></span>
      <span>{{ $t('chat.thinking') }}</span>
    </div>
    <div v-if="showQueue" class="queued">
      <span class="label">{{ $t('chat.in_queue') }}</span>
      <ul>
        <li v-for="item in queuedItems" :key="item.id">
          <span class="preview">{{ item.preview }}</span>
          <IconToggleButton
            :tooltip="$t('chat.remove_from_queue')"
            icon="cancel-01"
            @click="removeQueued(item.id)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.chat-view-processing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1.5rem 0.5rem 1.5rem;
  color: var(--muted);
  font-size: 0.9rem;

  > .thinking {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;

    > .pulse {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent);
      display: inline-block;
      animation: pulse 1s ease-in-out infinite;
    }
  }

  > .queued {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.85rem;

    > .label {
      font-weight: 600;
      color: var(--text);
    }

    > ul {
      display: inline-flex;
      gap: 0.4rem;
      padding: 0;
      margin: 0;
      list-style: none;

      > li {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.6rem;
        border-radius: 999px;
        background: var(--selected-bg);
        border: 1px solid var(--border);
        color: var(--text);

        > .preview {
          max-width: 18ch;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 0.85rem;
        }

        > .remove {
          border: none;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 0;
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;

          &:hover {
            color: var(--text);
          }
        }
      }
    }
  }
}
</style>
