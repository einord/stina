<script setup lang="ts">
import { inject, ref, onMounted, onUnmounted, nextTick } from 'vue'
import ChatViewMessagesInfo from './ChatView.Messages.Info.vue'
import ChatViewMessagesInstruction from './ChatView.Messages.Instruction.vue'
import ChatViewMessagesStina from './ChatView.Messages.Stina.vue'
import ChatViewMessagesThinking from './ChatView.Messages.Thinking.vue'
import ChatViewMessagesTools from './ChatView.Messages.Tools.vue'
import ChatViewMessagesUser from './ChatView.Messages.User.vue'
import type { useChat } from './ChatView.service.js'
import type { Message } from '@stina/chat'

const chat = inject<ReturnType<typeof useChat>>('chat')!
if (!chat) {
  throw new Error('ChatView.Messages: chat not provided')
}

// Refs for scroll handling
const messagesContainer = ref<HTMLElement | null>(null)
const loadMoreTrigger = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

// Helper to get tool names from tools message
function getToolNames(message: Message): string[] {
  if (message.type !== 'tools') return []
  return message.tools.map((t) => t.name)
}

// Load more when scrolling to top
async function handleLoadMore() {
  if (!chat.hasMoreInteractions.value || chat.isLoadingMore.value) return

  // Save current scroll position from bottom
  const container = messagesContainer.value
  if (!container) return

  const scrollHeightBefore = container.scrollHeight
  const scrollTopBefore = container.scrollTop

  // Load more interactions
  await chat.loadMoreInteractions()

  // Wait for DOM update
  await nextTick()

  // Restore scroll position (maintain distance from bottom)
  const scrollHeightAfter = container.scrollHeight
  const scrollHeightDiff = scrollHeightAfter - scrollHeightBefore
  container.scrollTop = scrollTopBefore + scrollHeightDiff
}

// Setup intersection observer
onMounted(() => {
  if (!loadMoreTrigger.value) return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          handleLoadMore()
        }
      })
    },
    {
      root: messagesContainer.value,
      threshold: 0.1,
    }
  )

  observer.observe(loadMoreTrigger.value)
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<template>
  <div ref="messagesContainer" class="chat-view-messages">
    <!-- Load more trigger (invisible element at top) -->
    <div
      v-if="chat.hasMoreInteractions.value"
      ref="loadMoreTrigger"
      class="load-more-trigger"
    ></div>

    <!-- Loading indicator -->
    <div v-if="chat.isLoadingMore.value" class="loading-more">Loading older messages...</div>

    <div class="empty"></div>

    <!-- Render all loaded interactions -->
    <div v-for="interaction in chat.interactions.value" :key="interaction.id" class="interaction">
      <!-- Information messages (shown first) -->
      <ChatViewMessagesInfo
        v-for="(info, idx) in interaction.informationMessages"
        :key="`info-${interaction.id}-${idx}`"
        :message="info.text"
      />
      <div class="inside">
        <!-- Regular messages -->
        <template
          v-for="(message, idx) in interaction.messages"
          :key="`msg-${interaction.id}-${idx}`"
        >
          <ChatViewMessagesInstruction
            v-if="message.type === 'instruction'"
            :message="message.text"
          />
          <ChatViewMessagesUser v-else-if="message.type === 'user'" :message="message.text" />
          <ChatViewMessagesThinking
            v-else-if="message.type === 'thinking'"
            :message="message.text"
          />
          <ChatViewMessagesTools
            v-else-if="message.type === 'tools'"
            :tool-usages="getToolNames(message)"
          />
          <ChatViewMessagesStina v-else-if="message.type === 'stina'" :message="message.text" />
        </template>
      </div>
    </div>

    <!-- Current (streaming) interaction -->
    <div v-if="chat.currentInteraction.value" class="interaction">
      <ChatViewMessagesInfo
        v-for="(info, idx) in chat.informationMessages.value"
        :key="`info-current-${idx}`"
        :message="info.text"
      />
      <div class="inside">
        <template v-for="(message, idx) in chat.messages.value" :key="`msg-current-${idx}`">
          <ChatViewMessagesInstruction
            v-if="message.type === 'instruction'"
            :message="message.text"
          />
          <ChatViewMessagesUser v-else-if="message.type === 'user'" :message="message.text" />
          <ChatViewMessagesThinking
            v-else-if="message.type === 'thinking'"
            :message="message.text"
          />
          <ChatViewMessagesTools
            v-else-if="message.type === 'tools'"
            :tool-usages="getToolNames(message)"
          />
          <ChatViewMessagesStina v-else-if="message.type === 'stina'" :message="message.text" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-view-messages {
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: 1em;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
  padding: 1rem;
  font-size: 1rem;

  > .load-more-trigger {
    height: 1px;
    min-height: 1px;
    width: 100%;
  }

  > .loading-more {
    text-align: center;
    padding: 0.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  > .empty {
    height: 1.5rem;
    min-height: 1.5rem;
    width: 100%;
  }

  > .interaction {
    > .inside {
      padding: 0;
      background: var(--theme-main-components-chat-interaction-background);
      color: var(--theme-main-components-chat-interaction-color);
      border-radius: 1rem;
      display: flex;
      flex-direction: column;
    }
  }
}
</style>
