<script setup lang="ts">
import MarkDown from '../common/MarkDown.vue'
import ChatViewMessagesHeader from './ChatView.Messages.Header.vue'

defineProps<{
  message: string
  isError?: boolean
}>()
</script>

<template>
  <div class="stina" :class="{ error: isError }">
    <ChatViewMessagesHeader class="header">{{ $t('chat.stina') }}</ChatViewMessagesHeader>
    <MarkDown class="message" :content="message" />
  </div>
</template>

<style scoped>
.stina {
  background: linear-gradient(to left, hsl(0 0% 100% / 0.02) 0%, transparent 100%);
  padding: 1rem 2rem 2rem 2rem;
  font-size: 1rem;

  > .header {
    margin-left: 1rem;
  }
  > .message {
    font-weight: var(--font-weight-light);
  }

  &.error {
    background: linear-gradient(to left, hsl(0 50% 30% / 0.15) 0%, transparent 100%);
    border-left: 3px solid hsl(0 60% 50%);

    > .message {
      color: hsl(0 40% 70%);
    }
  }
}
</style>
