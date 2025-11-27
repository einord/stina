<script setup lang="ts">
  import type { Interaction } from '@stina/chat/types';
  import { t } from '@stina/i18n';
  import { nextTick, onMounted, ref, watch } from 'vue';

  import InteractionBlock from '../../views/InteractionBlock.vue';

  const PAGE_SIZE = 30;

  interface Props {
    activeConversationId: string;
  }

  const props = defineProps<Props>();

  const emit = defineEmits<{
    interactionsChanged: [interactions: Interaction[]];
  }>();

  const interactions = ref<Interaction[]>([]);
  const isLoadingOlder = ref(false);
  const hasMoreMessages = ref(false);
  const totalMessageCount = ref(0);
  const loadedCount = ref(0);
  const stickToBottom = ref(true);

  const interactionListElement = ref<HTMLDivElement | null>(null);
  const loadMoreTriggerElement = ref<HTMLDivElement | null>(null);
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
    const el = interactionListElement.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  /**
   * Loads the current chat history from the backend store.
   */
  async function load() {
    // Get total count
    totalMessageCount.value = await window.stina.chat.getCount();

    // Load initial page (most recent messages)
    const initialInteractions = await window.stina.chat.getPage(PAGE_SIZE, 0);
    interactions.value = initialInteractions;
    loadedCount.value = initialInteractions.length;
    hasMoreMessages.value = loadedCount.value < totalMessageCount.value;
    emit('interactionsChanged', interactions.value);
  }

  /**
   * Loads the next batch of older messages from the database.
   */
  async function loadOlderMessages() {
    if (isLoadingOlder.value || !hasMoreMessages.value) return;

    isLoadingOlder.value = true;
    const currentScrollHeight = interactionListElement.value?.scrollHeight ?? 0;

    try {
      const olderInteractions = await window.stina.chat.getPage(PAGE_SIZE, loadedCount.value);
      if (olderInteractions.length > 0) {
        // Prepend older messages
        interactions.value = [...olderInteractions, ...interactions.value];
        loadedCount.value += olderInteractions.length;
        hasMoreMessages.value = loadedCount.value < totalMessageCount.value;
        emit('interactionsChanged', interactions.value);

        // Maintain scroll position
        await nextTick();
        if (interactionListElement.value) {
          const newScrollHeight = interactionListElement.value.scrollHeight;
          interactionListElement.value.scrollTop += newScrollHeight - currentScrollHeight;
        }
      }
    } finally {
      isLoadingOlder.value = false;
    }
  }

  /**
   * Tracks whether we should auto-scroll when new messages arrive.
   */
  function onScroll() {
    const el = interactionListElement.value;
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
    const trigger = loadMoreTriggerElement.value;
    const container = interactionListElement.value;
    if (!trigger || !container) return;

    const triggerRect = trigger.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // If the trigger is visible in the viewport, load more
    if (triggerRect.bottom >= containerRect.top && triggerRect.top <= containerRect.bottom) {
      void loadOlderMessages();
    }
  }

  /**
   * Determines if a message belongs to an active conversation for styling purposes.
   */
  function isActiveMessage(message: Interaction): boolean {
    if (!props.activeConversationId) return false;
    return message.conversationId === props.activeConversationId;
  }

  /**
   * Updates the interactions list (used when streaming new messages).
   */
  function updateInteractions(newInteractions: Interaction[]) {
    interactions.value = newInteractions;
    emit('interactionsChanged', interactions.value);
  }

  // Auto-scroll after message changes if user is at bottom (with margin)
  watch(
    interactions,
    async () => {
      if (!interactionListElement.value) return;
      if (stickToBottom.value) await nextTick().then(() => scrollToBottom('smooth'));
    },
    { deep: true },
  );

  onMounted(async () => {
    await load();
    scrollToBottom('auto');
    onScroll(); // set initial stick state
  });

  defineExpose({
    load,
    updateInteractions,
    interactions,
  });
</script>

<template>
  <div class="interaction-list" ref="interactionListElement" @scroll="onScroll">
    <div v-if="isLoadingOlder" class="loading-message">
      <span>{{ t('chat.loading_older') }}</span>
    </div>
    <div v-if="hasMoreMessages" class="load-more-trigger" ref="loadMoreTriggerElement" />
    <InteractionBlock
      v-for="m in interactions"
      :key="m.id"
      :interaction="m"
      :active="isActiveMessage(m)"
    ></InteractionBlock>
  </div>
</template>

<style scoped>
  .interaction-list {
    display: flex;
    flex-direction: column;
    gap: 1em;
    overflow-y: auto;
    min-height: 0;
    overscroll-behavior: contain;
    padding: 0 1rem;

    > .load-more-trigger {
      height: 1px;
      width: 100%;
      flex-shrink: 0;
    }

    > .loading-message {
      justify-self: center;
      text-align: center;
      width: 100%;
      color: var(--muted);
      font-size: 0.75rem;
      font-style: italic;
      padding: 2em;
    }
  }
</style>
