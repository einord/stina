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
    <ChatMessageHeader>Stina:</ChatMessageHeader>
    <MarkDown v-html="message.content"></MarkDown>
  </div>
</template>

<style scoped>
  .ai-message {
  }
</style>
