<script setup lang="ts">
  import { type ToolMessageGroup, groupToolMessages } from '@stina/chat/messageGrouping';
  import type { Interaction, InteractionMessage } from '@stina/chat/types';
  import { t } from '@stina/i18n';
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
  }>();

  const isDebugMode = ref(false);
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';
  const startedAt = computed(() => {
    try {
      const dt = new Date(props.interaction.createdAt);
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(dt);
    } catch {
      return '';
    }
  });

  const groupedMessages = computed(() => groupToolMessages(props.interaction.messages));

  function isToolGroup(
    message: InteractionMessage | ToolMessageGroup,
  ): message is ToolMessageGroup {
    return (message as ToolMessageGroup).kind === 'tool-group';
  }

  onMounted(async () => {
    const settings = await window.stina.settings.get();
    isDebugMode.value = settings.advanced?.debugMode ?? false;
  });
</script>

<template>
  <div class="interaction" :class="{ active }">
    <div class="meta">
      <span class="ts">{{ startedAt }}</span>
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
      <InteractionBlockToolUsage
        v-else-if="isToolGroup(msg)"
        :messages="msg.messages"
      ></InteractionBlockToolUsage>
      <InteractionBlockInfoMessage
        v-else-if="!isToolGroup(msg) && msg.role == 'info'"
        :message="msg"
      ></InteractionBlockInfoMessage>
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
      gap: 0.75rem;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;

      > .ts {
        color: var(--muted);
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
