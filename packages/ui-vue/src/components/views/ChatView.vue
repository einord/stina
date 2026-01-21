<script setup lang="ts">
import { provide } from 'vue'
import ChatViewInput from './ChatView.Input.vue'
import ChatViewMessages from './ChatView.Messages.vue'
import ChatViewProcessing from './ChatView.Processing.vue'
import { useChat } from './ChatView.service.js'

const props = defineProps<{
  /** Start a fresh conversation on mount (used after onboarding) */
  startFresh?: boolean
}>()

const chatBackgroundUrl = 'none' // `url(${new URL('../../assets/chat-background.png', import.meta.url).href})`

// Initialize chat (connects to API via SSE)
const chat = useChat({ startFresh: props.startFresh })

// Provide chat to child components
provide('chat', chat)
</script>

<template>
  <div class="chat-view">
    <div class="top-bar">söndag 21 december kl 21:45</div>
    <ChatViewMessages class="messages" />
    <ChatViewProcessing />
    <ChatViewInput class="input" />
  </div>
</template>

<style scoped>
.chat-view {
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: 100%;
  background-image: v-bind(chatBackgroundUrl);
  background-repeat: repeat-y;
  background-blend-mode: color-burn;
  background-position: center bottom;
  height: 100%;
  max-height: 100%;
  max-width: 100%;
  overflow-y: hidden;
  overflow-x: hidden;

  > .top-bar {
    text-align: center;
    padding: 8px;
    font-size: 14px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 0 2rem 2rem var(--theme-main-components-main-background);
    height: 0rem;
    overflow-y: visible;
    z-index: 1;
  }

  > .messages {
    flex: 1;
    overflow-y: auto;
  }

  > .input {
    border-top: 1px solid var(--theme-general-border-color);
    position: relative;
  }
}
</style>
