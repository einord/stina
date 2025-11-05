<template>
  <section class="chat">
    <div class="head">{{ headerDate }}</div>
    <div class="list">
      <ChatBubble v-for="m in messages" :key="m.id" :role="m.role==='info' ? 'assistant' : m.role" :avatar="m.role==='user' ? '🙂' : '🤖'">
        <template v-if="m.role==='info'"><em>{{ m.content }}</em></template>
        <template v-else>{{ m.content }}</template>
      </ChatBubble>
    </div>
    <ChatToolbar @new="startNew" />
    <MessageInput @send="onSend" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ChatBubble from './ChatBubble.vue';
import MessageInput from './MessageInput.vue';
import ChatToolbar from './ChatToolbar.vue';

type Msg = { id: string; role: 'user'|'assistant'|'info'; content: string; ts: number };
const messages = ref<Msg[]>([]);

const now = new Date();
const headerDate = computed(() => now.toLocaleString());

async function load() {
  // @ts-ignore preload
  messages.value = await window.stina.chat.get();
}

async function onSend(msg: string) {
  if (!msg) return;
  const optimistic: Msg = { id: Math.random().toString(36).slice(2), role: 'user', content: msg, ts: Date.now() };
  messages.value = [...messages.value, optimistic];
  // @ts-ignore preload
  await window.stina.chat.send(msg);
  // Do not append assistant here; we rely on chat-changed event to update from store
}

async function startNew() {
  // @ts-ignore preload
  messages.value = await window.stina.chat.newSession();
}

onMounted(async () => {
  await load();
  if (!messages.value.some(m => m.role === 'info')) {
    // @ts-ignore preload
    messages.value = await window.stina.chat.newSession();
  }
  // subscribe to external changes
  // @ts-ignore preload
  window.stina.chat.onChanged((msgs: Msg[]) => messages.value = msgs);
});
</script>

<style scoped>
.chat { display: grid; grid-template-rows: auto 1fr auto auto; height: 100%; }
.head { text-align: center; color: var(--muted); padding: var(--space-2); font-size: var(--text-sm); }
.list { display: grid; gap: var(--space-3); padding: var(--space-4); overflow: auto; }
</style>
