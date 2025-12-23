<script setup lang="ts">
import MarkDown from '../common/MarkDown.vue'
import ChatViewMessagesHeader from './ChatView.Messages.Header.vue'

defineProps<{
  message: string
}>()
</script>

<template>
  <div class="user">
    <ChatViewMessagesHeader>{{ $t('chat.you') }}</ChatViewMessagesHeader>
    <MarkDown class="message-content">{{ message }}</MarkDown>
  </div>
</template>

<style scoped>
.user {
  text-align: right;
  background: linear-gradient(to right, hsl(0 0% 100% / 0.02) 0%, transparent 100%);
  padding: 1rem 2rem;

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
