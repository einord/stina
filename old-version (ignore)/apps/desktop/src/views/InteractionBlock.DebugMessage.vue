<script setup lang="ts">
  import type { InteractionMessage } from '@stina/chat/types';

  import MarkDown from '../components/MarkDown.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="debug-message">
    <div>Debug:</div>
    <MarkDown :content="message.content" />
  </div>
</template>

<style scoped>
  .debug-message {
    padding: 1rem;
  }
</style>
