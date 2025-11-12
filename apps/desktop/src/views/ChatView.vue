<template>
  <section class="chat">
    <div class="head">{{ headerDate }}</div>
    <div class="list" ref="listEl" @scroll="onScroll">
      <div v-if="isLoadingOlder" class="loading-message">
        <span>{{ t('chat.loading_older') }}</span>
      </div>
      <div v-if="hasMoreMessages" class="load-more-trigger" ref="loadTriggerEl" />
      <div class="list-spacer" aria-hidden="true" />
      <template v-for="m in visibleMessages" :key="m.id">
        <div
          class="message-wrapper"
          :class="{ inactive: isInactiveMessage(m) }"
          :data-conversation-id="m.conversationId"
        >
          <div v-if="m.role === 'info'" class="info-message">
            <span>{{ m.content }}</span>
            <time
              v-if="formatTimestamp(m.ts)"
              class="message-timestamp"
              :datetime="formatTimestampIso(m.ts)"
            >
              {{ formatTimestamp(m.ts) }}
            </time>
          </div>
          <div v-else-if="m.role === 'debug'" class="debug-message">
            <span>{{ m.content }}</span>
            <time
              v-if="formatTimestamp(m.ts)"
              class="message-timestamp"
              :datetime="formatTimestampIso(m.ts)"
            >
              {{ formatTimestamp(m.ts) }}
            </time>
          </div>
          <div v-else-if="m.role === 'tool'">
            <span>{{ JSON.stringify(m) }}</span>
            <time
              v-if="formatTimestamp(m.ts)"
              class="message-timestamp"
              :datetime="formatTimestampIso(m.ts)"
            >
              {{ formatTimestamp(m.ts) }}
            </time>
          </div>
          <ChatBubble
            v-else
            :role="m.role"
            :avatar="m.role === 'user' ? '🙂' : ''"
            :avatar-image="m.role === 'assistant' ? assistantAvatar : ''"
            :image-outside="m.role === 'assistant'"
            :avatar-alt="m.role === 'assistant' ? t('chat.assistant') : t('chat.you')"
            :aborted="m.aborted === true"
            :text="m.content"
            :timestamp="formatTimestamp(m.ts)"
            :timestamp-iso="formatTimestampIso(m.ts)"
          />
        </div>
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
  import { t } from '@stina/i18n';
  import type { ChatMessage } from '@stina/store';
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

  import assistantAvatar from '../assets/avatars/stina-avatar.png';
  import ChatBubble from '../components/chat/ChatBubble.vue';
  import ChatToolbar from '../components/chat/ChatToolbar.vue';
  import MessageInput from '../components/chat/MessageInput.vue';

  const PAGE_SIZE = 30;
  const messages = ref<ChatMessage[]>([]);
  const visibleMessages = computed(() => messages.value.filter((m) => m.role !== 'instructions'));
  const activeConversationId = ref<string>('');
  const toolWarning = ref<string | null>(null);
  const cleanup: Array<() => void> = [];

  const listEl = ref<HTMLDivElement | null>(null);
  const loadTriggerEl = ref<HTMLDivElement | null>(null);
  const stickToBottom = ref(true);
  const streamingId = ref<string | null>(null);
  const isLoadingOlder = ref(false);
  const hasMoreMessages = ref(false);
  const totalMessageCount = ref(0);
  const loadedCount = ref(0);
  const MARGIN_REM = 4; // auto-scroll margin
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';
  const timestampFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  let relativeFormatter: Intl.RelativeTimeFormat | null = null;
  try {
    relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    relativeFormatter = null;
  }

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

    // Check if we should load older messages
    if (hasMoreMessages.value && !isLoadingOlder.value) {
      checkLoadTrigger();
    }
  }

  /**
   * Checks if the load-more trigger element is visible and loads older messages if needed.
   */
  function checkLoadTrigger() {
    const trigger = loadTriggerEl.value;
    const container = listEl.value;
    if (!trigger || !container) return;

    const triggerRect = trigger.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // If the trigger is visible in the viewport, load more
    if (triggerRect.bottom >= containerRect.top && triggerRect.top <= containerRect.bottom) {
      void loadOlderMessages();
    }
  }

  /**
   * Loads the next batch of older messages from the database.
   */
  async function loadOlderMessages() {
    if (isLoadingOlder.value || !hasMoreMessages.value) return;

    isLoadingOlder.value = true;
    const currentScrollHeight = listEl.value?.scrollHeight ?? 0;

    try {
      const olderMessages = await window.stina.chat.getPage(PAGE_SIZE, loadedCount.value);
      if (olderMessages.length > 0) {
        // Prepend older messages
        messages.value = [...olderMessages, ...messages.value];
        loadedCount.value += olderMessages.length;
        hasMoreMessages.value = loadedCount.value < totalMessageCount.value;

        // Maintain scroll position
        await nextTick();
        if (listEl.value) {
          const newScrollHeight = listEl.value.scrollHeight;
          listEl.value.scrollTop += newScrollHeight - currentScrollHeight;
        }
      }
    } finally {
      isLoadingOlder.value = false;
    }
  }

  const now = new Date();
  const headerDate = computed(() => now.toLocaleString());

  /**
   * Returns a short timestamp that is relative for same-day events and absolute otherwise.
   */
  function formatTimestamp(ts?: number): string {
    if (!ts) return '';
    if (isSameDay(ts)) return formatRelative(ts);
    return formatAbsolute(ts);
  }

  /**
   * Converts a millisecond timestamp to ISO 8601 for <time datetime> attributes.
   */
  function formatTimestampIso(ts?: number): string {
    if (!ts) return '';
    return new Date(ts).toISOString();
  }

  /**
   * Produces a locale-aware absolute timestamp for old messages.
   */
  function formatAbsolute(ts: number): string {
    try {
      return timestampFormatter.format(new Date(ts));
    } catch (err) {
      void err;
    }
    return new Date(ts).toLocaleString();
  }

  /**
   * Formats timestamps that occurred today using human friendly relative strings.
   */
  function formatRelative(ts: number): string {
    if (!relativeFormatter) return formatAbsolute(ts);
    const diffSeconds = Math.round((ts - Date.now()) / 1000);
    const absSeconds = Math.abs(diffSeconds);
    if (absSeconds < 60) return relativeFormatter.format(diffSeconds, 'second');
    const diffMinutes = Math.round(diffSeconds / 60);
    if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(diffMinutes, 'minute');
    const diffHours = Math.round(diffMinutes / 60);
    return relativeFormatter.format(diffHours, 'hour');
  }

  /**
   * Checks if the supplied timestamp falls on the current calendar date.
   */
  function isSameDay(ts: number): boolean {
    const nowDate = new Date();
    const other = new Date(ts);
    return (
      nowDate.getFullYear() === other.getFullYear() &&
      nowDate.getMonth() === other.getMonth() &&
      nowDate.getDate() === other.getDate()
    );
  }

  /**
   * Loads the current chat history from the backend store.
   */
  async function load() {
    // Get total count
    totalMessageCount.value = await window.stina.chat.getCount();

    // Load initial page (most recent messages)
    const initialMessages = await window.stina.chat.getPage(PAGE_SIZE, 0);
    messages.value = initialMessages;
    loadedCount.value = initialMessages.length;
    hasMoreMessages.value = loadedCount.value < totalMessageCount.value;
  }

  /**
   * Synchronizes the active conversation id from the backend store.
   */
  async function syncActiveConversationId() {
    activeConversationId.value = await window.stina.chat.getActiveConversationId();
  }

  /**
   * Sends a chat message and optimistically renders it before the backend responds.
   */
  async function onSend(msg: string) {
    if (!msg) return;
    const conversationId =
      activeConversationId.value || (await window.stina.chat.getActiveConversationId());
    const optimistic: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: msg,
      ts: Date.now(),
      conversationId,
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
    await syncActiveConversationId();
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
      totalMessageCount.value = await window.stina.chat.getCount();
      loadedCount.value = messages.value.length;
      hasMoreMessages.value = loadedCount.value < totalMessageCount.value;
    }
    await syncActiveConversationId();
    await nextTick();
    // On start, ensure we show the latest message
    scrollToBottom('auto');
    onScroll(); // set initial stick state

    // subscribe to external changes - when full list changes, reload
    cleanup.push(
      window.stina.chat.onChanged(async (msgs: ChatMessage[]) => {
        // If we have loaded all messages or the change is recent (new message), update directly
        if (!hasMoreMessages.value || msgs.length > messages.value.length) {
          messages.value = msgs;
          totalMessageCount.value = await window.stina.chat.getCount();
          loadedCount.value = messages.value.length;
          hasMoreMessages.value = loadedCount.value < totalMessageCount.value;
        }
      }),
    );

    cleanup.push(
      window.stina.chat.onConversationChanged((conversationId: string) => {
        activeConversationId.value = conversationId;
      }),
    );

    // Stream updates
    cleanup.push(
      window.stina.chat.onStream((chunk: StreamEvent) => {
        handleStreamEvent(chunk);
      }),
    );

    // Tool warnings
    const unsubscribeWarning = window.stina.chat.onWarning?.((warning: WarningEvent) => {
      if (isToolWarning(warning)) {
        toolWarning.value = warning.message ?? t('errors.no_provider');
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
   * Determines if a message belongs to a non-active conversation for styling purposes.
   */
  function isInactiveMessage(message: ChatMessage): boolean {
    if (!activeConversationId.value) return false;
    return message.conversationId !== activeConversationId.value;
  }

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
        conversationId: activeConversationId.value || 'pending',
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
    overflow: hidden;
  }
  .head {
    text-align: center;
    color: var(--muted);
    padding: var(--space-2);
    font-size: var(--text-sm);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    overflow-y: auto;
    min-height: 0;
    overscroll-behavior: contain;
  }
  .message-wrapper {
    width: 100%;
    transition: opacity 120ms ease;
  }
  .message-wrapper.inactive {
    opacity: 0.45;
  }
  .list-spacer {
    flex: 1 0 auto;
  }
  .load-more-trigger {
    height: 1px;
    width: 100%;
    flex-shrink: 0;
  }
  .loading-message {
    justify-self: center;
    text-align: center;
    width: 100%;
    color: var(--muted);
    font-size: var(--text-sm);
    font-style: italic;
    padding: var(--space-2);
  }
  .info-message {
    justify-self: center;
    text-align: center;
    width: 100%;
    color: var(--muted);
    font-size: var(--text-sm);
    font-style: italic;
    padding: var(--space-2);
    white-space: pre-wrap;
  }
  .debug-message {
    justify-self: stretch;
    width: 100%;
    max-width: 100%;
    margin: var(--space-1) 0;
    padding: var(--space-2) var(--space-3);
    background: var(--panel);
    border-left: 3px solid var(--accent);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: show;
  }
  .message-timestamp {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted);
  }
</style>
