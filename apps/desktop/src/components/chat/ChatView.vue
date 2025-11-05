<template>
  <section class="chat">
    <div class="head">{{ headerDate }}</div>
    <div class="list">
      <ChatBubble role="assistant" avatar="🤖" text="Hi there, how may I assist you?" />
      <ChatBubble role="user" avatar="🙂" text="What’s next on my agenda?" />
    </div>
    <MessageInput @send="onSend" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChatBubble from './ChatBubble.vue';
import MessageInput from './MessageInput.vue';

const now = new Date();
const headerDate = computed(() => now.toLocaleString());

function onSend(msg: string) {
  console.log('[chat] send', msg);
}
</script>

<style scoped>
.chat { display: grid; grid-template-rows: auto 1fr auto; height: 100%; }
.head { text-align: center; color: var(--muted); padding: var(--space-2); font-size: var(--text-sm); }
.list { display: grid; gap: var(--space-3); padding: var(--space-4); overflow: auto; }
</style>