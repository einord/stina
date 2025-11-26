<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';

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
