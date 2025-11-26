<script setup lang="ts">
  import type { InteractionMessage } from '@stina/chat/types';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="info-message">
    <div>Info:</div>
    {{ message.content }}
  </div>
</template>

<style scoped>
  .info-message {
    padding: 1rem;
  }
</style>
