<script setup lang="ts">
  import type { Interaction } from '@stina/chat';
  import type { StreamEvent, WarningEvent } from '@stina/core';
  import { t } from '@stina/i18n';
  import { onMounted, onUnmounted, ref } from 'vue';

  import ChatToolbar from '../components/chat/ChatToolbar.vue';
  import InteractionList from '../components/chat/InteractionList.vue';
  import MessageInput from '../components/chat/MessageInput.vue';

  import EmptyState from './ChatView.EmptyState.vue';
  import ChatHeader from './ChatView.Header.vue';

  const interactionListRef = ref<InstanceType<typeof InteractionList> | null>(null);
  const activeConversationId = ref<string>('');
  const toolWarning = ref<string | null>(null);
  const cleanup: Array<() => void> = [];
  const hasActiveProvider = ref<boolean>(true);
  const streamingId = ref<string | null>(null);
  const interactionCount = ref(0);

  /**
   * Synchronizes the active conversation id from the backend store.
   */
  async function syncActiveConversationId() {
    activeConversationId.value = await window.stina.chat.getActiveConversationId();
  }

  async function syncProviderState() {
    const settings = await window.stina.settings.get();
    hasActiveProvider.value = Boolean(settings.active);
  }

  /**
   * Sends a chat message and optimistically renders it before the backend responds.
   */
  async function onSend(msg: string) {
    if (!msg) return;
    await window.stina.chat.send(msg);
    // Assistant is streamed via 'chat-stream' events; final message comes via 'chat-changed'.
  }

  /**
   * Starts a new chat session by asking the backend to append an info message.
   */
  async function startNew() {
    await window.stina.chat.newSession();
    await syncActiveConversationId();
    await interactionListRef.value?.load();
  }

  /**
   * Cancels the currently streaming assistant response via IPC.
   */
  async function stopStream() {
    if (!streamingId.value) return;
    await window.stina.chat.cancel(streamingId.value);
  }

  onMounted(async () => {
    const warnings = await window.stina.chat.getWarnings();
    toolWarning.value = warnings.find(isToolWarning)?.message ?? null;
    await syncActiveConversationId();
    await syncProviderState();

    // subscribe to external changes - when full list changes, reload
    cleanup.push(
      window.stina.chat.onChanged(async () => {
        await interactionListRef.value?.load();
      }),
    );

    cleanup.push(
      window.stina.chat.onConversationChanged(async (conversationId: string) => {
        activeConversationId.value = conversationId;
        await interactionListRef.value?.load();
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
   * Applies streaming deltas to the temporary assistant message buffer.
   */
  function handleStreamEvent(chunk: StreamEvent) {
    const id = chunk.id;
    if (!id) return;
    if (chunk.start) streamingId.value = id;

    const interactions = interactionListRef.value?.interactions;
    if (!interactions) return;

    // Use interactionId to find the right interaction, fallback to id
    const interactionId = chunk.interactionId || id;
    let existing = interactions.find((m: Interaction) => m.id === interactionId);

    if (!existing) {
      // Create new interaction with initial assistant message
      const next: Interaction = {
        id: interactionId,
        messages: [],
        conversationId: activeConversationId.value || 'pending',
        createdAt: Date.now(),
        provider: null,
        aiModel: null,
        aborted: false,
      };
      interactionListRef.value?.updateInteractions([...interactions, next]);
      existing = next;
    }

    // Handle delta separately to ensure it's processed even when interaction is created
    if (chunk.delta) {
      if (existing) {
        const assistantMsg = existing.messages.find((m: any) => m.id === id);
        if (assistantMsg) {
          assistantMsg.content += chunk.delta;
        } else {
          // Create the assistant message if it doesn't exist
          existing.messages.push({
            id: id,
            interactionId: interactionId,
            role: 'assistant',
            content: chunk.delta,
            conversationId: activeConversationId.value || 'pending',
            provider: null,
            aborted: false,
            metadata: null,
            ts: Date.now(),
          });
        }
        interactionListRef.value?.updateInteractions([...interactions]);
      }
    }
    if (chunk.done && streamingId.value === id) {
      streamingId.value = null;
    }
  }

  /**
   * Checks if a warning represents a tool-disable notification.
   */
  function isToolWarning(warning: WarningEvent): boolean {
    return warning.type === 'tools-disabled';
  }

  /**
   * Navigates to the AI settings panel so the user can configure a provider.
   */
  function goToProviderSettings() {
    // Use the settings sidebar model via localStorage to switch tab on settings view
    // and navigate if router is available.
    localStorage.setItem('stina:settingsActiveGroup', 'ai');
    window.dispatchEvent(new CustomEvent('stina:navigate', { detail: { to: 'settings' } }));
  }
</script>

<template>
  <section class="chat-view">
    <ChatHeader />
    <InteractionList
      ref="interactionListRef"
      :active-conversation-id="activeConversationId"
      @interactions-changed="(ints) => (interactionCount = ints.length)"
    />
    <EmptyState
      v-if="!hasActiveProvider && interactionCount === 0"
      @configure="goToProviderSettings"
    />
    <ChatToolbar
      v-if="hasActiveProvider"
      :streaming="!!streamingId"
      :warning="toolWarning"
      @new="startNew"
      @stop="stopStream"
    />
    <MessageInput v-if="hasActiveProvider" @send="onSend" />
  </section>
</template>

<style scoped>
  .chat-view {
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
