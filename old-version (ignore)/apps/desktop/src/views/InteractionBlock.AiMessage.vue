<script setup lang="ts">
  import type { InteractionMessage } from '@stina/chat/types';

  import MarkDown from '../components/MarkDown.vue';
  import ChatMessageHeader from '../components/chat/ChatMessageHeader.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="ai-message">
    <ChatMessageHeader>Stina</ChatMessageHeader>
    <MarkDown class="message" :content="message.content" />
  </div>
</template>

<style scoped>
  .ai-message {
    background: linear-gradient(to left, hsl(0 0% 100% / 0.02) 0%, transparent 100%);
    padding: 1rem 2rem 2rem 2rem;

    > .header {
      margin-left: 1rem;
    }
    > .message {
      font-size: 1rem;
      font-weight: var(--font-weight-light);
    }
  }
</style>
