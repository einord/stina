<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';

  import MarkDown from '../components/MarkDown.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="ai-message">
    <div class="div">Stina:</div>
    <MarkDown v-html="message.content"></MarkDown>
  </div>
</template>

<style scoped>
  .ai-message {
  }
</style>
