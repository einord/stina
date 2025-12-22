<script setup lang="ts">
import ChatViewInput from './ChatView.Input.vue'
</script>

<template>
  <div class="chat-view">
    <div class="top-bar">söndag 21 december kl 21:45</div>
    <div class="chat-messages">
      <h1>Chat</h1>
    </div>
    <ChatViewInput class="input" />
  </div>
</template>

<style scoped>
.chat-view {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100%;

  > .top-bar {
    text-align: center;
    padding: 8px;
    font-size: 14px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  > .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  > .input {
    border-top: 1px solid var(--theme-general-border-color);
    position: relative;
  }
}
</style>
