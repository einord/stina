<script setup lang="ts">
  import { Interaction } from '@stina/store';

  import ChatViewAiMessage from './ChatView.AiMessage.vue';
  import ChatViewDebugMessage from './ChatView.DebugMessage.vue';
  import ChatViewInfoMessage from './ChatView.InfoMessage.vue';
  import ChatViewInstructionsMessage from './ChatView.InstructionsMessage.vue';
  import ChatViewToolUsage from './ChatView.ToolUsage.vue';
  import ChatViewUserMessage from './ChatView.UserMessage.vue';

  defineProps<{
    interaction: Interaction;
  }>();
</script>

<template>
  <div class="interaction">
    <div class="id">{{ interaction.id }}</div>
    <template v-for="msg in interaction.messages" :key="msg.id">
      <ChatViewInstructionsMessage
        v-if="msg.role == 'instructions'"
        :message="msg"
      ></ChatViewInstructionsMessage>
      <ChatViewUserMessage v-else-if="msg.role == 'user'" :message="msg"></ChatViewUserMessage>
      <ChatViewAiMessage v-else-if="msg.role == 'assistant'" :message="msg"></ChatViewAiMessage>
      <ChatViewToolUsage v-else-if="msg.role == 'tool'" :message="msg"></ChatViewToolUsage>
      <ChatViewInfoMessage v-else-if="msg.role == 'info'" :message="msg"></ChatViewInfoMessage>
      <ChatViewDebugMessage v-else-if="msg.role == 'debug'" :message="msg"></ChatViewDebugMessage>
      <div v-else>OTHER ({{ msg.role }}): {{ msg.content }}</div>
    </template>
  </div>
</template>

<style scoped>
  .interaction {
    padding: var(--space-4);
    background-color: var(--interaction-bg);

    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
</style>
