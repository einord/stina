<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';

  import MarkDown from '../components/MarkDown.vue';
  import ChatMessageHeader from '../components/chat/ChatMessageHeader.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="user-message">
    <ChatMessageHeader>Du</ChatMessageHeader>
    <MarkDown>{{ message.content }}</MarkDown>
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
  }
</style>
