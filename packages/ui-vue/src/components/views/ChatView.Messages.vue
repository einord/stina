<script setup lang="ts">
import { inject, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import ChatViewMessagesInfo from './ChatView.Messages.Info.vue'
import ChatViewMessagesInstruction from './ChatView.Messages.Instruction.vue'
import ChatViewMessagesStina from './ChatView.Messages.Stina.vue'
import ChatViewMessagesThinking from './ChatView.Messages.Thinking.vue'
import ChatViewMessagesTools from './ChatView.Messages.Tools.vue'
import ChatViewMessagesUser from './ChatView.Messages.User.vue'
import type { useChat } from './ChatView.service.js'
import type { Message } from '@stina/chat'
import ChatViewMessagesEmptyStina from './ChatView.Messages.EmptyStina.vue'

const chat = inject<ReturnType<typeof useChat>>('chat')!
if (!chat) {
  throw new Error('ChatView.Messages: chat not provided')
}

// Refs for scroll handling
const messagesContainer = ref<HTMLElement | null>(null)
const loadMoreTrigger = ref<HTMLElement | null>(null)
const messagesEnd = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

// Track if user has manually scrolled up
let userScrolledUp = false

// Throttle timer for streaming auto-scroll
let scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null
const SCROLL_THROTTLE_MS = 100 // Throttle scroll updates during streaming

/**
 * Scrolls to the bottom of the messages container.
 * Respects if the user has manually scrolled up.
 */
function scrollToBottom(smooth = false): void {
  if (userScrolledUp) return

  nextTick(() => {
    messagesEnd.value?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'end',
    })
  })
}

/**
 * Detects if the user has manually scrolled up in the messages container.
 * Auto-scroll is paused when user is more than 100px from the bottom.
 */
function handleScroll(): void {
  const container = messagesContainer.value
  if (!container) return

  const { scrollTop, scrollHeight, clientHeight } = container
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight

  // If more than 100px from bottom, user has scrolled up
  userScrolledUp = distanceFromBottom > 100
}

// Helper to get tools from tools message
function getTools(message: Message) {
  if (message.type !== 'tools') return []
  return message.tools
}

// Helper to check if a message is an error message
// Error messages are the last 'stina' message in an interaction that has error: true
function isErrorMessage(
  interaction: { error?: boolean; messages: Message[] },
  message: Message,
  messageIndex: number
): boolean {
  if (!interaction.error) return false
  if (message.type !== 'stina') return false
  return messageIndex === interaction.messages.length - 1
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

// Watch for streaming content changes - auto-scroll when new content arrives
// Throttled to prevent excessive smooth scrolling during rapid updates
watch([chat.streamingContent.value, chat.streamingThinking.value], () => {
  if ((chat.isStreaming.value || chat.streamingContent.value) && !userScrolledUp) {
    // Throttle scroll updates to avoid performance issues
    if (scrollThrottleTimer) return

    scrollThrottleTimer = setTimeout(() => {
      scrollToBottom(true)
      scrollThrottleTimer = null
    }, SCROLL_THROTTLE_MS)
  }
})

// Watch for when streaming starts - reset scroll state and scroll to bottom
watch(
  () => chat.isStreaming.value,
  (isStreaming) => {
    if (isStreaming) {
      userScrolledUp = false
      scrollToBottom()
    }
  }
)

// Watch for new interactions added to history
// Only auto-scroll if user hasn't manually scrolled up
watch(
  () => chat.interactions.value.length,
  () => {
    if (!userScrolledUp) {
      scrollToBottom()
    }
  }
)

// Setup intersection observer and scroll listener
onMounted(() => {
  // Setup intersection observer for load-more
  if (loadMoreTrigger.value) {
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
  }

  // Setup scroll listener for auto-scroll detection
  messagesContainer.value?.addEventListener('scroll', handleScroll)

  // Initial scroll to bottom
  scrollToBottom()
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
  messagesContainer.value?.removeEventListener('scroll', handleScroll)

  // Clean up throttle timer
  if (scrollThrottleTimer) {
    clearTimeout(scrollThrottleTimer)
    scrollThrottleTimer = null
  }
})
</script>

<template>
  <div ref="messagesContainer" class="chat-view-messages">
    <!-- Load more trigger (invisible element at top) -->
    <div v-if="chat.hasMoreInteractions.value" ref="loadMoreTrigger" class="load-more-trigger"></div>

    <!-- Loading indicator -->
    <div v-if="chat.isLoadingMore.value" class="loading-more">Loading older messages...</div>

    <div class="empty"></div>

    <!-- Render all loaded interactions -->
    <div v-for="interaction in chat.interactions.value" :key="interaction.id" class="interaction">
      <!-- Information messages (shown first) -->
      <ChatViewMessagesInfo
v-for="(info, idx) in interaction.informationMessages"
        :key="`info-${interaction.id}-${idx}`" :message="info.text" />
      <div class="inside">
        <!-- Regular messages -->
        <template v-for="(message, idx) in interaction.messages" :key="`msg-${interaction.id}-${idx}`">
          <ChatViewMessagesInstruction
v-if="chat.debugMode.value && message.type === 'instruction'"
            :message="message.text" />
          <ChatViewMessagesUser v-else-if="message.type === 'user'" :message="message.text" />
          <ChatViewMessagesThinking
v-else-if="message.type === 'thinking'" :is-active="false"
            :message="message.text" />
          <ChatViewMessagesTools v-else-if="message.type === 'tools'" :tools="getTools(message)" />
          <ChatViewMessagesStina
v-else-if="message.type === 'stina'" :message="message.text"
            :is-error="isErrorMessage(interaction, message, idx)" />
        </template>
        <ChatViewMessagesEmptyStina v-if="interaction.messages.filter((m) => m.type === 'stina').length === 0" />
      </div>
    </div>

    <!-- Current (streaming) interaction -->
    <div v-if="chat.currentInteraction.value" class="interaction">
      <ChatViewMessagesInfo
v-for="(info, idx) in chat.informationMessages.value" :key="`info-current-${idx}`"
        :message="info.text" />
      <div class="inside">
        <template v-for="(message, idx) in chat.messages.value" :key="`msg-current-${idx}`">
          <ChatViewMessagesInstruction
v-if="chat.debugMode.value && message.type === 'instruction'"
            :message="message.text" />
          <ChatViewMessagesUser v-else-if="message.type === 'user'" :message="message.text" />
          <ChatViewMessagesThinking
v-else-if="message.type === 'thinking'" :is-active="chat.isStreaming.value"
            :message="message.text" />
          <ChatViewMessagesTools v-else-if="message.type === 'tools'" :tools="getTools(message)" />
          <ChatViewMessagesStina v-else-if="message.type === 'stina'" :message="message.text" />
        </template>
      </div>
    </div>

    <!-- Scroll anchor for auto-scroll to bottom -->
    <div ref="messagesEnd" class="messages-end"></div>
  </div>
</template>

<style scoped>
.chat-view-messages {
  display: flex;
  flex-direction: column;
  gap: 1em;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
  padding: 1rem;
  font-size: 1rem;

  :first-child {
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
  }

  :last-child {
    border-bottom-left-radius: 1rem;
    border-bottom-right-radius: 1rem;
  }

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
    flex: 1 0 1.5rem;
    width: 100%;
  }

  > .interaction {
    > .inside {
      padding: 0;
      background: var(--theme-main-components-chat-interaction-background);
      color: var(--theme-main-components-chat-interaction-color);
      display: flex;
      flex-direction: column;
    }
  }

  > .messages-end {
    height: 1px;
    min-height: 1px;
    width: 100%;
  }
}
</style>
