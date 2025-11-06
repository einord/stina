<template>
  <section class="chat">
    <div class="head">{{ headerDate }}</div>
    <div class="list" ref="listEl" @scroll="onScroll">
      <ChatBubble
        v-for="m in messages"
        :key="m.id"
        :role="m.role === 'info' ? 'assistant' : m.role"
        :avatar="m.role === 'user' ? '🙂' : '🤖'"
      >
        <template v-if="m.role === 'info'"
          ><em>{{ m.content }}</em></template
        >
        <template v-else>{{ m.content }}</template>
      </ChatBubble>
    </div>
    <ChatToolbar @new="startNew" />
    <MessageInput @send="onSend" />
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue';

  import ChatBubble from '../components/chat/ChatBubble.vue';
  import ChatToolbar from '../components/chat/ChatToolbar.vue';
  import MessageInput from '../components/chat/MessageInput.vue';

  type Msg = { id: string; role: 'user' | 'assistant' | 'info'; content: string; ts: number };
  const messages = ref<Msg[]>([]);

  const listEl = ref<HTMLDivElement | null>(null);
  const stickToBottom = ref(true);
  const MARGIN_REM = 2; // auto-scroll margin

  function remToPx(rem: number): number {
    const root = document.documentElement;
    const fs = Number.parseFloat(getComputedStyle(root).fontSize || '16');
    return rem * (Number.isFinite(fs) ? fs : 16);
  }

  function isNearBottom(el: HTMLElement, marginPx = remToPx(MARGIN_REM)) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - marginPx;
  }

  function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const el = listEl.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  function onScroll() {
    const el = listEl.value;
    if (!el) return;
    stickToBottom.value = isNearBottom(el);
  }

  const now = new Date();
  const headerDate = computed(() => now.toLocaleString());

  async function load() {
    // @ts-ignore preload
    messages.value = await window.stina.chat.get();
  }

  async function onSend(msg: string) {
    if (!msg) return;
    const optimistic: Msg = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: msg,
      ts: Date.now(),
    };
    // NOTE: We optimistically render the user message locally for snappier UX.
    // If duplicate user messages would start to appear (e.g., backend also echoes user messages),
    // this optimistic append can be removed to rely solely on IPC 'chat-changed' updates.
    messages.value = [...messages.value, optimistic];
    // @ts-ignore preload
    await window.stina.chat.send(msg);
    // Assistant is streamed via 'chat-stream' events; final message comes via 'chat-changed'.
  }

  async function startNew() {
    // @ts-ignore preload
    await window.stina.chat.newSession();
    // We rely on chat-changed event to update view
  }

  // Auto-scroll after message changes if user is at bottom (with margin)
  watch(
    messages,
    async () => {
      if (!listEl.value) return;
      if (stickToBottom.value) await nextTick().then(() => scrollToBottom('smooth'));
    },
    { deep: true },
  );

  onMounted(async () => {
    await load();
    if (!messages.value.some((m) => m.role === 'info')) {
      // @ts-ignore preload
      messages.value = await window.stina.chat.newSession();
    }
    await nextTick();
    // On start, ensure we show the latest message
    scrollToBottom('auto');
    onScroll(); // set initial stick state

    // subscribe to external changes
    // @ts-ignore preload
    window.stina.chat.onChanged((msgs: Msg[]) => (messages.value = msgs));

    // Stream updates
    // @ts-ignore preload
    window.stina.chat.onStream((chunk: { id: string; delta?: string; done?: boolean }) => {
      const id = chunk.id;
      const existing = messages.value.find((m) => m.id === id);
      if (!existing) {
        messages.value = [
          ...messages.value,
          { id, role: 'assistant', content: chunk.delta ?? '', ts: Date.now() } as Msg,
        ];
      } else if (chunk.delta) {
        existing.content += chunk.delta;
      }
      // When done, the persisted final message will arrive via chat-changed; no action needed here.
    });
  });
</script>

<style scoped>
  .chat {
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    height: 100%;
    min-height: 0;
  }
  .head {
    text-align: center;
    color: var(--muted);
    padding: var(--space-2);
    font-size: var(--text-sm);
  }
  .list {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
    overflow: auto;
    min-height: 0;
    overscroll-behavior: contain;
  }
</style>
