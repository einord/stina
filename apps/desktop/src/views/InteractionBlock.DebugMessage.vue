<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';

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
