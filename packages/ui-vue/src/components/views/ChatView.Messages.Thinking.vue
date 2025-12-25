<script setup lang="ts">
import Icon from '../common/Icon.vue'
import MarkDown from '../common/MarkDown.vue'

defineProps<{
  message: string
}>()
</script>

<template>
  <div class="thinking">
    <Icon name="bubble-chat-temporary" size="24" class="icon" />
    <MarkDown class="content" :content="message" />
  </div>
</template>

<style scoped>
.thinking {
  border: 1px solid var(--secondary);
  padding: 1rem 2rem;
  background-color: hsla(0, 0%, 100%, 0.05);
  font-size: 0.85rem;

  > .content {
    font-family: monospace;
  }
}
</style>
