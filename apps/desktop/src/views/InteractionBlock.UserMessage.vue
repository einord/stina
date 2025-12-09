<script setup lang="ts">
  import type { InteractionMessage } from '@stina/chat/types';

  import MarkDown from '../components/MarkDown.vue';
  import ChatMessageHeader from '../components/chat/ChatMessageHeader.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="user-message">
    <ChatMessageHeader>Du</ChatMessageHeader>
    <MarkDown class="message-content">{{ message.content }}</MarkDown>
  </div>
</template>

<style scoped>
  .user-message {
    text-align: right;
    background: linear-gradient(to right, hsl(0 0% 100% / 0.02) 0%, transparent 100%);
    padding: 1rem;

    > .header {
      margin-right: 1rem;
    }

    > .message-content {
      width: fit-content; /* Makes numbered and bulleted lists align properly to the right without taking all the horizontal width */
      max-width: 100%;
      margin-left: auto;
    }
  }
</style>
