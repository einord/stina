<script setup lang="ts">
  import { Interaction } from '@stina/chat';
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import ChatViewAiMessage from './ChatView.AiMessage.vue';
  import ChatViewDebugMessage from './ChatView.DebugMessage.vue';
  import ChatViewInfoMessage from './ChatView.InfoMessage.vue';
  import ChatViewInstructionsMessage from './ChatView.InstructionsMessage.vue';
  import ChatViewToolUsage from './ChatView.ToolUsage.vue';
  import ChatViewUserMessage from './ChatView.UserMessage.vue';

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
      <ChatViewInstructionsMessage
        v-if="msg.role == 'instructions' && isDebugMode"
        :message="msg"
      ></ChatViewInstructionsMessage>
      <ChatViewUserMessage v-else-if="msg.role == 'user'" :message="msg"></ChatViewUserMessage>
      <ChatViewAiMessage v-else-if="msg.role == 'assistant'" :message="msg"></ChatViewAiMessage>
      <ChatViewToolUsage v-else-if="msg.role == 'tool'" :message="msg"></ChatViewToolUsage>
      <ChatViewInfoMessage v-else-if="msg.role == 'info'" :message="msg"></ChatViewInfoMessage>
      <ChatViewDebugMessage
        v-if="msg.role == 'debug' && isDebugMode"
        :message="msg"
      ></ChatViewDebugMessage>
      <!-- <div v-else>OTHER: ({{ msg.role }}): {{ msg.content }}</div> -->
    </template>
  </div>
</template>

<style scoped>
  .interaction {
    padding: var(--space-4);
    background-color: var(--interaction-bg);
    color: var(--interaction-fg);
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);

    opacity: 0.45;

    > .interaction-id {
      display: flex;
      gap: var(--space-1);
    }

    &.active {
      opacity: 1;
    }
  }
</style>
