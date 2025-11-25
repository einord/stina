<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="tool-usage">
    <div><i-hugeicons-wrench-01 /></div>
    {{ message.content }}
  </div>
</template>

<style scoped>
  .tool-usage {
    display: inline-flex;
    width: fit-content;
    gap: 0.5rem;
    border: 1px solid var(--secondary);
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
  }
</style>
