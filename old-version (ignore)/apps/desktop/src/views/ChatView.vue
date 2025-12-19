<script setup lang="ts">
  import type { Interaction } from '@stina/chat/types';
  import type { StreamEvent, WarningEvent, QueueState } from '@stina/core';
  import type { QuickCommand } from '@stina/settings';
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
  const queueState = ref<QueueState>({
    activeAssistantId: null,
    activeInteractionId: null,
    queued: [],
    isProcessing: false,
  });
  const quickCommands = ref<QuickCommand[]>([]);

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
    try {
      await window.stina.chat.send(msg);
    } catch (err) {
      void err;
    }
    // Assistant is streamed via 'chat-stream' events; final message comes via 'chat-changed'.
  }

  /**
   * Starts a new chat session by asking the backend to append an info message.
   */
  async function startNew() {
    try {
      await window.stina.chat.newSession();
      await syncActiveConversationId();
      await interactionListRef.value?.load();
    } catch (err) {
      void err;
    }
  }

  /**
   * Deletes the most recent interaction and resends its first message.
   */
  async function retryLastInteraction() {
    if (streamingId.value) return;
    try {
      await window.stina.chat.retryLast();
    } catch (err) {
      // Swallow error; UI will remain unchanged if retry fails.
      void err;
    }
  }

  async function removeQueued(id: string) {
    try {
      await window.stina.chat.removeQueued(id);
    } catch (err) {
      void err;
    }
  }

  async function abortActiveInteraction() {
    const assistantId = queueState.value.activeAssistantId;
    if (!assistantId) return;
    await window.stina.chat.cancel(assistantId);
  }

  async function syncQueue() {
    try {
      const state = await window.stina.chat.getQueueState();
      queueState.value = state;
    } catch (err) {
      void err;
    }
  }

  async function loadQuickCommands() {
    try {
      quickCommands.value = await window.stina.settings.getQuickCommands();
    } catch (err) {
      void err;
    }
  }

  async function sendQuickCommand(command: QuickCommand) {
    const text = command.text?.trim();
    if (!text) return;
    await onSend(text);
  }

  onMounted(async () => {
    const warnings = await window.stina.chat.getWarnings();
    toolWarning.value = warnings.find(isToolWarning)?.message ?? null;
    await syncActiveConversationId();
    await syncProviderState();
    await syncQueue();
    await loadQuickCommands();

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

    const unsubscribeQueue = window.stina.chat.onQueue?.((state: QueueState) => {
      queueState.value = state;
    });
    if (unsubscribeQueue) cleanup.push(unsubscribeQueue);

    const unsubscribeQuickCommands =
      window.stina.settings.onQuickCommandsChanged?.((commands: QuickCommand[]) => {
        quickCommands.value = commands ?? [];
      });
    if (unsubscribeQuickCommands) cleanup.push(unsubscribeQuickCommands);
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
       :abortable-interaction-id="queueState.activeInteractionId"
       :abortable-assistant-id="queueState.activeAssistantId"
       @interactions-changed="(ints) => (interactionCount = ints.length)"
       @abort="abortActiveInteraction"
    />
    <EmptyState
      v-if="!hasActiveProvider && interactionCount === 0"
      @configure="goToProviderSettings"
    />
    <div
      v-if="queueState.isProcessing || queueState.queued.length"
      class="queue-bar"
      role="status"
      :aria-label="t('chat.queue_status_aria')"
    >
      <div class="thinking">
        <span class="pulse" aria-hidden="true"></span>
        <span>{{ t('chat.thinking') }}</span>
      </div>
      <div class="queued" v-if="queueState.queued.length">
        <span class="label">{{ t('chat.queue_label') }}</span>
        <ul>
          <li v-for="item in queueState.queued" :key="item.id">
            <span class="preview">{{ item.preview }}</span>
            <button type="button" class="remove" @click="removeQueued(item.id)">×</button>
          </li>
        </ul>
      </div>
    </div>
    <ChatToolbar
      v-if="hasActiveProvider"
      :warning="toolWarning"
      :can-retry="interactionCount > 0 && !streamingId"
      :disable-new="queueState.isProcessing || queueState.queued.length > 0"
      :quick-commands="quickCommands"
      @new="startNew"
      @retry-last="retryLastInteraction"
      @quick-command="sendQuickCommand"
    />
    <MessageInput v-if="hasActiveProvider" @send="onSend" />
  </section>
</template>

<style scoped>
  .chat-view {
    display: grid;
    grid-template-rows: auto 1fr auto auto auto;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .queue-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1.5rem 0.5rem 1.5rem;
    color: var(--muted);
    font-size: 0.9rem;

    > .thinking {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;

      > .pulse {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--accent);
        display: inline-block;
        animation: pulse 1s ease-in-out infinite;
      }
    }

    > .queued {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      font-size: 0.85rem;

      > .label {
        font-weight: 600;
        color: var(--text);
      }

      > ul {
        display: inline-flex;
        gap: 0.4rem;
        padding: 0;
        margin: 0;
        list-style: none;

        > li {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.6rem;
          border-radius: 999px;
          background: var(--selected-bg);
          border: 1px solid var(--border);
          color: var(--text);

          > .preview {
            max-width: 18ch;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 0.85rem;
          }

          > .remove {
            border: none;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
            font-size: 1rem;
            line-height: 1;
            padding: 0;
            width: 18px;
            height: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;

            &:hover {
              color: var(--text);
            }
          }
        }
      }
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.4);
      opacity: 0.4;
    }
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
  }
</style>
