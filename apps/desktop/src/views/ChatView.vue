<template>
  <section class="chat">
    <div class="head">{{ headerDate }}</div>
    <div class="list" ref="listEl" @scroll="onScroll">
      <template v-for="m in messages" :key="m.id">
        <div v-if="m.role === 'info'" class="info-message">
          <span>{{ m.content }}</span>
        </div>
        <ChatBubble
          v-else
          :role="m.role"
          :avatar="m.role === 'user' ? '🙂' : '🤖'"
          :aborted="m.aborted === true"
          :text="m.content"
        />
      </template>
    </div>
    <ChatToolbar
      :streaming="!!streamingId"
      :warning="toolWarning"
      @new="startNew"
      @stop="stopStream"
    />
    <MessageInput @send="onSend" />
  </section>
</template>

<script setup lang="ts">
  import type { StreamEvent, WarningEvent } from '@stina/core';
  import type { ChatMessage } from '@stina/store';
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

  import ChatBubble from '../components/chat/ChatBubble.vue';
  import ChatToolbar from '../components/chat/ChatToolbar.vue';
  import MessageInput from '../components/chat/MessageInput.vue';

  const messages = ref<ChatMessage[]>([]);
  const toolWarning = ref<string | null>(null);
  const cleanup: Array<() => void> = [];

  const listEl = ref<HTMLDivElement | null>(null);
  const stickToBottom = ref(true);
  const streamingId = ref<string | null>(null);
  const MARGIN_REM = 4; // auto-scroll margin

  /**
   * Converts rem units into pixels using the root font size.
   */
  function remToPx(rem: number): number {
    const root = document.documentElement;
    const fs = Number.parseFloat(getComputedStyle(root).fontSize || '16');
    return rem * (Number.isFinite(fs) ? fs : 16);
  }

  /**
   * Determines if the user is near the bottom of the scroll container within a margin.
   */
  function isNearBottom(el: HTMLElement, marginPx = remToPx(MARGIN_REM)) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - marginPx;
  }

  /**
   * Scrolls the chat list to its end, optionally animating the movement.
   */
  function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const el = listEl.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  /**
   * Tracks whether we should auto-scroll when new messages arrive.
   */
  function onScroll() {
    const el = listEl.value;
    if (!el) return;
    stickToBottom.value = isNearBottom(el);
  }

  const now = new Date();
  const headerDate = computed(() => now.toLocaleString());

  /**
   * Loads the current chat history from the backend store.
   */
  async function load() {
    messages.value = await window.stina.chat.get();
  }

  /**
   * Sends a chat message and optimistically renders it before the backend responds.
   */
  async function onSend(msg: string) {
    if (!msg) return;
    const optimistic: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: msg,
      ts: Date.now(),
    };
    // NOTE: We optimistically render the user message locally for snappier UX.
    // If duplicate user messages would start to appear (e.g., backend also echoes user messages),
    // this optimistic append can be removed to rely solely on IPC 'chat-changed' updates.
    messages.value = [...messages.value, optimistic];
    await window.stina.chat.send(msg);
    // Assistant is streamed via 'chat-stream' events; final message comes via 'chat-changed'.
  }

  /**
   * Starts a new chat session by asking the backend to append an info message.
   */
  async function startNew() {
    await window.stina.chat.newSession();
    // We rely on chat-changed event to update view
  }

  /**
   * Cancels the currently streaming assistant response via IPC.
   */
  async function stopStream() {
    if (!streamingId.value) return;
    await window.stina.chat.cancel(streamingId.value);
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
    const warnings = await window.stina.chat.getWarnings();
    toolWarning.value = warnings.find(isToolWarning)?.message ?? null;
    if (!messages.value.some((m) => m.role === 'info')) {
      messages.value = await window.stina.chat.newSession();
    }
    await nextTick();
    // On start, ensure we show the latest message
    scrollToBottom('auto');
    onScroll(); // set initial stick state

    // subscribe to external changes
    cleanup.push(window.stina.chat.onChanged((msgs) => (messages.value = msgs)));

    // Stream updates
    cleanup.push(
      window.stina.chat.onStream((chunk) => {
        handleStreamEvent(chunk);
      }),
    );

    // Tool warnings
    const unsubscribeWarning = window.stina.chat.onWarning?.((warning) => {
      if (isToolWarning(warning)) {
        toolWarning.value = warning.message ?? 'Modellen stöder inte verktyg.';
      }
    });
    if (unsubscribeWarning) {
      cleanup.push(unsubscribeWarning);
    }
  });

  onUnmounted(() => {
    cleanup.splice(0).forEach((fn) => {
      try {
        fn();
      } catch (err) {
        void err;
      }
    });
  });

  /**
   * Applies streaming deltas to the temporary assistant message buffer.
   */
  function handleStreamEvent(chunk: StreamEvent) {
    const id = chunk.id;
    if (!id) return;
    if (chunk.start) streamingId.value = id;
    const existing = messages.value.find((m) => m.id === id);
    if (!existing) {
      const next: ChatMessage = {
        id,
        role: 'assistant',
        content: chunk.delta ?? '',
        ts: Date.now(),
      };
      messages.value = [...messages.value, next];
    } else if (chunk.delta) {
      existing.content += chunk.delta;
    }
    if (chunk.done) streamingId.value = streamingId.value === id ? null : streamingId.value;
  }

  /**
   * Checks if a warning represents a tool-disable notification.
   */
  function isToolWarning(warning: WarningEvent): boolean {
    return warning.type === 'tools-disabled';
  }
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
  .info-message {
    justify-self: center;
    text-align: center;
    max-width: 60ch;
    color: var(--muted);
    font-size: var(--text-sm);
    font-style: italic;
    background: transparent;
  }
</style>
