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

    > .header {
      margin-right: 1rem;
    }
  }
</style>
