<script setup lang="ts">
  import { Interaction } from '@stina/chat';
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import InteractionBlockAiMessage from './InteractionBlock.AiMessage.vue';
  import InteractionBlockDebugMessage from './InteractionBlock.DebugMessage.vue';
  import InteractionBlockInfoMessage from './InteractionBlock.InfoMessage.vue';
  import InteractionBlockInstructionsMessage from './InteractionBlock.InstructionsMessage.vue';
  import InteractionBlockToolUsage from './InteractionBlock.ToolUsage.vue';
  import InteractionBlockUserMessage from './InteractionBlock.UserMessage.vue';

  defineProps<{
    interaction: Interaction;
    active: boolean;
  }>();

  const isDebugMode = ref(false);

  onMounted(async () => {
    const settings = await window.stina.settings.get();
    isDebugMode.value = settings.advanced?.debugMode ?? false;
  });
</script>

<template>
  <div class="interaction" :class="{ active }">
    <div v-if="isDebugMode" class="interaction-id">
      <span>{{ t('chat.debug.id') }}&colon;</span>
      <span>{{ interaction.id }}</span>
    </div>
    <template v-for="msg in interaction.messages" :key="msg.id">
      <InteractionBlockInstructionsMessage
        v-if="msg.role == 'instructions' && isDebugMode"
        :message="msg"
      ></InteractionBlockInstructionsMessage>
      <InteractionBlockUserMessage
        v-else-if="msg.role == 'user'"
        :message="msg"
      ></InteractionBlockUserMessage>
      <InteractionBlockAiMessage
        v-else-if="msg.role == 'assistant'"
        :message="msg"
      ></InteractionBlockAiMessage>
      <InteractionBlockToolUsage
        v-else-if="msg.role == 'tool'"
        :message="msg"
      ></InteractionBlockToolUsage>
      <InteractionBlockInfoMessage
        v-else-if="msg.role == 'info'"
        :message="msg"
      ></InteractionBlockInfoMessage>
      <InteractionBlockDebugMessage
        v-if="msg.role == 'debug' && isDebugMode"
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

    > .interaction-id {
      display: flex;
      gap: 1em;
      font-size: 0.75rem;
      font-family: monospace;
    }

    &.active {
      opacity: 1;
    }
  }
</style>
