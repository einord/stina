<script setup lang="ts">
  import { type ToolMessageGroup, groupToolMessages } from '@stina/chat/messageGrouping';
  import type { Interaction, InteractionMessage } from '@stina/chat/types';
  import { formatRelativeTime, t } from '@stina/i18n';
  import { computed, onMounted, ref } from 'vue';

  import InteractionBlockAiMessage from './InteractionBlock.AiMessage.vue';
  import InteractionBlockDebugMessage from './InteractionBlock.DebugMessage.vue';
  import InteractionBlockInfoMessage from './InteractionBlock.InfoMessage.vue';
  import InteractionBlockInstructionsMessage from './InteractionBlock.InstructionsMessage.vue';
  import InteractionBlockToolUsage from './InteractionBlock.ToolUsage.vue';
  import InteractionBlockUserMessage from './InteractionBlock.UserMessage.vue';

  const props = defineProps<{
    interaction: Interaction;
    active: boolean;
    abortableInteractionId?: string | null;
    abortableAssistantId?: string | null;
  }>();

  const emit = defineEmits<{ (e: 'abort', assistantId: string): void }>();

  const isDebugMode = ref(false);
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';
  const startedAt = computed(() => {
    try {
      const dt = new Date(props.interaction.createdAt);
      return dt.getTime();
    } catch {
      return null;
    }
  });

  const groupedMessages = computed(() => groupToolMessages(props.interaction.messages));
  const soloInfoMessage = computed(() => {
    const first = groupedMessages.value[0];
    if (!first) return null;
    if (isToolGroup(first)) return null;
    if (groupedMessages.value.length !== 1) return null;
    return first.role === 'info' ? first : null;
  });

  const isAbortable = computed(
    () =>
      props.abortableInteractionId === props.interaction.id &&
      Boolean(props.abortableAssistantId),
  );

  const dueFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  function relativeTime(ts: number) {
    return formatRelativeTime(ts, { t, absoluteFormatter: dueFormatter });
  }

  function isToolGroup(
    message: InteractionMessage | ToolMessageGroup,
  ): message is ToolMessageGroup {
    return (message as ToolMessageGroup).kind === 'tool-group';
  }

  function onAbort() {
    if (!props.abortableAssistantId) return;
    emit('abort', props.abortableAssistantId);
  }

  onMounted(async () => {
    const settings = await window.stina.settings.get();
    isDebugMode.value = settings.advanced?.debugMode ?? false;
  });
</script>

<template>
  <InteractionBlockInfoMessage
    v-if="soloInfoMessage"
    :message="soloInfoMessage"
  ></InteractionBlockInfoMessage>
  <div v-else class="interaction" :class="{ active }">
    <div class="meta" v-if="groupedMessages && groupedMessages.length > 0">
      <div class="ts">{{ startedAt == null ? '' : relativeTime(startedAt) }}</div>
      <div class="actions" v-if="isAbortable">
        <button type="button" class="abort" @click="onAbort">{{ t('chat.abort_interaction') }}</button>
      </div>
      <div v-if="isDebugMode" class="interaction-id">
        <span>{{ t('chat.debug.id') }}&colon;</span>
        <span>{{ interaction.id }}</span>
      </div>
    </div>
    <template v-for="msg in groupedMessages" :key="isToolGroup(msg) ? msg.messages[0].id : msg.id">
      <InteractionBlockInstructionsMessage
        v-if="!isToolGroup(msg) && msg.role == 'instructions' && isDebugMode"
        :message="msg"
      ></InteractionBlockInstructionsMessage>
      <InteractionBlockUserMessage
        v-else-if="!isToolGroup(msg) && msg.role == 'user'"
        :message="msg"
      ></InteractionBlockUserMessage>
      <InteractionBlockAiMessage
        v-else-if="!isToolGroup(msg) && msg.role == 'assistant'"
        :message="msg"
      ></InteractionBlockAiMessage>
      <InteractionBlockInfoMessage
        v-else-if="!isToolGroup(msg) && msg.role == 'info' && isDebugMode"
        :message="msg"
      ></InteractionBlockInfoMessage>
      <InteractionBlockToolUsage
        v-else-if="isToolGroup(msg)"
        :messages="msg.messages"
      ></InteractionBlockToolUsage>
      <InteractionBlockDebugMessage
        v-if="!isToolGroup(msg) && msg.role == 'debug' && isDebugMode"
        :message="msg"
      ></InteractionBlockDebugMessage>
      <!-- <div v-else>OTHER: ({{ msg.role }}): {{ msg.content }}</div> -->
    </template>
  </div>
</template>

<style scoped>
  .interaction {
    padding: 0;
    background-color: var(--interaction-bg);
    color: var(--interaction-fg);
    border-radius: 1rem;
    display: flex;
    flex-direction: column;

    opacity: 0.45;

    > .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.75rem;
      padding: 1rem 2rem;

      > .ts {
        color: var(--muted);
      }

      > .actions {
        display: flex;
        gap: 0.5rem;

        > .abort {
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 0.3rem 0.75rem;
          background: var(--selected-bg);
          color: var(--text);
          cursor: pointer;
          font-size: 0.85rem;
          transition: background 0.2s ease, color 0.2s ease;

          &:hover {
            background: var(--border);
          }
        }
      }

      > .interaction-id {
        display: flex;
        gap: 0.5em;
        font-family: monospace;
      }
    }

    &.active {
      opacity: 1;
    }
  }
</style>
