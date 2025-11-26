<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';

  import MarkDown from '../components/MarkDown.vue';
  import ChatMessageHeader from '../components/chat/ChatMessageHeader.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="ai-message">
    <ChatMessageHeader>Stina</ChatMessageHeader>
    <MarkDown :content="message.content" />
  </div>
</template>

<style scoped>
  .ai-message {
    > .header {
      margin-left: 1rem;
    }
  }
</style>
