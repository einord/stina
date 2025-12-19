<script setup lang="ts">
  import type { InteractionMessage } from '@stina/chat/types';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="info-message">
    {{ message.content }}
  </div>
</template>

<style scoped>
  .info-message {
    width: 100%;
    text-align: center;
    padding: 1rem;
    font-style: italic;
  }
</style>
